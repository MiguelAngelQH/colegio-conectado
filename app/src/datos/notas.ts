import { db } from "@/app/contexto";
import { guardar } from "@/db/repositorio";
import type { NivelLogro } from "@/db/tipos";
import { idCalificacion } from "@/dominio/notas";

/**
 * Guarda (o corrige) una nota. Reutiliza el id si la nota ya existe en el equipo; si no, usa el id
 * determinístico para que otro equipo que califique lo mismo sin conexión genere la misma fila.
 */
export async function guardarNota(params: {
  estudianteId: string; competenciaId: string; periodoId: string; seccionId: string;
  cambios: { nivel_logro?: NivelLogro | null; conclusion?: string | null };
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
