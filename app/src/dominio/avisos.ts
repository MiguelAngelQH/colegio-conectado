// Bandeja de avisos. Se calcula en el equipo con lo que trajo la sincronización: no necesita un
// servidor de notificaciones y funciona sin conexión (los avisos llegan con el siguiente sync).
import type { Asistencia, Calificacion, Comunicado, Evento, Justificacion, Mensaje, Observacion, ObservacionMonitoreo, SolicitudTutoria, Tarea, TareaEntrega } from "@/db/tipos";
import { esSensible, MOTIVOS } from "./solicitudes";

export type TipoAviso = "falta" | "tardanza" | "nota" | "comunicado" | "observacion" | "justificacion" | "por_revisar" | "monitoreo" | "tutoria" | "tarea" | "evento" | "mensaje";

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
  /** Tareas de las secciones de la familia, con el nombre del área. */
  tareas?: { t: Tarea; area: string }[];
  /** Eventos del calendario que el usuario puede ver, y la fecha de hoy (aaaa-mm-dd). */
  eventos?: Evento[];
  hoy?: string;
  /** Mensajes recibidos sin leer, con el nombre de quien escribe y del estudiante. */
  mensajes?: { m: Mensaje; autor: string; estudiante: string }[];
  /** Entregas de tareas ya revisadas o devueltas por el docente (para la familia). */
  entregas?: { x: TareaEntrega; tarea: string }[];
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
  if (e.esFamilia) {
    for (const { t, area } of e.tareas ?? []) {
      if (t.eliminado) continue;
      res.push({
        id: `tarea-${t.id}`, tipo: "tarea", momento: t.updated_at ?? t.entrega,
        titulo: `Tarea de ${area}: ${t.titulo}`, detalle: `Entrega: ${fechaCorta(t.entrega)}${t.descripcion ? `. ${t.descripcion}` : ""}`,
        estudianteId: null, enlace: "/tareas", importante: false, nuevo: false,
      });
    }
  }

  for (const { x, tarea } of e.entregas ?? []) {
    if (x.eliminado || x.estado === "entregada") continue;
    res.push({
      id: `ent-${x.id}-${x.estado}`, tipo: "tarea", momento: x.updated_at ?? x.entregado_en,
      titulo: x.estado === "revisada" ? `Tarea revisada: ${tarea}` : `Corregir la tarea: ${tarea}`,
      detalle: x.revision ?? (x.estado === "revisada" ? "El docente revisó la entrega." : "El docente pidió corregir la entrega."),
      estudianteId: x.estudiante_id, enlace: "/tareas", importante: x.estado === "devuelta", nuevo: false,
    });
  }

  for (const { m, autor, estudiante } of e.mensajes ?? []) {
    if (m.eliminado || m.leido_en || m.autor_id === e.usuarioId) continue;
    res.push({
      id: `msg-${m.id}`, tipo: "mensaje", momento: m.enviado_en, titulo: `Mensaje de ${autor}`,
      detalle: `Sobre ${estudiante}: ${m.texto.length > 120 ? `${m.texto.slice(0, 117)}...` : m.texto}`,
      estudianteId: m.estudiante_id, enlace: "/mensajes", importante: true, nuevo: false,
    });
  }

  // Recordatorio del calendario: el día anterior y el mismo día.
  if (e.hoy) {
    const [a, m, d] = e.hoy.split("-").map(Number);
    const manana = new Date(a, m - 1, d + 1);
    const mananaTxt = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, "0")}-${String(manana.getDate()).padStart(2, "0")}`;
    for (const ev of e.eventos ?? []) {
      if (ev.eliminado || (ev.fecha !== e.hoy && ev.fecha !== mananaTxt)) continue;
      const esHoy = ev.fecha === e.hoy;
      res.push({
        id: `ev-${ev.id}-${ev.fecha}`, tipo: "evento", momento: `${e.hoy}T${esHoy ? "06" : "00"}:00:00`,
        titulo: `${esHoy ? "Hoy" : "Mañana"}: ${ev.titulo}`, detalle: [ev.hora ? `A las ${ev.hora}` : null, ev.descripcion].filter(Boolean).join(". ") || "Revise el calendario escolar.",
        estudianteId: null, enlace: "/calendario", importante: ev.tipo === "examen" || ev.tipo === "reunion", nuevo: false,
      });
    }
  }

  return res.sort((a, b) => b.momento.localeCompare(a.momento));
}
