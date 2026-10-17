// Indicadores del colegio para el director y la UGEL. Función pura: recibe los datos ya leídos.
import type {
  Asistencia, AsistenciaSesion, Calificacion, Competencia, DocenteAsignacion, Estudiante, Incidencia, Justificacion, Matricula, NivelLogro,
} from "@/db/tipos";
import { calcularAvance } from "./notas";
import { indicadores } from "./seguimiento";

export interface EntradaPanel {
  hoy: string; // aaaa-mm-dd
  periodoId: string | null;
  estudiantes: Estudiante[];
  matriculas: Matricula[]; // del año activo, ya filtradas por sección/nivel si corresponde
  seccionNombre: (id: string) => string;
  sesiones: AsistenciaSesion[];
  asistencias: Asistencia[];
  calificaciones: Calificacion[];
  competencias: Competencia[];
  areaNombre: (id: string) => string;
  asignaciones: DocenteAsignacion[];
  incidencias: Incidencia[];
  justificaciones: Justificacion[];
}

export interface FilaDistribucion { area: string; conteo: Record<NivelLogro, number>; total: number }
export interface PuntoSemana { semana: string; porcentaje: number | null; registros: number }
export interface EnRiesgo { estudiante: Estudiante; seccion: string; alertas: string[] }

export interface Panel {
  matriculados: number;
  asistencia30: number | null;
  avanceNotas: number | null;
  enRiesgo: EnRiesgo[];
  incidenciasAbiertas: number;
  sisevePendientes: number;
  justificacionesPendientes: number;
  distribucion: FilaDistribucion[];
  semanas: PuntoSemana[];
  incidenciasPorTipo: { tipo: string; n: number }[];
}

const dia = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const isoDia = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Lunes de la semana de una fecha. */
export function lunesDe(fecha: string): string {
  const d = new Date(dia(fecha));
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
  return isoDia(d.getTime() - dow * 86400000);
}

const pctAsistencia = (marcas: Asistencia[]) => {
  const base = marcas.filter((m) => m.estado !== "J");
  return base.length ? Math.round((base.filter((m) => m.estado === "P" || m.estado === "T").length / base.length) * 100) : null;
};

export function calcularPanel(e: EntradaPanel, semanasAtras = 8): Panel {
  const mats = e.matriculas.filter((m) => !m.eliminado && m.estado === "matriculado");
  const ids = new Set(mats.map((m) => m.estudiante_id));
  const seccionDe = new Map(mats.map((m) => [m.estudiante_id, m.seccion_id]));
  const secciones = new Set(mats.map((m) => m.seccion_id));
  const sesion = new Map(e.sesiones.filter((s) => !s.eliminado).map((s) => [s.id, s]));
  const marcas = e.asistencias.filter((a) => !a.eliminado && ids.has(a.estudiante_id) && sesion.has(a.sesion_id));
  const fechaDe = (a: Asistencia) => sesion.get(a.sesion_id)!.fecha;

  // Asistencia de los últimos 30 días.
  const desde30 = isoDia(dia(e.hoy) - 30 * 86400000);
  const asistencia30 = pctAsistencia(marcas.filter((a) => fechaDe(a) >= desde30 && fechaDe(a) <= e.hoy));

  // Serie semanal (lunes a domingo), de la más antigua a la actual.
  const lunesHoy = lunesDe(e.hoy);
  const semanas: PuntoSemana[] = [];
  for (let i = semanasAtras - 1; i >= 0; i--) {
    const inicio = isoDia(dia(lunesHoy) - i * 7 * 86400000);
    const fin = isoDia(dia(inicio) + 6 * 86400000);
    const deSemana = marcas.filter((a) => fechaDe(a) >= inicio && fechaDe(a) <= fin);
    semanas.push({ semana: inicio, porcentaje: pctAsistencia(deSemana), registros: deSemana.length });
  }

  // Avance del registro de notas del periodo.
  const asig = e.asignaciones.filter((a) => !a.eliminado && secciones.has(a.seccion_id));
  const avance = e.periodoId ? calcularAvance({ periodoId: e.periodoId, asignaciones: asig, matriculas: mats, competencias: e.competencias, calificaciones: e.calificaciones }) : [];
  const esperadas = avance.reduce((s, a) => s + a.esperadas, 0);
  const avanceNotas = esperadas ? Math.round((avance.reduce((s, a) => s + a.registradas, 0) / esperadas) * 100) : null;

  // Distribución de logros por área en el periodo.
  const areaDe = new Map(e.competencias.map((c) => [c.id, c.area_id]));
  const porArea = new Map<string, FilaDistribucion>();
  for (const c of e.calificaciones) {
    if (c.eliminado || c.periodo_id !== e.periodoId || !c.nivel_logro || !ids.has(c.estudiante_id)) continue;
    const areaId = areaDe.get(c.competencia_id);
    if (!areaId) continue;
    const f = porArea.get(areaId) ?? { area: e.areaNombre(areaId), conteo: { AD: 0, A: 0, B: 0, C: 0 }, total: 0 };
    f.conteo[c.nivel_logro]++;
    f.total++;
    porArea.set(areaId, f);
  }
  const distribucion = [...porArea.values()].sort((a, b) => a.area.localeCompare(b.area));

  // Estudiantes en riesgo: mismas reglas que la ficha de seguimiento del tutor.
  const inc = e.incidencias.filter((i) => !i.eliminado);
  const enRiesgo: EnRiesgo[] = e.estudiantes
    .filter((x) => ids.has(x.id))
    .map((x) => ({
      estudiante: x,
      seccion: e.seccionNombre(seccionDe.get(x.id)!),
      alertas: indicadores({
        asistencias: marcas.filter((a) => a.estudiante_id === x.id),
        calificacionesPeriodo: e.calificaciones.filter((c) => c.estudiante_id === x.id && c.periodo_id === e.periodoId),
        incidencias: inc.filter((i) => i.estudiante_id === x.id),
      }).alertas,
    }))
    .filter((r) => r.alertas.length > 0)
    .sort((a, b) => b.alertas.length - a.alertas.length || a.estudiante.apellidos.localeCompare(b.estudiante.apellidos));

  const relevantes = inc.filter((i) => !i.estudiante_id || ids.has(i.estudiante_id));
  const tipos = new Map<string, number>();
  for (const i of relevantes) tipos.set(i.tipo, (tipos.get(i.tipo) ?? 0) + 1);

  return {
    matriculados: ids.size,
    asistencia30,
    avanceNotas,
    enRiesgo,
    incidenciasAbiertas: relevantes.filter((i) => i.estado !== "cerrada").length,
    sisevePendientes: relevantes.filter((i) => i.requiere_siseve && !i.codigo_siseve?.trim()).length,
    justificacionesPendientes: e.justificaciones.filter((j) => !j.eliminado && j.estado === "pendiente" && ids.has(j.estudiante_id)).length,
    distribucion,
    semanas,
    incidenciasPorTipo: [...tipos].map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n),
  };
}
