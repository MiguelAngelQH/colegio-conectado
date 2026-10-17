import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { BaseLocal } from "@/db/local";
import { guardar } from "@/db/repositorio";
import { forzarSinConexion } from "@/sync/red";
import { obtenerArchivo, subirPendientes, type AlmacenArchivos } from "@/sync/archivos";

function almacenFalso() {
  const datos = new Map<string, Blob>();
  const a: AlmacenArchivos & { datos: Map<string, Blob>; fallar: boolean } = {
    datos, fallar: false,
    async subir(ruta, blob) { if (a.fallar) throw new Error("red"); datos.set(ruta, blob); },
    async bajar(ruta) { const b = datos.get(ruta); if (!b) throw new Error("no"); return b; },
  };
  return a;
}

let n = 0;
async function conEvidencia() {
  const db = new BaseLocal(`archivos-${++n}`);
  await db.archivo.put({ id: "ev1", blob: new Blob(["hola"], { type: "image/jpeg" }), subido: 0 });
  await guardar(db, "evidencia", { id: "ev1", colegio_id: "col", entidad: "observacion", entidad_id: "o1", estudiante_id: "e1", autor_id: "u1", nombre: "foto.jpg", tipo: "image/jpeg", bytes: 4, ruta: null, descripcion: null }, "col");
  return db;
}

describe("archivos de evidencias", () => {
  it("sube lo pendiente, registra la ruta en la fila y no lo vuelve a subir", async () => {
    const db = await conEvidencia();
    const alm = almacenFalso();
    expect(await subirPendientes(db, alm, "col")).toBe(1);
    expect(alm.datos.has("col/ev1.jpg")).toBe(true);
    expect((await db.tabla("evidencia").get("ev1"))?.ruta).toBe("col/ev1.jpg");
    expect((await db.archivo.get("ev1"))?.subido).toBe(1);
    expect(await subirPendientes(db, alm, "col")).toBe(0);
  });

  it("sin conexión o si falla la subida, el archivo sigue pendiente en el equipo", async () => {
    const db = await conEvidencia();
    const alm = almacenFalso();
    forzarSinConexion(true);
    expect(await subirPendientes(db, alm, "col")).toBe(0);
    forzarSinConexion(false);
    alm.fallar = true;
    expect(await subirPendientes(db, alm, "col")).toBe(0);
    expect((await db.archivo.get("ev1"))?.subido).toBe(0);
  });

  it("descarga una evidencia ajena y la guarda para verla sin conexión", async () => {
    const db = new BaseLocal(`archivos-${++n}`);
    const alm = almacenFalso();
    alm.datos.set("col/ev2.pdf", new Blob(["pdf"]));
    const ev = { id: "ev2", colegio_id: "col", entidad: "incidencia" as const, entidad_id: "i1", estudiante_id: null, autor_id: "u2", nombre: "acta.pdf", tipo: "application/pdf", bytes: 3, ruta: "col/ev2.pdf", descripcion: null };
    expect(await (await obtenerArchivo(db, alm, ev))?.text()).toBe("pdf");
    alm.datos.clear();
    forzarSinConexion(true);
    expect(await (await obtenerArchivo(db, alm, ev))?.text()).toBe("pdf");
    forzarSinConexion(false);
  });
});
