// Bandeja de avisos. Se calcula en el equipo con lo que trajo la sincronización: no necesita un
// servidor de notificaciones y funciona sin conexión (los avisos llegan con el siguiente sync).
import type { Asistencia, Calificacion, Comunicado, Justificacion, Observacion, ObservacionMonitoreo, SolicitudTutoria } from "@/db/tipos";
import { esSensible, MOTIVOS } from "./solicitudes";

export type TipoAviso = "falta" | "tardanza" | "nota" | "comunicado" | "observacion" | "justificacion" | "por_revisar" | "monitoreo" | "tutoria";

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
  /** Observaciones de monitoreo: la dirección ve las pendientes y la UGEL las respondidas. */
  monitoreo?: ObservacionMonitoreo[];
  esDireccion?: boolean;
  esUgel?: boolean;
  /** Pedidos de ayuda que el usuario puede ver (ya filtrados por privacidad). */
  solicitudes?: SolicitudTutoria[];
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

  for (const o of e.monitoreo ?? []) {
    if (o.eliminado) continue;
    if (e.esDireccion && o.estado === "pendiente") {
      res.push({ id: `mon-${o.id}`, tipo: "monitoreo", momento: momento(o), titulo: "Observación de monitoreo de la UGEL", detalle: o.texto,
        estudianteId: null, enlace: "/monitoreo", importante: true, nuevo: false });
    }
    if (e.esUgel && o.estado === "atendida" && o.respuesta) {
      res.push({ id: `mon-${o.id}`, tipo: "monitoreo", momento: momento(o), titulo: "La dirección respondió una observación", detalle: o.respuesta,
        estudianteId: null, enlace: "/monitoreo", importante: false, nuevo: false });
    }
  }

  const horaCita = (c: string) => new Date(c).toLocaleString("es-PE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  for (const s of e.solicitudes ?? []) {
    if (s.eliminado) continue;
    const atiende = s.tutor_id === e.usuarioId || (esSensible(s.motivo) && !!e.esDireccion);
    if (atiende && s.estado === "enviada") {
      res.push({
        id: `sol-${s.id}`, tipo: "tutoria", momento: s.updated_at ?? s.creada_en,
        titulo: `Pedido de ayuda: ${e.nombreEstudiante(s.estudiante_id)}`,
        detalle: `${MOTIVOS[s.motivo].estudiante}. ${s.mensaje.length > 120 ? `${s.mensaje.slice(0, 120)}...` : s.mensaje}`,
        estudianteId: s.estudiante_id, enlace: "/tutoria/pedidos", importante: true, nuevo: false,
      });
    } else if (s.solicitante_id === e.usuarioId && (s.estado === "agendada" || s.estado === "atendida" || (s.estado === "vista" && s.respuesta))) {
      res.push({
        id: `sol-${s.id}`, tipo: "tutoria", momento: s.updated_at ?? s.creada_en,
        titulo: s.estado === "agendada" && s.cita ? `Cita con tu tutor(a): ${horaCita(s.cita)}` : s.estado === "atendida" ? "Tu pedido de ayuda fue atendido" : "Tu tutor(a) respondió tu pedido",
        detalle: s.respuesta ?? MOTIVOS[s.motivo].estudiante, estudianteId: s.estudiante_id, enlace: "/tutoria", importante: s.estado === "agendada", nuevo: false,
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
