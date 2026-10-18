import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { BaseLocal } from "@/db/local";
import { guardar } from "@/db/repositorio";
import { exportarPaquete, importarPaquete } from "@/sync/paquete";

let n = 0;
const nueva = () => new BaseLocal(`paquete-${++n}`);
const COL = "col-1";

async function equipoConCambios() {
  const db = nueva();
  await guardar(db, "calificacion", { id: "n1", estudiante_id: "e1", competencia_id: "c1", periodo_id: "p1", seccion_id: "s1", nivel_logro: "B", conclusion: "Apoyo" }, COL);
  await guardar(db, "observacion", { id: "o1", estudiante_id: "e1", autor_id: "doc", fecha: "2026-10-20", tipo: "academica", texto: "Bien" }, COL);
  await db.archivo.put({ id: "ev1", blob: new Blob([new Uint8Array([1, 2, 3, 250])], { type: "image/jpeg" }), subido: 0 });
  return db;
}

describe("paquete de cambios por archivo", () => {
  it("lleva los cambios y las fotos a otro equipo de la misma cuenta", async () => {
    const origen = await equipoConCambios();
    const paquete = await exportarPaquete(origen, { usuarioId: "doc", colegioId: COL, incluirArchivos: true });
    expect(paquete.cambios).toHaveLength(2);
    expect(paquete.archivos).toHaveLength(1);

    const destino = nueva();
    const r = await importarPaquete(destino, JSON.stringify(paquete), { usuarioId: "doc", colegioId: COL });
    expect(r).toEqual({ cambios: 2, archivos: 1 });
    expect((await destino.tabla("calificacion").get("n1"))?.nivel_logro).toBe("B");
    expect(await destino.outbox.count()).toBe(2);
    const blob = (await destino.archivo.get("ev1"))!.blob;
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3, 250]);
    // Importar dos veces no duplica: las filas son las mismas y los cambios se fusionan.
    await importarPaquete(destino, JSON.stringify(paquete), { usuarioId: "doc", colegioId: COL });
    expect(await destino.outbox.count()).toBe(2);
  });

  it("rechaza paquetes de otra cuenta, de otro colegio o modificados", async () => {
    const paquete = await exportarPaquete(await equipoConCambios(), { usuarioId: "doc", colegioId: COL, incluirArchivos: false });
    const destino = nueva();
    await expect(importarPaquete(destino, JSON.stringify(paquete), { usuarioId: "director", colegioId: COL })).rejects.toThrow(/otra cuenta/);
    await expect(importarPaquete(destino, JSON.stringify(paquete), { usuarioId: "doc", colegioId: "otro" })).rejects.toThrow(/otro colegio/);
    const alterado = { ...paquete, cambios: [{ ...paquete.cambios[0], parche: { ...paquete.cambios[0].parche, nivel_logro: "AD" } }, paquete.cambios[1]] };
    await expect(importarPaquete(destino, JSON.stringify(alterado), { usuarioId: "doc", colegioId: COL })).rejects.toThrow(/dañado o fue modificado/);
    await expect(importarPaquete(destino, "no es json", { usuarioId: "doc", colegioId: COL })).rejects.toThrow(/no es un paquete/);
    expect(await destino.outbox.count()).toBe(0);
  });

  it("no exporta los cambios que el servidor ya rechazó", async () => {
    const db = await equipoConCambios();
    const [primero] = await db.outbox.toArray();
    await db.outbox.update(primero.id!, { estado: "rechazado" });
    const paquete = await exportarPaquete(db, { usuarioId: "doc", colegioId: COL, incluirArchivos: false });
    expect(paquete.cambios.map((c) => c.tabla)).toEqual(["observacion"]);
  });
});
