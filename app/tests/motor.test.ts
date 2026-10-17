import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { BaseLocal } from "@/db/local";
import { guardar } from "@/db/repositorio";
import type { Calificacion, Periodo } from "@/db/tipos";
import { MAX_INTENTOS, MotorSync, descartarCambio, espera, reintentarRechazado } from "@/sync/motor";
import { ServidorDemo, TransporteDemo } from "@/sync/transporte-demo";

let n = 0;
let servidor: ServidorDemo;
let online: boolean;

const COL = "col-1";
const PER_ABIERTO: Periodo = { id: "per-1", colegio_id: COL, anio_id: "a", numero: 1, nombre: "I Bimestre", inicio: "", fin: "", estado: "abierto" };
const PER_CERRADO: Periodo = { ...PER_ABIERTO, id: "per-2", numero: 2, nombre: "II Bimestre", estado: "cerrado" };

function equipo(usuario = "u-1") {
  const db = new BaseLocal(`equipo-${++n}`);
  const motor = new MotorSync(db, new TransporteDemo(servidor, () => usuario, () => online));
  return { db, motor };
}

function nota(extra: Partial<Calificacion> = {}): Partial<Calificacion> {
  return { id: "cal-1", estudiante_id: "e-1", competencia_id: "c-1", periodo_id: PER_ABIERTO.id, seccion_id: "s-1", nivel_logro: "A", conclusion: null, ...extra };
}

beforeEach(async () => {
  servidor = new ServidorDemo(`servidor-${++n}`);
  await servidor.sembrar({ periodo: [PER_ABIERTO, PER_CERRADO] });
  online = true;
});

