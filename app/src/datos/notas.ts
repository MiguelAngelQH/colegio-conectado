import { db } from "@/app/contexto";
import { guardar } from "@/db/repositorio";
import type { NivelLogro } from "@/db/tipos";
import { logroDeCapacidades } from "@/dominio/capacidades";
import { idCalificacion } from "@/dominio/notas";

/**
 * Guarda (o corrige) una nota. Reutiliza el id si la nota ya existe en el equipo; si no, usa el id
 * determinístico para que otro equipo que califique lo mismo sin conexión genere la misma fila.
 */
export async function guardarNota(params: {
  estudianteId: string; competenciaId: string; periodoId: string; seccionId: string;
  cambios: { nivel_logro?: NivelLogro | null; conclusion?: string | null; capacidades?: Record<string, NivelLogro> };
}, colegioId: string | null) {
  const { estudianteId, competenciaId, periodoId, seccionId, cambios } = params;
  const existente = await db.tabla("calificacion")
    .where("[estudiante_id+competencia_id+periodo_id]")
    .equals([estudianteId, competenciaId, periodoId])
    .first();
  const id = existente?.id ?? (await idCalificacion(estudianteId, competenciaId, periodoId));
  return guardar(db, "calificacion", existente
    ? { id, ...cambios }
    : { id, estudiante_id: estudianteId, competencia_id: competenciaId, periodo_id: periodoId, seccion_id: seccionId, nivel_logro: null, conclusion: null, ...cambios },
  colegioId);
}

/**
 * Califica una capacidad (o la borra si se elige el mismo nivel) y recalcula el logro de la
 * competencia con la regla del registro auxiliar: AD=3, A=2, B=1, C=0, promedio redondeado.
 */
// Los clics seguidos se guardan uno tras otro: cada uno lee lo que dejó el anterior.
let cola: Promise<unknown> = Promise.resolve();

export function guardarCapacidad(params: {
  estudianteId: string; competenciaId: string; periodoId: string; seccionId: string; capacidad: number; nivel: NivelLogro;
}, colegioId: string | null) {
  const tarea = cola.then(() => guardarCapacidadAhora(params, colegioId));
  cola = tarea.catch(() => undefined);
  return tarea;
}

async function guardarCapacidadAhora(params: Parameters<typeof guardarCapacidad>[0], colegioId: string | null) {
  const { capacidad, nivel, ...resto } = params;
  const existente = await db.tabla("calificacion")
    .where("[estudiante_id+competencia_id+periodo_id]")
    .equals([resto.estudianteId, resto.competenciaId, resto.periodoId])
    .first();
  const caps = { ...(existente?.capacidades ?? {}) };
  const clave = String(capacidad);
  if (caps[clave] === nivel) delete caps[clave];
  else caps[clave] = nivel;
  return guardarNota({ ...resto, cambios: { capacidades: caps, nivel_logro: logroDeCapacidades(caps) } }, colegioId);
}
