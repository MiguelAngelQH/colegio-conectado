// Paquete de cambios por archivo: para equipos que nunca recuperan señal. Se exportan los cambios
// pendientes (y, si se quiere, las fotos) a un archivo que se copia por USB o Bluetooth a otro equipo
// con internet, donde la MISMA cuenta lo importa y se sincroniza normalmente.
// Reglas de seguridad:
//  - Solo lo importa el mismo usuario que lo generó (no se aplican cambios ajenos con permisos propios).
//  - Lleva una suma SHA-256 para detectar archivos dañados o modificados a mano.
//  - El servidor vuelve a validar todo con RLS y triggers, igual que en una sincronización normal.
import type { BaseLocal } from "@/db/local";
import { guardarLote, type Escritura } from "@/db/repositorio";
import { TABLAS, type NombreTabla } from "@/db/tipos";

export const FORMATO_PAQUETE = "colegio-conectado-cambios";

export interface Paquete {
  formato: typeof FORMATO_PAQUETE;
  version: 1;
  usuario_id: string;
  colegio_id: string | null;
  generado: string;
  cambios: { tabla: NombreTabla; parche: Record<string, unknown> }[];
  archivos: { id: string; tipo: string; datos: string }[]; // datos en base64
  suma: string;
}

async function sha256(texto: string): Promise<string> {
  const h = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const contenido = (p: Pick<Paquete, "usuario_id" | "colegio_id" | "cambios" | "archivos">) =>
  JSON.stringify([p.usuario_id, p.colegio_id, p.cambios, p.archivos]);

async function aBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function deBase64(b64: string, tipo: string): Blob {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

export async function exportarPaquete(db: BaseLocal, p: { usuarioId: string; colegioId: string | null; incluirArchivos: boolean }): Promise<Paquete> {
  const entradas = (await db.outbox.orderBy("id").toArray()).filter((e) => e.estado !== "rechazado");
  const cambios = entradas.map((e) => ({ tabla: e.tabla, parche: e.parche }));
  const archivos: Paquete["archivos"] = [];
  if (p.incluirArchivos) {
    for (const a of await db.archivo.where("subido").equals(0).toArray()) {
      archivos.push({ id: a.id, tipo: a.blob.type || "application/octet-stream", datos: await aBase64(a.blob) });
    }
  }
  const base = { usuario_id: p.usuarioId, colegio_id: p.colegioId, cambios, archivos };
  return { formato: FORMATO_PAQUETE, version: 1, generado: new Date().toISOString(), ...base, suma: await sha256(contenido(base)) };
}

export async function importarPaquete(db: BaseLocal, texto: string, p: { usuarioId: string; colegioId: string | null }): Promise<{ cambios: number; archivos: number }> {
  let paquete: Paquete;
  try {
    paquete = JSON.parse(texto);
  } catch {
    throw new Error("El archivo no es un paquete de cambios válido.");
  }
  if (paquete?.formato !== FORMATO_PAQUETE || paquete.version !== 1 || !Array.isArray(paquete.cambios) || !Array.isArray(paquete.archivos)) {
    throw new Error("El archivo no es un paquete de cambios válido.");
  }
  if (paquete.usuario_id !== p.usuarioId) throw new Error("Este paquete lo generó otra cuenta. Debe importarlo la misma persona que lo exportó.");
  if (paquete.colegio_id !== p.colegioId) throw new Error("Este paquete es de otro colegio.");
  if ((await sha256(contenido(paquete))) !== paquete.suma) throw new Error("El archivo está dañado o fue modificado. Vuelva a exportarlo.");
  if (paquete.cambios.some((c) => !TABLAS.includes(c.tabla) || typeof c.parche?.id !== "string")) throw new Error("El paquete tiene cambios no reconocidos.");

  // Primero los archivos (la evidencia los referencia), luego los cambios en una sola transacción.
  let archivos = 0;
  for (const a of paquete.archivos) {
    if (await db.archivo.get(a.id)) continue;
    await db.archivo.put({ id: a.id, blob: deBase64(a.datos, a.tipo), subido: 0 });
    archivos++;
  }
  const escrituras: Escritura[] = paquete.cambios.map((c) => ({ tabla: c.tabla, datos: c.parche }));
  await guardarLote(db, escrituras, p.colegioId);
  return { cambios: escrituras.length, archivos };
}