describe("motor de sincronización", () => {
  it("guarda sin conexión y fusiona ediciones de la misma fila en un solo cambio", async () => {
    online = false;
    const { db, motor } = equipo();
    await guardar(db, "calificacion", nota(), COL);
    await guardar(db, "calificacion", { id: "cal-1", nivel_logro: "B", conclusion: "Necesita apoyo" }, COL);

    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].parche).toMatchObject({ nivel_logro: "B", conclusion: "Necesita apoyo", estudiante_id: "e-1" });

    const r = await motor.sincronizar();
    expect(r.error).toBe("Sin conexión");
    expect(await db.outbox.count()).toBe(1);
    expect((await db.tabla("calificacion").get("cal-1"))?.nivel_logro).toBe("B");
  });

  it("al volver la conexión envía, vacía el outbox y recibe la hora del servidor", async () => {
    online = false;
    const { db, motor } = equipo("docente-1");
    await guardar(db, "calificacion", nota(), COL);
    online = true;

    const r = await motor.sincronizar();
    expect(r).toMatchObject({ enviados: 1, rechazados: 0, error: null });
    expect(await db.outbox.count()).toBe(0);
    const enServidor = await servidor.tabla("calificacion").get("cal-1");
    expect(enServidor).toMatchObject({ nivel_logro: "A", updated_by: "docente-1", colegio_id: COL });
    expect((await db.tabla("calificacion").get("cal-1"))?.updated_at).toBe(enServidor!.updated_at);
  });

  it("rechaza notas de un periodo cerrado y permite descartar volviendo al valor anterior", async () => {
    const { db, motor } = equipo();
    await guardar(db, "calificacion", nota({ id: "cal-2", periodo_id: PER_CERRADO.id }), COL);
    const r = await motor.sincronizar();
    expect(r.rechazados).toBe(1);

    const [e] = await db.outbox.toArray();
    expect(e.estado).toBe("rechazado");
    expect(e.error).toMatch(/cerrado/);
    // Un rechazado no bloquea el resto ni se pierde.
    expect(await db.tabla("calificacion").get("cal-2")).toBeDefined();

    await descartarCambio(db, e.id!);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.tabla("calificacion").get("cal-2")).toBeUndefined();
  });

  it("un rechazado se puede reintentar cuando el director reabre el periodo", async () => {
    const { db, motor } = equipo();
    await guardar(db, "calificacion", nota({ id: "cal-3", periodo_id: PER_CERRADO.id }), COL);
    await motor.sincronizar();
    const [e] = await db.outbox.toArray();

    await servidor.aplicar("periodo", { id: PER_CERRADO.id, estado: "abierto", motivo_reapertura: "Corrección" }, "director");
    await reintentarRechazado(db, e.id!);
    const r = await motor.sincronizar();
    expect(r.enviados).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it("si la red falla a mitad del envío, el cambio queda pendiente con espera creciente", async () => {
    const { db } = equipo();
    const ahora = 1_000_000;
    const motor = new MotorSync(db, {
      disponible: () => true,
      push: async () => { throw new Error("Tiempo de espera agotado"); },
      pull: async () => ({ filas: {}, cursor: "x", hay_mas: false }),
    }, { ahora: () => ahora });
    await guardar(db, "calificacion", nota(), COL);

    const r = await motor.sincronizar();
    expect(r.error).toMatch(/agotado/);
    const [e] = await db.outbox.toArray();
    expect(e).toMatchObject({ estado: "pendiente", intentos: 1, proximo_intento: ahora + espera(1) });
    expect(espera(3)).toBeGreaterThan(espera(2));
    expect(espera(50)).toBe(10 * 60_000);
  });

  it("no pisa cambios locales pendientes con lo que llega del servidor", async () => {
    const a = equipo("docente-a");
    const b = equipo("docente-b");
    await guardar(a.db, "calificacion", nota(), COL);
    await a.motor.sincronizar();
    await b.motor.sincronizar();

    online = false;
    await guardar(b.db, "calificacion", { id: "cal-1", nivel_logro: "AD" }, COL);
    online = true;
    await guardar(a.db, "calificacion", { id: "cal-1", nivel_logro: "C", conclusion: "x" }, COL);
    await a.motor.sincronizar();

    const r = await b.motor.sincronizar();
    expect(r.enviados).toBe(1);
    // El último en llegar al servidor gana en el campo editado.
    expect((await servidor.tabla("calificacion").get("cal-1"))?.nivel_logro).toBe("AD");
    // La conclusión que escribió A se conserva: el parche de B solo traía nivel_logro.
    expect((await servidor.tabla("calificacion").get("cal-1"))?.conclusion).toBe("x");
  });

  it("guarda la versión del servidor como sombra y la restaura al descartar", async () => {
    const a = equipo();
    const b = equipo();
    await guardar(a.db, "calificacion", nota({ id: "cal-9", periodo_id: PER_CERRADO.id, nivel_logro: "A" }), COL);
    await servidor.aplicar("calificacion", { ...nota({ id: "cal-9", periodo_id: PER_CERRADO.id, nivel_logro: "B", conclusion: "ok" }) }, "director", false);
    await b.motor.sincronizar();

    // B edita en un periodo cerrado: será rechazado y debe volver a la versión del servidor.
    await guardar(b.db, "calificacion", { id: "cal-9", nivel_logro: "AD" }, COL);
    await b.motor.sincronizar();
    const [e] = await b.db.outbox.toArray();
    expect(e.estado).toBe("rechazado");

    await descartarCambio(b.db, e.id!);
    expect((await b.db.tabla("calificacion").get("cal-9"))?.nivel_logro).toBe("B");
    void a;
  });

  it("dos sincronizaciones simultáneas no envían el mismo cambio dos veces", async () => {
    const { db, motor } = equipo();
    await guardar(db, "calificacion", nota(), COL);
    const [r1, r2] = await Promise.all([motor.sincronizar(), motor.sincronizar()]);
    expect(r1).toBe(r2);
    expect(r1.enviados).toBe(1);
  });

  it("si llega del servidor una fila con cambio local pendiente, la guarda como sombra sin pisarla", async () => {
    const db = new BaseLocal(`equipo-${++n}`);
    const delServidor = { ...nota({ nivel_logro: "C", conclusion: "del servidor" }), colegio_id: COL, updated_at: "2026-10-01T00:00:00.000Z" };
    const motor = new MotorSync(db, {
      disponible: () => true,
      push: async (cs) => cs.map((c) => ({ ref: c.ref, estado: "reintentar" as const, motivo: "ocupado" })),
      pull: async () => ({ filas: { calificacion: [delServidor as Calificacion] }, cursor: "c1", hay_mas: false }),
    });
    await guardar(db, "calificacion", nota({ nivel_logro: "AD" }), COL);
    await motor.sincronizar();

    expect((await db.tabla("calificacion").get("cal-1"))?.nivel_logro).toBe("AD");
    expect((await db.sombra.get("calificacion:cal-1"))?.fila).toMatchObject({ nivel_logro: "C" });
    const [e] = await db.outbox.toArray();
    expect(e).toMatchObject({ estado: "pendiente", error: "ocupado" });
  });

  it("deja de insistir tras muchos reintentos y lo muestra como no aceptado", async () => {
    const db = new BaseLocal(`equipo-${++n}`);
    let t = 0;
    const motor = new MotorSync(db, {
      disponible: () => true,
      push: async (cs) => cs.map((c) => ({ ref: c.ref, estado: "reintentar" as const, motivo: "La clase todavía no se sincroniza" })),
      pull: async () => ({ filas: {}, cursor: "c", hay_mas: false }),
    }, { ahora: () => t });
    await guardar(db, "asistencia", { id: "a1", sesion_id: "x", estudiante_id: "e", estado: "P", origen: "qr" }, COL);
    for (let i = 0; i < MAX_INTENTOS; i++) {
      t += 60 * 60_000;
      await motor.sincronizar();
    }
    const [e] = await db.outbox.toArray();
    expect(e.estado).toBe("rechazado");
    expect(e.error).toMatch(/tras 30 intentos: La clase todavía no se sincroniza/);
  });
});
