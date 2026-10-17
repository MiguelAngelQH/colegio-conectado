// Bandeja de avisos. Se calcula en el equipo con lo que trajo la sincronización: no necesita un
// servidor de notificaciones y funciona sin conexión (los avisos llegan con el siguiente sync).
import type { Asistencia, Calificacion, Comunicado, Justificacion, Observacion } from "@/db/tipos";

export type TipoAviso = "falta" | "tardanza" | "nota" | "comunicado" | "observacion" | "justificacion" | "por_revisar";

export interface Aviso {
  id: string;
  tipo: TipoAviso;
  /** Para ordenar y marcar como nuevo: cuándo llegó el dato (updated_at del servidor). */
  momento: string;
  titulo: string;
  detalle: string;
  estudianteId: string | null;
  enlace: string;
  importante: boolean;
  nuevo: boolean;
}

export interface EntradaAvisos {
  usuarioId: string;
  esFamilia: boolean;
  esPersonal: boolean;
  /** Avisos con momento posterior a este se marcan como nuevos. */
  vistosHasta: string | null;
  nombreEstudiante: (id: string) => string;
  faltas: { a: Asistencia; fecha: string; clase: string | null }[];
  notas: { c: Calificacion; competencia: string; area: string }[];
  comunicados: Comunicado[];
  leidos: Set<string>;
  observaciones: Observacion[];
  justificaciones: Justificacion[];
}

const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });

export function calcularAvisos(e: EntradaAvisos): Aviso[] {
  const res: Aviso[] = [];
  const momento = (x: { updated_at?: string }) => x.updated_at ?? "";

  if (e.esFamilia) {
    for (const { a, fecha, clase } of e.faltas) {
      if (a.eliminado || (a.estado !== "F" && a.estado !== "T")) continue;
      res.push({
        id: `as-${a.id}`, tipo: a.estado === "F" ? "falta" : "tardanza", momento: momento(a),
        titulo: `${a.estado === "F" ? "Falta" : "Tardanza"} de ${e.nombreEstudiante(a.estudiante_id)}`,
        detalle: `${fechaCorta(fecha)}${clase ? ` · ${clase}` : ""}. Puede justificarla desde Asistencia.`,
        estudianteId: a.estudiante_id, enlace: "/mi-asistencia", importante: a.estado === "F", nuevo: false,
      });
    }
    for (const { c, competencia, area } of e.notas) {
      if (c.eliminado || !c.nivel_logro) continue;
      res.push({
        id: `nota-${c.id}`, tipo: "nota", momento: momento(c),
        titulo: `${area}: ${c.nivel_logro}${c.nivel_logro === "C" ? " (necesita apoyo)" : ""}`,
        detalle: `${e.nombreEstudiante(c.estudiante_id)} · ${competencia}`,
        estudianteId: c.estudiante_id, enlace: "/mis-notas", importante: c.nivel_logro === "C", nuevo: false,
      });
    }
    for (const o of e.observaciones) {
      if (o.eliminado) continue;
      res.push({
        id: `obs-${o.id}`, tipo: "observacion", momento: momento(o),
        titulo: o.tipo === "felicitacion" ? `Felicitación para ${e.nombreEstudiante(o.estudiante_id)}` : `Observación sobre ${e.nombreEstudiante(o.estudiante_id)}`,
        detalle: o.texto, estudianteId: o.estudiante_id, enlace: "/mis-notas", importante: o.tipo === "conducta", nuevo: false,
      });
    }
    for (const j of e.justificaciones) {
      if (j.eliminado || j.estado === "pendiente" || j.solicitante_id !== e.usuarioId) continue;
      res.push({
        id: `jus-${j.id}`, tipo: "justificacion", momento: momento(j),
        titulo: `Justificación ${j.estado === "aprobada" ? "aprobada" : "rechazada"}`,
        detalle: `${e.nombreEstudiante(j.estudiante_id)}${j.respuesta ? ` · ${j.respuesta}` : ""}`,
        estudianteId: j.estudiante_id, enlace: "/mi-asistencia", importante: j.estado === "rechazada", nuevo: false,
      });
    }
  }

  if (e.esPersonal) {
    for (const j of e.justificaciones) {
      if (j.eliminado || j.estado !== "pendiente") continue;
      res.push({
        id: `jpend-${j.id}`, tipo: "por_revisar", momento: momento(j),
        titulo: `Justificación por revisar: ${e.nombreEstudiante(j.estudiante_id)}`, detalle: j.motivo,
        estudianteId: j.estudiante_id, enlace: "/asistencia/justificaciones", importante: true, nuevo: false,
      });
    }
  }

  for (const c of e.comunicados) {
    if (c.eliminado || c.autor_id === e.usuarioId) continue;
    const leido = e.leidos.has(c.id);
    res.push({
      id: `com-${c.id}`, tipo: "comunicado", momento: momento(c),
      titulo: c.titulo, detalle: c.cuerpo.length > 140 ? `${c.cuerpo.slice(0, 140)}...` : c.cuerpo,
      estudianteId: null, enlace: "/comunicados", importante: !leido, nuevo: false,
    });
  }

  for (const a of res) a.nuevo = !e.vistosHasta || a.momento > e.vistosHasta;
  return res.sort((a, b) => b.momento.localeCompare(a.momento));
}
