// Archivos de evidencias. La fila "evidencia" se sincroniza como cualquier otra; el archivo se
// guarda primero en el equipo y se sube después, cuando hay conexión (y wifi si así se configuró).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BaseLocal } from "@/db/local";
import { guardar } from "@/db/repositorio";
import type { Evidencia } from "@/db/tipos";
import type { ServidorDemo } from "./transporte-demo";
import { hayConexion } from "./red";

export interface AlmacenArchivos {
  subir(ruta: string, blob: Blob): Promise<void>;
  bajar(ruta: string): Promise<Blob>;
}

export class AlmacenDemo implements AlmacenArchivos {
  constructor(private servidor: ServidorDemo) {}
  async subir(ruta: string, blob: Blob) {
    await this.servidor.archivo.put({ id: ruta, blob, subido: 1 });
  }
  async bajar(ruta: string) {
    const a = await this.servidor.archivo.get(ruta);
    if (!a) throw new Error("Archivo no encontrado");
    return a.blob;
  }
}

export class AlmacenSupabase implements AlmacenArchivos {
  constructor(private cliente: SupabaseClient) {}
  async subir(ruta: string, blob: Blob) {
    const { error } = await this.cliente.storage.from("evidencias").upload(ruta, blob, { upsert: true, contentType: blob.type || undefined });
    if (error) throw new Error(error.message);
  }
  async bajar(ruta: string) {
    const { data, error } = await this.cliente.storage.from("evidencias").download(ruta);
    if (error || !data) throw new Error(error?.message ?? "No se pudo descargar");
    return data;
  }
}

// ------------------------------------------------------------------ preferencia: solo wifi

const CLAVE_WIFI = "cc.subir_solo_wifi";

export function soloWifi(): boolean {
  try {
    return localStorage.getItem(CLAVE_WIFI) === "1";
  } catch {
    return false;
  }
}

export function fijarSoloWifi(v: boolean) {
  try {
    localStorage.setItem(CLAVE_WIFI, v ? "1" : "0");
  } catch {
    /* sin almacenamiento */
  }
}

/** true si la conexión es móvil o el usuario activó "ahorro de datos" (cuando el navegador lo informa). */
function conexionMovil(): boolean {
  const c = (navigator as unknown as { connection?: { type?: string; saveData?: boolean } }).connection;
  return !!c && (c.saveData === true || c.type === "cellular");
}

export function puedeSubirAhora(): boolean {
  return hayConexion() && !(soloWifi() && conexionMovil());
}

// ------------------------------------------------------------------ operaciones

const extension = (tipo: string, nombre: string) =>
  nombre.includes(".") ? nombre.split(".").pop()!.toLowerCase().slice(0, 5) : tipo.split("/")[1]?.slice(0, 5) ?? "bin";

/** Sube los archivos que solo están en este equipo. Devuelve cuántos subió. */
export async function subirPendientes(db: BaseLocal, almacen: AlmacenArchivos, colegioId: string | null): Promise<number> {
  if (!puedeSubirAhora()) return 0;
  let n = 0;
  for (const a of await db.archivo.where("subido").equals(0).toArray()) {
    const ev = (await db.tabla("evidencia").get(a.id)) as Evidencia | undefined;
    if (!ev || ev.eliminado) {
      await db.archivo.delete(a.id);
      continue;
    }
    const ruta = ev.ruta ?? `${ev.colegio_id}/${ev.id}.${extension(ev.tipo, ev.nombre)}`;
    try {
      await almacen.subir(ruta, a.blob);
    } catch {
      continue; // se intentará en la próxima sincronización
    }
    if (ev.ruta !== ruta) await guardar(db, "evidencia", { id: ev.id, ruta }, colegioId);
    await db.archivo.update(a.id, { subido: 1 });
    n++;
  }
  return n;
}

/** Devuelve el archivo: del equipo si está, o descargándolo (y guardándolo para verlo sin conexión). */
export async function obtenerArchivo(db: BaseLocal, almacen: AlmacenArchivos, ev: Evidencia): Promise<Blob | null> {
  const local = await db.archivo.get(ev.id);
  if (local) return local.blob;
  if (!ev.ruta || !hayConexion()) return null;
  const blob = await almacen.bajar(ev.ruta);
  await db.archivo.put({ id: ev.id, blob, subido: 1 });
  return blob;
}
