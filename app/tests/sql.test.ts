// Pruebas del servidor: aplica las migraciones reales sobre Postgres (PGlite) y verifica
// permisos por rol, reglas de negocio y las funciones de sincronización.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { codigoCorto, crearTokenQr, leerTokenQr, tokenDeCodigo, ventanaDe } from "@/dominio/qr";

const DIR = resolve(__dirname, "../../supabase/migrations");

// Identificadores de prueba.
const U = {
  director: "10000000-0000-4000-8000-000000000001",
  docente: "10000000-0000-4000-8000-000000000002",
  estudiante: "10000000-0000-4000-8000-000000000003",
  apoderado: "10000000-0000-4000-8000-000000000004",
  ugel: "10000000-0000-4000-8000-000000000005",
  otroColegio: "10000000-0000-4000-8000-000000000006",
};
const COL = "20000000-0000-4000-8000-000000000001";
const COL2 = "20000000-0000-4000-8000-000000000002";
const ANIO = "30000000-0000-4000-8000-000000000001";
const PER_ABIERTO = "31000000-0000-4000-8000-000000000001";
const PER_CERRADO = "31000000-0000-4000-8000-000000000002";
const GRADO = "32000000-0000-4000-8000-000000000001";
const SEC = "33000000-0000-4000-8000-000000000001";
const SEC_OTRA = "33000000-0000-4000-8000-000000000002";
const MAT_SEC = "a0000000-0000-4000-8000-00000000000b"; // Matemática secundaria (CNEB)
const C_MAT = "c0000000-0000-4000-8000-00000b000017";   // Resuelve problemas de cantidad (23)
const C_COM = "c0000000-0000-4000-8000-00000c000005";   // Se comunica oralmente (5)
const E1 = "40000000-0000-4000-8000-000000000001"; // hijo del apoderado, con usuario estudiante
const E2 = "40000000-0000-4000-8000-000000000002"; // otro estudiante de la misma sección
const E3 = "40000000-0000-4000-8000-000000000003"; // estudiante de otra sección

let db: PGlite;

async function como<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

async function push(uid: string, cambios: { tabla: string; parche: Record<string, unknown> }[]) {
  return como(uid, async () => {
    const r = await db.query<{ r: { ref: number; estado: string; motivo?: string }[] }>(
      "select sync_push($1::jsonb) as r",
      [cambios.map((c, i) => ({ ref: i + 1, ...c }))],
    );
    return r.rows[0].r;
  });
}

type Pull = { filas: Record<string, { id: string; [k: string]: unknown }[]>; cursor: string; hay_mas: boolean };
async function pull(uid: string, desde: string | null = null, limite = 1000): Promise<Pull> {
  return como(uid, async () => (await db.query<{ r: Pull }>("select sync_pull($1, $2) as r", [desde, limite])).rows[0].r);
}

const nota = (id: string, extra: Record<string, unknown> = {}) => ({
  tabla: "calificacion",
  parche: { id, colegio_id: COL, estudiante_id: E1, competencia_id: C_MAT, periodo_id: PER_ABIERTO, seccion_id: SEC, nivel_logro: "A", ...extra },
});
let nNota = 0;
const idNota = () => `50000000-0000-4000-8000-${(++nNota).toString(16).padStart(12, "0")}`;

