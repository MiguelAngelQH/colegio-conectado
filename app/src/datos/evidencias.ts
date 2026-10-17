import { db } from "@/app/contexto";
import { nuevoId } from "@/db/local";
import { guardar } from "@/db/repositorio";
import type { EntidadEvidencia } from "@/db/tipos";

export const MAX_BYTES = 10 * 1024 * 1024;
const LADO_MAX = 1600;

/**
 * Reduce fotos a 1600 px y JPEG de calidad 0,75: una foto de celular de 4 MB queda en ~250 KB,
 * importante con datos móviles caros. Otros archivos (PDF) se guardan tal cual.
 */
export async function comprimir(archivo: File): Promise<Blob> {
  if (!archivo.type.startsWith("image/") || archivo.type === "image/gif" || typeof createImageBitmap !== "function") return archivo;
  try {
    const img = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.width * escala);
    lienzo.height = Math.round(img.height * escala);
    lienzo.getContext("2d")!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    img.close();
    const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, "image/jpeg", 0.75));
    return blob && blob.size < archivo.size ? blob : archivo;
  } catch {
    return archivo;
  }
}

export async function adjuntarEvidencia(p: {
  archivo: File; entidad: EntidadEvidencia; entidadId: string; estudianteId: string | null; autorId: string; colegioId: string | null;
}): Promise<string> {
  const blob = await comprimir(p.archivo);
  if (blob.size > MAX_BYTES) throw new Error("El archivo pesa más de 10 MB.");
  const comprimido = blob !== p.archivo;
  const nombre = comprimido ? p.archivo.name.replace(/\.[^.]+$/, "") + ".jpg" : p.archivo.name;
  const id = nuevoId();
  // Primero el archivo local, luego la fila: si se corta a la mitad no queda una fila sin archivo.
  await db.archivo.put({ id, blob, subido: 0 });
  await guardar(db, "evidencia", {
    id, entidad: p.entidad, entidad_id: p.entidadId, estudiante_id: p.estudianteId, autor_id: p.autorId,
    nombre, tipo: comprimido ? "image/jpeg" : p.archivo.type || "application/octet-stream", bytes: blob.size, ruta: null, descripcion: null,
  }, p.colegioId);
  return id;
}

export function tamano(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
