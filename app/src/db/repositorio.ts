import type { BaseLocal, EntradaOutbox } from "./local";
import { nuevoId } from "./local";
import type { Fila, NombreTabla, Tablas } from "./tipos";

type Parche<K extends NombreTabla> = Partial<Tablas[K]> & { id?: string };

export interface Escritura<K extends NombreTabla = NombreTabla> {
  tabla: K;
  datos: Parche<K>;
}

/** Aplica un cambio dentro de una transacción ya abierta (tabla + outbox). */
async function aplicarLocal<K extends NombreTabla>(db: BaseLocal, tabla: K, datos: Parche<K>, colegioId: string | null): Promise<string> {
  const id = datos.id ?? nuevoId();
  const parche: Record<string, unknown> = { ...datos, id };
  delete parche.updated_at;
  delete parche.updated_by;
  if (!("colegio_id" in parche)) parche.colegio_id = colegioId;

  const t = db.tabla(tabla);
  const actual = (await t.get(id)) as Fila | undefined;
  await t.put({ ...(actual ?? {}), ...parche, updated_at: new Date().toISOString() } as Tablas[K]);

  // Si ya hay un cambio pendiente (aún no enviado) para la misma fila, se fusionan los parches.
  const previa = await db.outbox
    .where("[tabla+fila_id]")
    .equals([tabla, id])
    .filter((e) => e.estado === "pendiente")
    .first();
  if (previa) {
    await db.outbox.update(previa.id!, { parche: { ...previa.parche, ...parche } });
  } else {
    const entrada: EntradaOutbox = {
      tabla,
      fila_id: id,
      parche,
      base: actual ?? null,
      creado: Date.now(),
      intentos: 0,
      proximo_intento: 0,
      estado: "pendiente",
      error: null,
    };
    await db.outbox.add(entrada);
  }
  return id;
}

/**
 * Única forma de escribir datos sincronizables: guarda la fila en local y deja el cambio
 * en el outbox, en la misma transacción.
 */
export async function guardar<K extends NombreTabla>(db: BaseLocal, tabla: K, datos: Parche<K>, colegioId: string | null): Promise<string> {
  let id = "";
  await db.transaction("rw", [db.tabla(tabla), db.outbox], async () => {
    id = await aplicarLocal(db, tabla, datos, colegioId);
  });
  return id;
}

/**
 * Varias escrituras en una sola transacción: o se guardan todas o ninguna
 * (por ejemplo, un estudiante con su matrícula, o una importación completa).
 * Se envían al servidor en el mismo orden (primero las filas de las que dependen otras).
 */
export async function guardarLote(db: BaseLocal, escrituras: Escritura[], colegioId: string | null): Promise<string[]> {
  const tablas = [...new Set(escrituras.map((e) => e.tabla))].map((t) => db.tabla(t));
  const ids: string[] = [];
  await db.transaction("rw", [...tablas, db.outbox], async () => {
    for (const e of escrituras) ids.push(await aplicarLocal(db, e.tabla, e.datos, colegioId));
  });
  return ids;
}

/** Borrado lógico: se sincroniza como un cambio más. */
export function eliminar(db: BaseLocal, tabla: NombreTabla, id: string, colegioId: string | null) {
  return guardar(db, tabla, { id, eliminado: true } as Parche<typeof tabla>, colegioId);
}

/** Filtra filas eliminadas lógicamente. */
export function vivas<T extends Fila>(filas: T[]): T[] {
  return filas.filter((f) => !f.eliminado);
}