beforeAll(async () => {
  db = new PGlite();
  // Lo que Supabase ya trae: roles, esquema auth y auth.uid().
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
  `);
  for (const f of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(resolve(DIR, f), "utf8"));
  }

  // Datos de prueba (como administrador, sin RLS).
  await db.exec(`
    insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(",")};
    insert into colegio (id, colegio_id, nombre) values ('${COL}', '${COL}', 'IE Prueba'), ('${COL2}', '${COL2}', 'IE Otra');
    insert into usuario (id, colegio_id, nombres, apellidos, roles) values
      ('${U.director}', '${COL}', 'Dir', 'Uno', '{director}'),
      ('${U.docente}', '${COL}', 'Doc', 'Uno', '{docente,tutor}'),
      ('${U.estudiante}', '${COL}', 'Est', 'Uno', '{estudiante}'),
      ('${U.apoderado}', '${COL}', 'Apo', 'Uno', '{apoderado}'),
      ('${U.ugel}', '${COL}', 'Ugel', 'Uno', '{ugel}'),
      ('${U.otroColegio}', '${COL2}', 'Dir', 'Otro', '{director}');
    insert into anio_escolar (id, colegio_id, anio, regimen, activo) values ('${ANIO}', '${COL}', 2026, 'bimestre', true);
    insert into periodo (id, colegio_id, anio_id, numero, nombre, inicio, fin, estado) values
      ('${PER_ABIERTO}', '${COL}', '${ANIO}', 3, 'III Bimestre', '2026-08-10', '2026-10-09', 'abierto'),
      ('${PER_CERRADO}', '${COL}', '${ANIO}', 1, 'I Bimestre', '2026-03-16', '2026-05-15', 'cerrado');
    insert into grado (id, colegio_id, nivel, numero, nombre) values ('${GRADO}', '${COL}', 'secundaria', 2, '2.º año');
    insert into seccion (id, colegio_id, anio_id, grado_id, letra, tutor_id) values
      ('${SEC}', '${COL}', '${ANIO}', '${GRADO}', 'B', '${U.docente}'),
      ('${SEC_OTRA}', '${COL}', '${ANIO}', '${GRADO}', 'C', null);
    insert into docente_asignacion (id, colegio_id, docente_id, seccion_id, area_id) values
      ('34000000-0000-4000-8000-000000000001', '${COL}', '${U.docente}', '${SEC}', '${MAT_SEC}');
    insert into estudiante (id, colegio_id, usuario_id, nombres, apellidos, codigo_carne) values
      ('${E1}', '${COL}', '${U.estudiante}', 'Luis', 'M', 'C1'),
      ('${E2}', '${COL}', null, 'Ana', 'C', 'C2'),
      ('${E3}', '${COL}', null, 'Juan', 'V', 'C3');
    insert into matricula (id, colegio_id, anio_id, seccion_id, estudiante_id) values
      ('35000000-0000-4000-8000-000000000001', '${COL}', '${ANIO}', '${SEC}', '${E1}'),
      ('35000000-0000-4000-8000-000000000002', '${COL}', '${ANIO}', '${SEC}', '${E2}'),
      ('35000000-0000-4000-8000-000000000003', '${COL}', '${ANIO}', '${SEC_OTRA}', '${E3}');
    insert into apoderado (id, colegio_id, usuario_id, nombres, apellidos) values
      ('36000000-0000-4000-8000-000000000001', '${COL}', '${U.apoderado}', 'Rosa', 'Q');
    insert into estudiante_apoderado (id, colegio_id, estudiante_id, apoderado_id, parentesco) values
      ('37000000-0000-4000-8000-000000000001', '${COL}', '${E1}', '36000000-0000-4000-8000-000000000001', 'Madre');
  `);
});

describe("esquema", () => {
  it("aplica todas las migraciones y carga el catálogo CNEB", async () => {
    const r = await db.query<{ a: number; c: number }>("select (select count(*) from area)::int a, (select count(*) from competencia)::int c");
    expect(r.rows[0]).toEqual({ a: 22, c: 61 });
  });
});

describe("sync_push", () => {
  it("el docente califica su área: queda con hora y autor del servidor, y en auditoría", async () => {
    const id = idNota();
    expect(await push(U.docente, [nota(id)])).toEqual([{ ref: 1, estado: "ok" }]);
    const f = (await db.query<{ updated_by: string; eliminado: boolean }>("select updated_by, eliminado from calificacion where id = $1", [id])).rows[0];
    expect(f).toEqual({ updated_by: U.docente, eliminado: false });
    const a = await db.query("select * from auditoria where fila_id = $1", [id]);
    expect(a.rows).toHaveLength(1);
  });

  it("fusiona por campo: un parche parcial no borra los otros campos", async () => {
    const id = idNota();
    await push(U.docente, [nota(id, { estudiante_id: E2, nivel_logro: "B" })]);
    expect(await push(U.docente, [{ tabla: "calificacion", parche: { id, conclusion: "Necesita apoyo" } }])).toEqual([{ ref: 1, estado: "ok" }]);
    const f = (await db.query<{ nivel_logro: string; conclusion: string }>("select nivel_logro, conclusion from calificacion where id = $1", [id])).rows[0];
    expect(f).toEqual({ nivel_logro: "B", conclusion: "Necesita apoyo" });
  });

  it("rechaza calificar un área que el docente no tiene asignada", async () => {
    const [r] = await push(U.docente, [nota(idNota(), { competencia_id: C_COM })]);
    expect(r).toMatchObject({ estado: "rechazado", motivo: "Sin permiso para este cambio" });
  });

  it("la misma nota (estudiante, competencia, periodo) con otro id se rechaza: no hay duplicados", async () => {
    const [r] = await push(U.docente, [nota(idNota())]);
    expect(r).toMatchObject({ estado: "rechazado", motivo: "Ya existe un registro igual" });
  });

  it("rechaza notas en un periodo cerrado con un mensaje claro", async () => {
    const [r] = await push(U.docente, [nota(idNota(), { periodo_id: PER_CERRADO })]);
    expect(r.estado).toBe("rechazado");
    expect(r.motivo).toMatch(/I Bimestre está cerrado/);
  });

  it("un estudiante no puede ponerse notas", async () => {
    const [r] = await push(U.estudiante, [nota(idNota(), { nivel_logro: "AD" })]);
    expect(r.estado).toBe("rechazado");
  });

  it("un director de otro colegio no puede escribir en este", async () => {
    const [r] = await push(U.otroColegio, [nota(idNota())]);
    expect(r.estado).toBe("rechazado");
  });

  it("procesa cada cambio por separado: uno malo no tumba el lote", async () => {
    const r = await push(U.docente, [nota(idNota(), { estudiante_id: E2, competencia_id: "c0000000-0000-4000-8000-00000b00001a" }), { tabla: "auditoria", parche: { id: idNota() } }, nota(idNota(), { nivel_logro: "Z" })]);
    expect(r.map((x) => x.estado)).toEqual(["ok", "rechazado", "rechazado"]);
  });

  it("no permite cerrar un periodo con B o C sin conclusión descriptiva", async () => {
    const id = idNota();
    await push(U.docente, [nota(id, { estudiante_id: E2, competencia_id: "c0000000-0000-4000-8000-00000b000018", nivel_logro: "C" })]);
    const [r1] = await push(U.director, [{ tabla: "periodo", parche: { id: PER_ABIERTO, estado: "cerrado" } }]);
    expect(r1.estado).toBe("rechazado");
    expect(r1.motivo).toMatch(/faltan 1 conclusiones/);

    await push(U.docente, [{ tabla: "calificacion", parche: { id, conclusion: "Requiere acompañamiento" } }]);
    const [r2] = await push(U.director, [{ tabla: "periodo", parche: { id: PER_ABIERTO, estado: "cerrado" } }]);
    expect(r2.estado).toBe("ok");
    // Reabrir exige un motivo.
    const [sinMotivo] = await push(U.director, [{ tabla: "periodo", parche: { id: PER_ABIERTO, estado: "abierto" } }]);
    expect(sinMotivo.motivo).toMatch(/indique el motivo/);
    const [conMotivo] = await push(U.director, [{ tabla: "periodo", parche: { id: PER_ABIERTO, estado: "abierto", motivo_reapertura: "Corrección de nota de un estudiante" } }]);
    expect(conMotivo.estado).toBe("ok");
  });

  it("un docente no puede cerrar periodos", async () => {
    const [r] = await push(U.docente, [{ tabla: "periodo", parche: { id: PER_ABIERTO, estado: "cerrado" } }]);
    expect(r).toMatchObject({ estado: "rechazado" });
  });
});

describe("sync_pull y RLS", () => {
  it("el estudiante solo recibe sus propias notas y no ve a otras familias", async () => {
    const r = await pull(U.estudiante);
    const notas = r.filas.calificacion ?? [];
    expect(notas.length).toBeGreaterThan(0);
    expect(notas.every((n) => n.estudiante_id === E1)).toBe(true);
    expect((r.filas.estudiante ?? []).map((e) => e.id)).toEqual([E1]);
    const usuarios = (r.filas.usuario ?? []).map((u) => u.id);
    expect(usuarios).toContain(U.estudiante);
    expect(usuarios).toContain(U.docente);
    expect(usuarios).not.toContain(U.apoderado);
  });

  it("el apoderado ve las notas de su hijo", async () => {
    const r = await pull(U.apoderado);
    expect((r.filas.estudiante ?? []).map((e) => e.id)).toEqual([E1]);
    expect((r.filas.calificacion ?? []).every((n) => n.estudiante_id === E1)).toBe(true);
  });

  it("el docente ve solo a los estudiantes de sus secciones", async () => {
    const ids = ((await pull(U.docente)).filas.estudiante ?? []).map((e) => e.id).sort();
    expect(ids).toEqual([E1, E2].sort());
  });

  it("la UGEL y el director ven todo su colegio, y nada de otro colegio", async () => {
    for (const u of [U.ugel, U.director]) {
      const r = await pull(u);
      expect((r.filas.estudiante ?? []).length).toBe(3);
      expect((r.filas.colegio ?? []).map((c) => c.id)).toEqual([COL]);
    }
    const otro = await pull(U.otroColegio);
    expect(otro.filas.estudiante).toBeUndefined();
  });

  it("todos reciben el catálogo CNEB", async () => {
    expect((await pull(U.estudiante)).filas.area?.length).toBe(22);
  });

  it("es incremental y pagina cuando hay muchas filas", async () => {
    const total = (await pull(U.director)).filas.competencia!.length;
    let cursor: string | null = null;
    const vistas = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const r = await pull(U.director, cursor, 20);
      (r.filas.competencia ?? []).forEach((c) => vistas.add(c.id));
      if (!r.hay_mas) break;
      cursor = r.cursor;
    }
    expect(vistas.size).toBe(total);

    // Después de sincronizar, una nueva consulta solo trae lo reciente.
    const ahora = await pull(U.docente);
    const id = idNota();
    await new Promise((r) => setTimeout(r, 5));
    await push(U.docente, [nota(id, { estudiante_id: E2, competencia_id: "c0000000-0000-4000-8000-00000b000019" })]);
    // El cursor final está 60 s atrás a propósito; para la prueba se avanza a "ahora".
    const ts = Date.parse(ahora.cursor.split("|")[0]) + 60_000;
    const nuevo = await pull(U.docente, `${new Date(ts).toISOString()}|`);
    expect((nuevo.filas.calificacion ?? []).map((c) => c.id)).toEqual([id]);
  });

  it("sin sesión no se puede sincronizar", async () => {
    await expect(pull(null as unknown as string)).rejects.toThrow(/Sesión no válida/);
  });

  it("solo dirección y UGEL leen la auditoría", async () => {
    const leer = (u: string) => como(u, async () => (await db.query("select count(*)::int n from auditoria")).rows[0] as { n: number });
    expect((await leer(U.director)).n).toBeGreaterThan(0);
    expect((await leer(U.docente)).n).toBe(0);
  });
});

describe("notas por capacidad", () => {
  it("guarda las capacidades junto con la nota y rechaza valores inválidos", async () => {
    const id = idNota();
    const ok = await push(U.docente, [nota(id, { competencia_id: "c0000000-0000-4000-8000-00000b000018", capacidades: { 1: "B", 2: "A", 3: "A", 4: "A" }, nivel_logro: "A" })]);
    expect(ok[0]).toEqual({ ref: 1, estado: "ok" });
    const { rows } = await db.query<{ capacidades: Record<string, string> }>("select capacidades from calificacion where id = $1", [id]);
    expect(rows[0].capacidades).toEqual({ 1: "B", 2: "A", 3: "A", 4: "A" });
    const mal = await push(U.docente, [{ tabla: "calificacion", parche: { id, capacidades: { 1: "Z" } } }]);
    expect(mal[0].estado).toBe("rechazado");
  });
});

describe("listas de cotejo", () => {
  it("el docente registra sus sesiones; el estudiante no las ve", async () => {
    const id = "7a000000-0000-4000-8000-000000000001";
    const r = await push(U.docente, [{ tabla: "lista_cotejo", parche: {
      id, colegio_id: COL, seccion_id: SEC, area_id: "a0000000-0000-4000-8000-00000000000b", periodo_id: PER_ABIERTO, docente_id: U.docente,
      numero: 26, titulo: "Resolviendo problemas con conjuntos", fecha: "2026-10-19",
      criterios: [{ competencia_id: C_MAT, capacidad: 1, texto: "Identifica elementos" }], notas: { [E1]: { 0: "A" } },
    } }]);
    expect(r[0]).toEqual({ ref: 1, estado: "ok" });
    expect((await pull(U.docente)).filas.lista_cotejo?.map((l) => l.id)).toEqual([id]);
    expect((await pull(U.estudiante)).filas.lista_cotejo).toBeUndefined();
    const [ajeno] = await push(U.estudiante, [{ tabla: "lista_cotejo", parche: { id, notas: {} } }]);
    expect(ajeno.estado).toBe("rechazado");
  });
});

describe("horario y tareas", () => {
  it("la dirección arma el horario y todo el colegio lo ve; un docente no lo cambia", async () => {
    const b = { id: "7b000000-0000-4000-8000-000000000001", colegio_id: COL, seccion_id: SEC, dia: 1, inicio: "08:00", fin: "08:45", area_id: "a0000000-0000-4000-8000-00000000000b", docente_id: U.docente, detalle: null };
    expect((await push(U.director, [{ tabla: "horario_clase", parche: b }]))[0]).toEqual({ ref: 1, estado: "ok" });
    expect((await pull(U.estudiante)).filas.horario_clase?.map((x) => x.id)).toEqual([b.id]);
    expect((await push(U.docente, [{ tabla: "horario_clase", parche: { id: b.id, inicio: "09:00" } }]))[0].estado).toBe("rechazado");
  });
  it("el docente deja una tarea a su sección: la ven el estudiante y su apoderado", async () => {
    const t = { id: "7c000000-0000-4000-8000-000000000001", colegio_id: COL, seccion_id: SEC, area_id: "a0000000-0000-4000-8000-00000000000b", docente_id: U.docente, titulo: "Ficha 12", descripcion: null, entrega: "2026-10-23" };
    expect((await push(U.docente, [{ tabla: "tarea", parche: t }]))[0]).toEqual({ ref: 1, estado: "ok" });
    expect((await pull(U.estudiante)).filas.tarea?.map((x) => x.id)).toEqual([t.id]);
    expect((await pull(U.apoderado)).filas.tarea?.map((x) => x.id)).toEqual([t.id]);
    expect((await push(U.estudiante, [{ tabla: "tarea", parche: { id: t.id, titulo: "Cambiada" } }]))[0].estado).toBe("rechazado");
  });
});

describe("mensajes entre el personal y la familia", () => {
  const M1 = "7d000000-0000-4000-8000-000000000001";
  const M2 = "7d000000-0000-4000-8000-000000000002";
  it("el docente escribe a la familia, el apoderado responde y nadie más los lee", async () => {
    const r1 = await push(U.docente, [{ tabla: "mensaje", parche: { id: M1, colegio_id: COL, estudiante_id: E1, personal_id: U.docente, autor_id: U.docente, texto: "Luis no trajo su tarea", enviado_en: new Date().toISOString(), leido_en: null } }]);
    expect(r1[0]).toEqual({ ref: 1, estado: "ok" });
    const r2 = await push(U.apoderado, [{ tabla: "mensaje", parche: { id: M2, colegio_id: COL, estudiante_id: E1, personal_id: U.docente, autor_id: U.apoderado, texto: "Gracias, la revisamos hoy", enviado_en: new Date().toISOString(), leido_en: null } }]);
    expect(r2[0]).toEqual({ ref: 1, estado: "ok" });
    expect((await pull(U.apoderado)).filas.mensaje?.map((m) => m.id).sort()).toEqual([M1, M2]);
    expect((await pull(U.docente)).filas.mensaje?.map((m) => m.id).sort()).toEqual([M1, M2]);
    expect((await pull(U.estudiante)).filas.mensaje).toBeUndefined();
    expect((await pull(U.director)).filas.mensaje).toBeUndefined();
  });
  it("quien recibe lo marca como leído, pero nadie cambia el texto ni escribe en nombre de otro", async () => {
    expect((await push(U.apoderado, [{ tabla: "mensaje", parche: { id: M1, leido_en: new Date().toISOString() } }]))[0].estado).toBe("ok");
    expect((await push(U.apoderado, [{ tabla: "mensaje", parche: { id: M1, texto: "cambiado" } }]))[0].estado).toBe("rechazado");
    const falso = await push(U.estudiante, [{ tabla: "mensaje", parche: { id: "7d000000-0000-4000-8000-000000000003", colegio_id: COL, estudiante_id: E1, personal_id: U.docente, autor_id: U.estudiante, texto: "hola", enviado_en: new Date().toISOString(), leido_en: null } }]);
    expect(falso[0].estado).toBe("rechazado");
  });
});

describe("entrega de tareas", () => {
  const T = "7c000000-0000-4000-8000-000000000001"; // tarea de la sección SEC (prueba de horario y tareas)
  const EN = "7e000000-0000-4000-8000-000000000001";
  it("el estudiante entrega su tarea y el docente la revisa; cada uno solo cambia lo suyo", async () => {
    const r = await push(U.estudiante, [{ tabla: "tarea_entrega", parche: { id: EN, colegio_id: COL, tarea_id: T, estudiante_id: E1, autor_id: U.estudiante, comentario: "Resolví todo", entregado_en: new Date().toISOString(), estado: "entregada", revision: null, revisado_por: null } }]);
    expect(r[0]).toEqual({ ref: 1, estado: "ok" });
    expect((await pull(U.docente)).filas.tarea_entrega?.map((x) => x.id)).toEqual([EN]);
    // El estudiante no puede darse por revisado; el docente no cambia el comentario.
    expect((await push(U.estudiante, [{ tabla: "tarea_entrega", parche: { id: EN, estado: "revisada" } }]))[0].estado).toBe("rechazado");
    expect((await push(U.docente, [{ tabla: "tarea_entrega", parche: { id: EN, comentario: "otro" } }]))[0].estado).toBe("rechazado");
    expect((await push(U.docente, [{ tabla: "tarea_entrega", parche: { id: EN, estado: "devuelta", revision: "Revisa el ejercicio 3" } }]))[0].estado).toBe("ok");
    // Devuelta: el estudiante corrige y vuelve a entregar.
    expect((await push(U.estudiante, [{ tabla: "tarea_entrega", parche: { id: EN, estado: "entregada", comentario: "Corregido" } }]))[0].estado).toBe("ok");
  });
  it("otro estudiante no ve ni entrega por alguien más", async () => {
    const r = await push(U.estudiante, [{ tabla: "tarea_entrega", parche: { id: "7e000000-0000-4000-8000-000000000002", colegio_id: COL, tarea_id: T, estudiante_id: E2, autor_id: U.estudiante, comentario: null, entregado_en: new Date().toISOString(), estado: "entregada", revision: null, revisado_por: null } }]);
    expect(r[0].estado).toBe("rechazado");
  });
});

describe("asistencia con QR", () => {
  const SESION = "60000000-0000-4000-8000-000000000001";
  const SECRETO = "secreto-de-prueba-1234567890";
  const U_EST2 = "10000000-0000-4000-8000-000000000007";
  const ahora = () => Date.now();
  const marca = (estudiante: string, token: string, extra: Record<string, unknown> = {}) => ({
    tabla: "asistencia",
    parche: {
      id: crypto.randomUUID(), colegio_id: COL, sesion_id: SESION, estudiante_id: estudiante, estado: "P", origen: "qr",
      marcado_en: new Date().toISOString(), token_qr: token, por_revisar: false, dispositivo_id: "equipo-A", ...extra,
    },
  });

  beforeAll(async () => {
    // Segundo estudiante con cuenta (E2).
    await db.exec(`
      insert into auth.users (id) values ('${U_EST2}');
      insert into usuario (id, colegio_id, nombres, apellidos, roles) values ('${U_EST2}', '${COL}', 'Ana', 'C', '{estudiante}');
      update estudiante set usuario_id = '${U_EST2}' where id = '${E2}';
    `);
  });

  it("la firma calculada en Postgres es idéntica a la de la app", async () => {
    const token = await crearTokenQr(SESION, SECRETO, 1_792_000_000_000);
    const t = leerTokenQr(token)!;
    const r = await db.query<{ f: string }>("select firma_qr($1, $2, $3) f", [SECRETO, SESION, t.ventana]);
    expect(r.rows[0].f).toBe(t.firma);
  });

  it("si la clase aún no llegó al servidor, la marca se reintenta luego (no se pierde)", async () => {
    const [r] = await push(U.estudiante, [marca(E1, await crearTokenQr(SESION, SECRETO, ahora()))]);
    expect(r.estado).toBe("reintentar");
  });

  it("el docente abre la sesión con su secreto", async () => {
    const r = await push(U.docente, [
      { tabla: "asistencia_sesion", parche: { id: SESION, colegio_id: COL, seccion_id: SEC, area_id: null, docente_id: U.docente, fecha: "2026-10-19", modo: "qr", abierta_en: ahora() - 60_000, estado: "abierta" } },
      { tabla: "asistencia_secreto", parche: { id: SESION, colegio_id: COL, sesion_id: SESION, docente_id: U.docente, secreto: SECRETO } },
    ]);
    expect(r.map((x) => x.estado)).toEqual(["ok", "ok"]);
  });

  it("el estudiante marca con un código válido y queda presente", async () => {
    const m = marca(E1, await crearTokenQr(SESION, SECRETO, ahora()));
    expect((await push(U.estudiante, [m]))[0].estado).toBe("ok");
    const f = (await db.query<{ estado: string; por_revisar: boolean }>("select estado, por_revisar from asistencia where id = $1", [m.parche.id])).rows[0];
    expect(f).toEqual({ estado: "P", por_revisar: false });
    // No puede volver a marcar ni cambiar su marca.
    const [otra] = await push(U.estudiante, [{ tabla: "asistencia", parche: { id: m.parche.id, estado: "J" } }]);
    expect(otra.estado).toBe("rechazado");
  });

  it("rechaza códigos alterados y marcas por otro estudiante", async () => {
    const token = await crearTokenQr(SESION, SECRETO, ahora());
    const [alterado] = await push(U_EST2, [marca(E2, token.slice(0, -2) + "zz")]);
    expect(alterado).toMatchObject({ estado: "rechazado", motivo: "Código QR no válido" });
    const [ajeno] = await push(U.estudiante, [marca(E3, token)]);
    expect(ajeno.estado).toBe("rechazado");
  });

  it("una foto escaneada tarde o un celular prestado quedan por revisar", async () => {
    const token = await crearTokenQr(SESION, SECRETO, ahora());
    const m = marca(E2, token, { marcado_en: new Date(ahora() + 10 * 60_000).toISOString() });
    expect((await push(U_EST2, [m]))[0]).toEqual({ ref: 1, estado: "ok" });
    const f = (await db.query<{ por_revisar: boolean; motivo_revision: string }>("select por_revisar, motivo_revision from asistencia where id = $1", [m.parche.id])).rows[0];
    expect(f.por_revisar).toBe(true);
    // equipo-A ya marcó por E1 en esta sesión.
    expect(f.motivo_revision).toMatch(/fuera de tiempo; Este celular ya marcó por otro estudiante/);
  });

  it("el código de 6 dígitos calculado en Postgres es idéntico al de la app", async () => {
    for (const v of [119_000_000, 119_696_578, 120_000_001]) {
      const r = await db.query<{ c: string }>("select codigo_qr($1, $2, $3) c", [SECRETO, SESION, v]);
      expect(r.rows[0].c).toBe(await codigoCorto(SESION, SECRETO, v));
    }
  });

  it("el estudiante marca escribiendo el código que vio hace unos segundos; uno equivocado se rechaza", async () => {
    const SESION2 = "60000000-0000-4000-8000-000000000002";
    await push(U.docente, [
      { tabla: "asistencia_sesion", parche: { id: SESION2, colegio_id: COL, seccion_id: SEC, area_id: null, docente_id: U.docente, fecha: "2026-10-19", modo: "qr", abierta_en: ahora() - 60_000, estado: "abierta" } },
      { tabla: "asistencia_secreto", parche: { id: SESION2, colegio_id: COL, sesion_id: SESION2, docente_id: U.docente, secreto: SECRETO } },
    ]);
    const v = ventanaDe(ahora());
    const codigo = await codigoCorto(SESION2, SECRETO, v - 1);
    const conCodigo = (est: string, c: string) => ({ ...marca(est, tokenDeCodigo(SESION2, v, c)), parche: { ...marca(est, "").parche, sesion_id: SESION2, token_qr: tokenDeCodigo(SESION2, v, c) } });
    const [mal] = await push(U_EST2, [conCodigo(E2, String((+codigo + 1) % 1_000_000).padStart(6, "0"))]);
    expect(mal).toMatchObject({ estado: "rechazado", motivo: "El código no es correcto o ya cambió" });
    const m = conCodigo(E1, codigo);
    expect((await push(U.estudiante, [m]))[0].estado).toBe("ok");
    const f = (await db.query<{ estado: string; por_revisar: boolean }>("select estado, por_revisar from asistencia where id = $1", [m.parche.id])).rows[0];
    expect(f).toEqual({ estado: "P", por_revisar: false });
  });

  it("el secreto solo lo ve quien abrió la sesión (ni estudiantes ni la UGEL)", async () => {
    expect((await pull(U.docente)).filas.asistencia_secreto?.map((s) => s.id).sort()).toEqual([SESION, "60000000-0000-4000-8000-000000000002"]);
    expect((await pull(U.estudiante)).filas.asistencia_secreto).toBeUndefined();
    expect((await pull(U.ugel)).filas.asistencia_secreto).toBeUndefined();
    // El estudiante ve las sesiones de su sección (para saber qué clase está abierta), nunca el secreto.
    const p = await pull(U.estudiante);
    expect((p.filas.asistencia_sesion ?? []).length).toBeGreaterThan(0);
    expect((p.filas.asistencia_sesion ?? []).every((s) => s.seccion_id === SEC)).toBe(true);
  });

  it("devuelve la hora del servidor para corregir relojes", async () => {
    const r = await como(U.docente, async () => (await db.query<{ r: { hora: number } }>("select sync_pull_con_hora(null, 1) r")).rows[0].r);
    expect(Math.abs(r.hora - Date.now())).toBeLessThan(5_000);
  });
});

describe("tutoría, convivencia, comunicados y evidencias", () => {
  const OTRO_DOC = "10000000-0000-4000-8000-000000000008";
  const INC = "70000000-0000-4000-8000-000000000001";
  const COMUN = "71000000-0000-4000-8000-000000000001";
  const OBS = "72000000-0000-4000-8000-000000000001";

  beforeAll(async () => {
    await db.exec(`
      insert into auth.users (id) values ('${OTRO_DOC}');
      insert into usuario (id, colegio_id, nombres, apellidos, roles) values ('${OTRO_DOC}', '${COL}', 'Otro', 'Docente', '{docente}');
    `);
  });

  it("solo el tutor del estudiante (y dirección/UGEL) registra y ve entrevistas con la familia", async () => {
    const ent = { tabla: "entrevista", parche: { id: crypto.randomUUID(), colegio_id: COL, estudiante_id: E1, apoderado_id: null, tutor_id: U.docente, fecha: "2026-10-20", motivo: "Bajo rendimiento", acuerdos: null, asistio: true } };
    expect((await push(U.docente, [ent]))[0].estado).toBe("ok");
    const ajena = { tabla: "entrevista", parche: { ...ent.parche, id: crypto.randomUUID(), tutor_id: OTRO_DOC } };
    expect((await push(OTRO_DOC, [ajena]))[0].estado).toBe("rechazado");
    expect((await pull(OTRO_DOC)).filas.entrevista).toBeUndefined();
    expect((await pull(U.estudiante)).filas.entrevista).toBeUndefined();
    expect((await pull(U.director)).filas.entrevista?.length).toBe(1);
  });

  it("el seguimiento de una incidencia lo ve quien puede ver la incidencia", async () => {
    const r = await push(U.docente, [
      { tabla: "incidencia", parche: { id: INC, colegio_id: COL, estudiante_id: E1, reportado_por: U.docente, fecha: "2026-10-20", tipo: "Ciberacoso", descripcion: "x", estado: "abierta", codigo_siseve: null, requiere_siseve: true } },
      { tabla: "incidencia_accion", parche: { id: crypto.randomUUID(), colegio_id: COL, incidencia_id: INC, autor_id: U.docente, fecha: "2026-10-20", texto: "Conversación" } },
    ]);
    expect(r.map((x) => x.estado)).toEqual(["ok", "ok"]);
    expect((await pull(U.director)).filas.incidencia_accion?.length).toBe(1);
    expect((await pull(U.estudiante)).filas.incidencia_accion).toBeUndefined();
    // Un docente sin relación no puede agregar acciones a una incidencia que no ve.
    const [x] = await push(OTRO_DOC, [{ tabla: "incidencia_accion", parche: { id: crypto.randomUUID(), colegio_id: COL, incidencia_id: INC, autor_id: OTRO_DOC, fecha: "2026-10-20", texto: "?" } }]);
    expect(x.estado).toBe("rechazado");
  });

  it("cada uno confirma su propia lectura; el autor ve quién leyó", async () => {
    await push(U.director, [{ tabla: "comunicado", parche: { id: COMUN, colegio_id: COL, autor_id: U.director, titulo: "Aviso", cuerpo: "Texto", destino: "todos", seccion_id: null, fecha: "2026-10-20" } }]);
    const leer = (u: string, comoQuien = u) => ({ tabla: "comunicado_lectura", parche: { id: crypto.randomUUID(), colegio_id: COL, comunicado_id: COMUN, usuario_id: comoQuien, leido_en: new Date().toISOString() } });
    expect((await push(U.estudiante, [leer(U.estudiante)]))[0].estado).toBe("ok");
    expect((await push(U.estudiante, [leer(U.estudiante, U.apoderado)]))[0].estado).toBe("rechazado");
    expect((await pull(U.director)).filas.comunicado_lectura?.map((l) => l.usuario_id)).toEqual([U.estudiante]);
    expect((await pull(U.apoderado)).filas.comunicado_lectura).toBeUndefined();
  });

  it("la familia ve evidencias académicas de su hijo, pero no las de convivencia", async () => {
    const ev = (entidad: string, entidad_id: string) => ({ tabla: "evidencia", parche: {
      id: crypto.randomUUID(), colegio_id: COL, entidad, entidad_id, estudiante_id: E1, autor_id: U.docente, nombre: "f.jpg", tipo: "image/jpeg", bytes: 1000, ruta: null, descripcion: null,
    } });
    const r = await push(U.docente, [ev("observacion", OBS), ev("incidencia", INC)]);
    expect(r.map((x) => x.estado)).toEqual(["ok", "ok"]);
    expect((await pull(U.apoderado)).filas.evidencia?.map((e) => e.entidad)).toEqual(["observacion"]);
    expect((await pull(U.director)).filas.evidencia?.length).toBe(2);
    // Un estudiante no puede subir evidencias.
    const [x] = await push(U.estudiante, [{ ...ev("observacion", OBS), parche: { ...ev("observacion", OBS).parche, autor_id: U.estudiante } }]);
    expect(x.estado).toBe("rechazado");
  });
});

describe("justificaciones de la familia", () => {
  const SES = "80000000-0000-4000-8000-000000000001";
  const FALTA_E1 = "81000000-0000-4000-8000-000000000001";
  const FALTA_E2 = "81000000-0000-4000-8000-000000000002";
  const J1 = "82000000-0000-4000-8000-000000000001";
  const justif = (id: string, asistencia_id: string, estudiante_id: string, extra: Record<string, unknown> = {}) => ({
    tabla: "justificacion",
    parche: { id, colegio_id: COL, asistencia_id, estudiante_id, solicitante_id: U.apoderado, motivo: "Cita médica", estado: "pendiente", revisado_por: null, respuesta: null, ...extra },
  });

  beforeAll(async () => {
    const r = await push(U.docente, [
      { tabla: "asistencia_sesion", parche: { id: SES, colegio_id: COL, seccion_id: SEC, area_id: null, docente_id: U.docente, fecha: "2026-10-21", modo: "manual", abierta_en: Date.now(), estado: "confirmada" } },
      { tabla: "asistencia", parche: { id: FALTA_E1, colegio_id: COL, sesion_id: SES, estudiante_id: E1, estado: "F", origen: "manual", marcado_en: new Date().toISOString(), token_qr: null, por_revisar: false } },
      { tabla: "asistencia", parche: { id: FALTA_E2, colegio_id: COL, sesion_id: SES, estudiante_id: E2, estado: "F", origen: "manual", marcado_en: new Date().toISOString(), token_qr: null, por_revisar: false } },
    ]);
    expect(r.map((x) => x.estado)).toEqual(["ok", "ok", "ok"]);
  });

  it("el apoderado justifica la falta de su hijo, pero no la de otro estudiante", async () => {
    expect((await push(U.apoderado, [justif(J1, FALTA_E1, E1)]))[0].estado).toBe("ok");
    expect((await push(U.apoderado, [justif(crypto.randomUUID(), FALTA_E2, E2)]))[0].estado).toBe("rechazado");
  });

  it("la familia no puede aprobar su propia solicitud", async () => {
    const [r] = await push(U.apoderado, [{ tabla: "justificacion", parche: { id: J1, estado: "aprobada" } }]);
    expect(r).toMatchObject({ estado: "rechazado", motivo: "Solo el colegio puede aprobar o rechazar una justificación" });
  });

  it("el tutor la aprueba y queda registrado quién la revisó", async () => {
    const r = await push(U.docente, [
      { tabla: "justificacion", parche: { id: J1, estado: "aprobada", respuesta: "Conforme" } },
      { tabla: "asistencia", parche: { id: FALTA_E1, estado: "J" } },
    ]);
    expect(r.map((x) => x.estado)).toEqual(["ok", "ok"]);
    const f = (await db.query<{ revisado_por: string }>("select revisado_por from justificacion where id = $1", [J1])).rows[0];
    expect(f.revisado_por).toBe(U.docente);
    // Ya revisada, la familia no la puede modificar.
    expect((await push(U.apoderado, [{ tabla: "justificacion", parche: { id: J1, motivo: "Otro" } }]))[0].estado).toBe("rechazado");
  });

  it("el apoderado adjunta un sustento a su justificación, pero no evidencias académicas", async () => {
    const ev = (entidad: string, entidad_id: string) => ({ tabla: "evidencia", parche: {
      id: crypto.randomUUID(), colegio_id: COL, entidad, entidad_id, estudiante_id: E1, autor_id: U.apoderado, nombre: "certificado.pdf", tipo: "application/pdf", bytes: 2000, ruta: null, descripcion: null,
    } });
    const J2 = crypto.randomUUID();
    await push(U.apoderado, [justif(J2, FALTA_E1, E1)]);
    expect((await push(U.apoderado, [ev("justificacion", J2)]))[0].estado).toBe("ok");
    expect((await push(U.apoderado, [ev("observacion", J2)]))[0].estado).toBe("rechazado");
    expect((await pull(U.docente)).filas.justificacion?.length).toBe(2);
    expect((await pull(U.otroColegio)).filas.justificacion).toBeUndefined();
  });
});

describe("monitoreo de la UGEL", () => {
  const OBS_M = "90000000-0000-4000-8000-000000000001";
  it("la UGEL registra la observación y el director solo puede responderla", async () => {
    const r = await push(U.ugel, [{ tabla: "observacion_monitoreo", parche: { id: OBS_M, colegio_id: COL, autor_id: U.ugel, fecha: "2026-10-20", texto: "Revisar el registro de asistencia de 2.º B", estado: "pendiente", categoria: "asistencia", respuesta: null } }]);
    expect(r[0].estado).toBe("ok");
    expect((await push(U.docente, [{ tabla: "observacion_monitoreo", parche: { id: crypto.randomUUID(), colegio_id: COL, autor_id: U.docente, fecha: "2026-10-20", texto: "x", estado: "pendiente", categoria: "gestion", respuesta: null } }]))[0].estado).toBe("rechazado");

    const [cambiaTexto] = await push(U.director, [{ tabla: "observacion_monitoreo", parche: { id: OBS_M, texto: "Otro texto" } }]);
    expect(cambiaTexto).toMatchObject({ estado: "rechazado", motivo: "Solo la UGEL puede modificar su observación" });
    const [responde] = await push(U.director, [{ tabla: "observacion_monitoreo", parche: { id: OBS_M, respuesta: "Se capacitó al docente", estado: "atendida" } }]);
    expect(responde.estado).toBe("ok");
    const f = (await db.query<{ respondido_en: string | null }>("select respondido_en from observacion_monitoreo where id = $1", [OBS_M])).rows[0];
    expect(f.respondido_en).not.toBeNull();
    expect((await pull(U.docente)).filas.observacion_monitoreo).toBeUndefined();
  });
});

describe("acceso con DNI", () => {
  const usuario = (id: string, extra: Record<string, unknown>) => ({ tabla: "usuario", parche: { id, ...extra } });

  it("la dirección registra el DNI de una cuenta (8 dígitos)", async () => {
    const r = await push(U.director, [usuario(U.docente, { dni: "41234567" }), usuario(U.estudiante, { dni: "123" })]);
    expect(r[0].estado).toBe("ok");
    expect(r[1]).toMatchObject({ estado: "rechazado" });
  });

  it("no puede haber dos cuentas con el mismo DNI ni con el mismo correo", async () => {
    const r = await push(U.director, [
      usuario(U.estudiante, { dni: "41234567" }),
      usuario(U.apoderado, { email: "Rosa@Correo.pe" }),
      usuario(U.estudiante, { email: "rosa@correo.pe" }),
    ]);
    expect(r.map((x) => x.estado)).toEqual(["rechazado", "ok", "rechazado"]);
  });

  it("el DNI de una cuenta no se cambia desde la app (dejaría a la persona sin acceso)", async () => {
    const [r] = await push(U.director, [usuario(U.docente, { dni: "49999999" })]);
    expect(r).toMatchObject({ estado: "rechazado", motivo: expect.stringContaining("no se puede cambiar") });
    const { rows } = await db.query<{ dni: string }>("select dni from usuario where id = $1", [U.docente]);
    expect(rows[0].dni).toBe("41234567");
  });
});

describe("pedidos de ayuda al tutor", () => {
  const S = (n: number) => `60000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
  const pedido = (id: string, solicitante: string, extra: Record<string, unknown> = {}) => ({
    tabla: "solicitud_tutoria",
    parche: { id, colegio_id: COL, estudiante_id: E1, solicitante_id: solicitante, motivo: "estudios", mensaje: "Necesito ayuda", modalidad: "presencial", ...extra },
  });
  const ver = async (uid: string) => ((await pull(uid)).filas.solicitud_tutoria ?? []).map((f) => f.id).sort();

  it("el pedido llega al tutor de la sección y empieza como enviado", async () => {
    const r = await push(U.estudiante, [pedido(S(1), U.estudiante, { estado: "atendida", respuesta: "trampa", tutor_id: U.director })]);
    expect(r[0].estado).toBe("ok");
    const { rows } = await db.query<{ tutor_id: string; estado: string; respuesta: string | null }>("select tutor_id, estado, respuesta from solicitud_tutoria where id = $1", [S(1)]);
    expect(rows[0]).toEqual({ tutor_id: U.docente, estado: "enviada", respuesta: null });
  });

  it("el apoderado pide por su hijo, pero no por otro estudiante", async () => {
    const r = await push(U.apoderado, [pedido(S(2), U.apoderado), pedido(S(3), U.apoderado, { estudiante_id: E3 })]);
    expect(r.map((x) => x.estado)).toEqual(["ok", "rechazado"]);
  });

  it("privacidad: la familia no ve lo que pidió el estudiante; la dirección solo ve los casos de acoso", async () => {
    await push(U.estudiante, [pedido(S(4), U.estudiante, { motivo: "companeros", mensaje: "Me molestan en el recreo" })]);
    expect(await ver(U.estudiante)).toEqual([S(1), S(4)]);
    expect(await ver(U.apoderado)).toEqual([S(2)]);
    expect(await ver(U.docente)).toEqual([S(1), S(2), S(4)]);
    expect(await ver(U.director)).toEqual([S(4)]);
    expect(await ver(U.ugel)).toEqual([]);
  });

  it("máximo 2 pedidos abiertos por persona", async () => {
    const [r] = await push(U.estudiante, [pedido(S(5), U.estudiante)]);
    expect(r).toMatchObject({ estado: "rechazado", motivo: expect.stringContaining("2 pedidos abiertos") });
  });

  it("el tutor agenda (con fecha) y responde; quien pidió solo puede cancelar", async () => {
    const t = await push(U.docente, [
      { tabla: "solicitud_tutoria", parche: { id: S(1), estado: "agendada" } },
      { tabla: "solicitud_tutoria", parche: { id: S(1), estado: "agendada", cita: "2026-11-24T15:00:00Z", respuesta: "Conversemos el lunes" } },
      { tabla: "solicitud_tutoria", parche: { id: S(1), mensaje: "cambiado" } },
    ]);
    expect(t.map((x) => x.estado)).toEqual(["rechazado", "ok", "rechazado"]);
    const e = await push(U.estudiante, [
      { tabla: "solicitud_tutoria", parche: { id: S(1), respuesta: "me respondo" } },
      { tabla: "solicitud_tutoria", parche: { id: S(1), estado: "cancelada" } },
      { tabla: "solicitud_tutoria", parche: { id: S(1), estado: "enviada" } },
    ]);
    expect(e.map((x) => x.estado)).toEqual(["rechazado", "ok", "rechazado"]);
  });

  it("la dirección atiende los casos de acoso", async () => {
    const [r] = await push(U.director, [{ tabla: "solicitud_tutoria", parche: { id: S(4), estado: "vista", respuesta: "Vamos a conversar con tu tutora hoy" } }]);
    expect(r.estado).toBe("ok");
  });
});

