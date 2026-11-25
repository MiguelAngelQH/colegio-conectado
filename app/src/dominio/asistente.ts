/**
 * "Tu día": sugerencias del asistente para la pantalla de inicio.
 * Mira la hora, el horario, lo pendiente y las alertas, y propone lo más importante primero.
 * Es una función pura: recibe los datos ya reunidos y devuelve las sugerencias ordenadas.
 */

export type TipoSugerencia =
  | "clase" | "proxima" | "notas" | "entregas" | "justificaciones" | "mensajes" | "riesgo"
  | "tarea" | "devuelta" | "evento" | "avance";

export interface Sugerencia {
  id: string;
  tipo: TipoSugerencia;
  /** Mayor = más arriba. */
  prioridad: number;
  titulo: string;
  detalle: string;
  ruta: string;
  accion: string;
}

export interface ClaseHorario {
  seccionId: string;
  areaId: string | null;
  dia: number; // 1 = lunes ... 5 = viernes
  inicio: string; // "08:00"
  fin: string;
  area: string;
  seccion: string;
}

export interface EntradaAsistente {
  ahora: Date;
  /** Clases del docente (o de la sección del estudiante). */
  clases: ClaseHorario[];
  /** El usuario dicta esas clases (si no, solo se informan). */
  dicta: boolean;
  /** Sesiones de asistencia que el docente ya abrió hoy. */
  sesionesHoy: { seccionId: string; areaId: string | null }[];
  periodo?: { nombre: string; fin: string };
  /** Notas que faltan en cada curso del docente en el periodo vigente. */
  notasFaltantes: { curso: string; faltan: number }[];
  entregasPorRevisar: number;
  justificacionesPendientes: number;
  mensajesSinLeer: { cantidad: number; de: string | null };
  /** Estudiantes (de la tutoría o hijos) con faltas recientes. */
  faltasRecientes: { estudianteId: string; nombre: string; faltas: number; ruta: string }[];
  /** Tareas de la familia aún no entregadas o devueltas. */
  tareas: { id: string; titulo: string; area: string; entrega: string; estado: "pendiente" | "devuelta"; quien: string | null }[];
  eventos: { titulo: string; fecha: string }[];
  /** Directivos: cursos con poco avance de notas. */
  avanceBajo: { docente: string; porcentaje: number }[];
}

const MAX = 5;
/** Días antes del cierre del periodo en que se empieza a avisar de notas faltantes. */
export const AVISAR_NOTAS_DIAS = 21;
/** Faltas en las últimas dos semanas a partir de las que se sugiere conversar. */
export const FALTAS_ALERTA = 3;

const fechaISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T12:00:00`) - Date.parse(`${desde}T12:00:00`)) / 86400000);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function sugerenciasDelDia(e: EntradaAsistente): Sugerencia[] {
  const s: Sugerencia[] = [];
  const hoy = fechaISO(e.ahora);
  const dia = e.ahora.getDay();
  const ahoraMin = e.ahora.getHours() * 60 + e.ahora.getMinutes();
  const deHoy = e.clases.filter((c) => c.dia === dia).sort((a, b) => a.inicio.localeCompare(b.inicio));

  // 1. La clase de este momento (o la que empieza pronto).
  const actual = deHoy.find((c) => minutos(c.inicio) - 10 <= ahoraMin && ahoraMin < minutos(c.fin));
  const proxima = deHoy.find((c) => minutos(c.inicio) - 10 > ahoraMin && minutos(c.inicio) - ahoraMin <= 60);
  if (actual) {
    const tomada = e.sesionesHoy.some((x) => x.seccionId === actual.seccionId && (x.areaId ?? null) === (actual.areaId ?? null));
    if (e.dicta && !tomada) {
      s.push({
        id: "clase", tipo: "clase", prioridad: 100,
        titulo: `Ahora: ${actual.area} con ${actual.seccion}`,
        detalle: `De ${actual.inicio} a ${actual.fin}. Todavía no tomó asistencia de esta clase.`,
        ruta: `/asistencia?seccion=${actual.seccionId}${actual.areaId ? `&area=${actual.areaId}` : ""}`, accion: "Tomar asistencia",
      });
    } else if (!e.dicta) {
      s.push({ id: "clase", tipo: "clase", prioridad: 60, titulo: `Ahora: ${actual.area}`, detalle: `Clase de ${actual.inicio} a ${actual.fin}.`, ruta: "/horario", accion: "Ver horario" });
    }
  } else if (proxima) {
    const faltan = minutos(proxima.inicio) - ahoraMin;
    s.push({
      id: "proxima", tipo: "proxima", prioridad: 55,
      titulo: `En ${faltan} min: ${proxima.area}${e.dicta ? ` con ${proxima.seccion}` : ""}`,
      detalle: `Empieza a las ${proxima.inicio}.`, ruta: "/horario", accion: "Ver horario",
    });
  }

  // 2. Notas que faltan cuando se acerca el cierre del periodo.
  if (e.periodo) {
    const quedan = diasEntre(hoy, e.periodo.fin);
    const faltantes = e.notasFaltantes.filter((n) => n.faltan > 0).sort((a, b) => b.faltan - a.faltan);
    const total = faltantes.reduce((t, n) => t + n.faltan, 0);
    if (total > 0 && quedan >= 0 && quedan <= AVISAR_NOTAS_DIAS) {
      const cuando = quedan === 0 ? "cierra hoy" : quedan === 1 ? "cierra mañana" : `cierra en ${quedan} días`;
      s.push({
        id: "notas", tipo: "notas", prioridad: quedan <= 5 ? 95 : 70,
        titulo: `${total === 1 ? "Falta" : "Faltan"} ${plural(total, "nota", "notas")}: el ${e.periodo.nombre} ${cuando}`,
        detalle: faltantes.length === 1 ? faltantes[0].curso : `La mayoría en ${faltantes[0].curso}${faltantes.length > 1 ? ` y ${plural(faltantes.length - 1, "curso más", "cursos más")}` : ""}.`,
        ruta: "/notas", accion: "Completar notas",
      });
    }
  }

  // 3. Faltas seguidas: conviene conversar con la familia.
  for (const f of [...e.faltasRecientes].filter((x) => x.faltas >= FALTAS_ALERTA).sort((a, b) => b.faltas - a.faltas).slice(0, 2)) {
    s.push({
      id: `riesgo-${f.estudianteId}`, tipo: "riesgo", prioridad: 80 + f.faltas,
      titulo: `${f.nombre} faltó ${f.faltas} veces en dos semanas`,
      detalle: "Conviene conversar con su familia antes de que se atrase.", ruta: f.ruta, accion: "Ver seguimiento",
    });
  }

  // 4. Tareas de la familia: devueltas, que vencen hoy o mañana, o vencidas.
  for (const t of e.tareas) {
    const quien = t.quien ? `${t.quien}: ` : "";
    if (t.estado === "devuelta") {
      s.push({ id: `tarea-${t.id}`, tipo: "devuelta", prioridad: 85, titulo: `${quien}corregir "${t.titulo}"`, detalle: `${t.area}. El docente la devolvió con comentarios.`, ruta: "/tareas", accion: "Ver tarea" });
      continue;
    }
    const d = diasEntre(hoy, t.entrega);
    if (d < 0 && d >= -7) s.push({ id: `tarea-${t.id}`, tipo: "tarea", prioridad: 75, titulo: `${quien}"${t.titulo}" está atrasada`, detalle: `${t.area}. Venció hace ${plural(-d, "día", "días")}.`, ruta: "/tareas", accion: "Entregar" });
    else if (d === 0) s.push({ id: `tarea-${t.id}`, tipo: "tarea", prioridad: 90, titulo: `${quien}"${t.titulo}" vence hoy`, detalle: t.area, ruta: "/tareas", accion: "Entregar" });
    else if (d === 1) s.push({ id: `tarea-${t.id}`, tipo: "tarea", prioridad: 78, titulo: `${quien}"${t.titulo}" vence mañana`, detalle: t.area, ruta: "/tareas", accion: "Ver tarea" });
  }

  // 5. Pendientes de revisión del personal.
  if (e.entregasPorRevisar > 0)
    s.push({ id: "entregas", tipo: "entregas", prioridad: 65, titulo: `${plural(e.entregasPorRevisar, "entrega", "entregas")} de tareas por revisar`, detalle: "Revíselas o devuélvalas con un comentario.", ruta: "/tareas", accion: "Revisar" });
  if (e.justificacionesPendientes > 0)
    s.push({ id: "justificaciones", tipo: "justificaciones", prioridad: 68, titulo: `${plural(e.justificacionesPendientes, "justificación", "justificaciones")} por revisar`, detalle: "Al aprobarlas se actualiza la asistencia.", ruta: "/asistencia/justificaciones", accion: "Revisar" });

  // 6. Mensajes sin leer.
  if (e.mensajesSinLeer.cantidad > 0)
    s.push({
      id: "mensajes", tipo: "mensajes", prioridad: 72,
      titulo: e.mensajesSinLeer.cantidad === 1 ? `Mensaje nuevo${e.mensajesSinLeer.de ? ` de ${e.mensajesSinLeer.de}` : ""}` : `${e.mensajesSinLeer.cantidad} mensajes sin leer`,
      detalle: "Responder pronto ayuda a la familia y al docente.", ruta: "/mensajes", accion: "Leer",
    });

  // 7. Eventos de hoy y mañana.
  for (const ev of e.eventos) {
    const d = diasEntre(hoy, ev.fecha);
    if (d === 0 || d === 1)
      s.push({ id: `evento-${ev.titulo}-${ev.fecha}`, tipo: "evento", prioridad: d === 0 ? 62 : 50, titulo: `${d === 0 ? "Hoy" : "Mañana"}: ${ev.titulo}`, detalle: "Del calendario escolar.", ruta: "/calendario", accion: "Ver calendario" });
  }

  // 8. Directivos: cursos atrasados cuando se acerca el cierre.
  if (e.periodo && e.avanceBajo.length) {
    const quedan = diasEntre(hoy, e.periodo.fin);
    if (quedan >= 0 && quedan <= 14) {
      const peor = [...e.avanceBajo].sort((a, b) => a.porcentaje - b.porcentaje);
      s.push({
        id: "avance", tipo: "avance", prioridad: 74,
        titulo: `${plural(peor.length, "docente lleva", "docentes llevan")} menos de la mitad de notas`,
        detalle: `El ${e.periodo.nombre} cierra en ${plural(quedan, "día", "días")}. ${peor[0].docente} va en ${peor[0].porcentaje}%.`,
        ruta: "/notas", accion: "Ver avance",
      });
    }
  }

  return s.sort((a, b) => b.prioridad - a.prioridad).slice(0, MAX);
}