describe("cierre del año e historial", () => {
  const I = (n: number) => `61000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
  const MAT_E1 = "35000000-0000-4000-8000-000000000001";
  const informe = (id: string, estudiante: string, tutor: string) => ({
    tabla: "informe_tutor",
    parche: { id, colegio_id: COL, estudiante_id: estudiante, anio_id: ANIO, tutor_id: tutor, fortalezas: "Participa", recomendaciones: "Sentarlo adelante" },
  });
  const ids = async (uid: string, tabla: string) => ((await pull(uid)).filas[tabla] ?? []).map((f) => f.id).sort();

  it("solo la dirección fija la situación final, y con motivo si cambia la propuesta", async () => {
    const r1 = await push(U.docente, [{ tabla: "matricula", parche: { id: MAT_E1, situacion_final: "PRO" } }]);
    expect(r1[0].estado).toBe("rechazado");
    const r2 = await push(U.director, [
      { tabla: "matricula", parche: { id: MAT_E1, situacion_propuesta: "RR", situacion_final: "PRO" } },
      { tabla: "matricula", parche: { id: MAT_E1, situacion_propuesta: "RR", situacion_final: "PRO", situacion_motivo: "Aprobó la evaluación de recuperación interna" } },
    ]);
    expect(r2.map((x) => x.estado)).toEqual(["rechazado", "ok"]);
  });

  it("el informe del tutor lo escribe el tutor y lo lee solo el personal", async () => {
    const r = await push(U.docente, [informe(I(1), E1, U.docente)]);
    expect(r[0].estado).toBe("ok");
    expect(await ids(U.director, "informe_tutor")).toEqual([I(1)]);
    expect(await ids(U.docente, "informe_tutor")).toEqual([I(1)]);
    expect(await ids(U.apoderado, "informe_tutor")).toEqual([]);
    expect(await ids(U.estudiante, "informe_tutor")).toEqual([]);
    expect(await ids(U.ugel, "informe_tutor")).toEqual([]);
    // Un docente no puede firmar como tutor de un estudiante que no es de su tutoría.
    const [otro] = await push(U.docente, [informe(I(2), E3, U.docente)]);
    expect(otro.estado).toBe("rechazado");
  });

  it("con el año cerrado ya no se registran notas ni se editan informes", async () => {
    const [r] = await push(U.director, [{ tabla: "anio_escolar", parche: { id: ANIO, cerrado_en: "2026-12-20T00:00:00Z" } }]);
    expect(r.estado).toBe("ok");
    const [n] = await push(U.docente, [nota(idNota())]);
    expect(n).toMatchObject({ estado: "rechazado", motivo: expect.stringContaining("cerrado") });
    const [i] = await push(U.docente, [{ tabla: "informe_tutor", parche: { id: I(1), fortalezas: "Cambiado" } }]);
    expect(i.estado).toBe("rechazado");
  });

  it("en el año nuevo cada docente ve a sus estudiantes actuales con todo su historial, y deja de ver a los anteriores", async () => {
    const ANIO27 = "30000000-0000-4000-8000-000000000027";
    const SEC27 = "33000000-0000-4000-8000-000000000027";
    await db.exec(`
      insert into informe_tutor (id, colegio_id, estudiante_id, anio_id, tutor_id, fortalezas) values ('${I(3)}', '${COL}', '${E2}', '${ANIO}', '${U.director}', 'Muy responsable');
      update anio_escolar set activo = false where id = '${ANIO}';
      insert into anio_escolar (id, colegio_id, anio, regimen, activo) values ('${ANIO27}', '${COL}', 2027, 'bimestre', true);
      insert into seccion (id, colegio_id, anio_id, grado_id, letra, tutor_id) values ('${SEC27}', '${COL}', '${ANIO27}', '${GRADO}', 'A', '${U.docente}');
      insert into matricula (id, colegio_id, anio_id, seccion_id, estudiante_id) values ('35000000-0000-4000-8000-000000000027', '${COL}', '${ANIO27}', '${SEC27}', '${E2}');
    `);
    expect(await ids(U.docente, "estudiante")).toEqual([E2]);
    // Ve el informe que dejó el tutor del año anterior, pero ya no el de su antiguo estudiante.
    expect(await ids(U.docente, "informe_tutor")).toEqual([I(3)]);
    // Las sesiones de asistencia del año pasado de E2 siguen legibles para resumir su historial.
    const sesiones = (await pull(U.docente)).filas.asistencia_sesion ?? [];
    const marcasE2 = ((await pull(U.docente)).filas.asistencia ?? []).filter((a) => a.estudiante_id === E2);
    expect(marcasE2.every((a) => sesiones.some((s) => s.id === a.sesion_id))).toBe(true);
    // La dirección sigue viendo a todos.
    expect((await ids(U.director, "estudiante")).length).toBe(3);
  });
});

describe("datos del colegio", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgo=";
  it("la dirección edita los datos y la insignia; un docente no", async () => {
    const r = await push(U.director, [{ tabla: "colegio", parche: { id: COL, nombre: "I.E. Prueba Renovada", codigo_local: "123456", ugel: "UGEL Cusco", insignia: PNG } }]);
    expect(r[0].estado).toBe("ok");
    const [d] = await push(U.docente, [{ tabla: "colegio", parche: { id: COL, nombre: "Hackeado" } }]);
    expect(d.estado).toBe("rechazado");
    const { rows } = await db.query<{ nombre: string; insignia: string }>("select nombre, insignia from colegio where id = $1", [COL]);
    expect(rows[0]).toEqual({ nombre: "I.E. Prueba Renovada", insignia: PNG });
  });

  it("valida el código modular, el código de local y que la insignia sea una imagen", async () => {
    const r = await push(U.director, [
      { tabla: "colegio", parche: { id: COL, codigo_modular: "123" } },
      { tabla: "colegio", parche: { id: COL, codigo_local: "abc" } },
      { tabla: "colegio", parche: { id: COL, insignia: "data:text/html;base64,PHNjcmlwdD4=" } },
      { tabla: "colegio", parche: { id: COL, nombre: "   " } },
    ]);
    expect(r.map((x) => x.estado)).toEqual(["rechazado", "rechazado", "rechazado", "rechazado"]);
  });
});

describe("rol de servicio (funciones de cuentas)", () => {
  it("puede leer y escribir usuarios y vincular estudiantes y apoderados", async () => {
    const { rows } = await db.query<{ tabla: string; ok: boolean }>(`
      select t as tabla, has_table_privilege('service_role', 'public.' || t, 'SELECT')
        and has_table_privilege('service_role', 'public.' || t, 'INSERT')
        and has_table_privilege('service_role', 'public.' || t, 'UPDATE') as ok
      from unnest(array['usuario', 'estudiante', 'apoderado', 'colegio']) t`);
    expect(rows.every((r) => r.ok)).toBe(true);
  });
});

describe("rendimiento de los permisos", () => {
  it("ninguna política de lectura revisa estudiante por estudiante", async () => {
    const { rows } = await db.query<{ n: number }>("select count(*)::int n from pg_policies where cmd = 'SELECT' and qual like '%puedo_ver_estudiante(%'");
    expect(rows[0].n).toBe(0);
  });
});
