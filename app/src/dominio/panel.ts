// Indicadores del colegio para el director y la UGEL. Función pura: recibe los datos ya leídos.
import type {
  Asistencia, AsistenciaSesion, Calificacion, Competencia, DocenteAsignacion, Estudiante, Incidencia, Justificacion, Matricula, NivelLogro,
} from "@/db/tipos";
import { calcularAvance } from "./notas";
import { indicadores } from "./seguimiento";

export interface EntradaPanel {
  hoy: string; // aaaa-mm-dd
  periodoId: string | null;
  /** Año escolar del panel: la asistencia de otros años (historial) no cuenta. */
  anio?: number;
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
export interface Composicion { P: number; T: number; F: number; J: number }
export interface PuntoSemana extends Composicion { semana: string; porcentaje: number | null; registros: number }
export interface PuntoDia { fecha: string; porcentaje: number | null; registros: number }
export interface FilaSeccion { seccionId: string; seccion: string; porcentaje: number | null; registros: number }
export interface PuntoMes { mes: string; n: number; tipos: Record<string, number> }
export interface EnRiesgo { estudiante: Estudiante; seccion: string; alertas: string[] }

export interface Panel {
  matriculados: number;
  asistencia30: number | null;
  /** Asistencia de los 30 días anteriores a esos 30 (para la variación). */
  asistenciaAnterior: number | null;
  avanceNotas: number | null;
  enRiesgo: EnRiesgo[];
  incidenciasAbiertas: number;
  sisevePendientes: number;
  justificacionesPendientes: number;
  distribucion: FilaDistribucion[];
  distribucionTotal: Record<NivelLogro, number>;
  semanas: PuntoSemana[];
  dias: PuntoDia[];
  porSeccion: FilaSeccion[];
  incidenciasPorTipo: { tipo: string; n: number }[];
  incidenciasPorMes: PuntoMes[];
}

const dia = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const isoDia = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Lunes de la semana de una fecha. */
export function lunesDe(fecha: string): string {
  const d = new Date(dia(fecha));
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
  return isoDia(d.getTime() - dow * 86400000);
}

const composicion = (marcas: Asistencia[]): Composicion => {
  const c = { P: 0, T: 0, F: 0, J: 0 };
  for (const m of marcas) c[m.estado]++;
  return c;
};

const pctAsistencia = (marcas: Asistencia[]) => {
  const base = marcas.filter((m) => m.estado !== "J");
  return base.length ? Math.round((base.filter((m) => m.estado === "P" || m.estado === "T").length / base.length) * 100) : null;
};

export function calcularPanel(e: EntradaPanel, semanasAtras = 14, mesesAtras = 6): Panel {
  const mats = e.matriculas.filter((m) => !m.eliminado && m.estado === "matriculado");
  const ids = new Set(mats.map((m) => m.estudiante_id));
  const seccionDe = new Map(mats.map((m) => [m.estudiante_id, m.seccion_id]));
  const secciones = new Set(mats.map((m) => m.seccion_id));
  const sesion = new Map(e.sesiones.filter((s) => !s.eliminado).map((s) => [s.id, s]));
  const marcas = e.asistencias.filter((a) => !a.eliminado && ids.has(a.estudiante_id) && sesion.has(a.sesion_id)
    && (!e.anio || sesion.get(a.sesion_id)!.fecha.startsWith(String(e.anio))));
  const fechaDe = (a: Asistencia) => sesion.get(a.sesion_id)!.fecha;

  // Asistencia de los últimos 30 días.
  const desde30 = isoDia(dia(e.hoy) - 30 * 86400000);
  const ultimos30 = marcas.filter((a) => fechaDe(a) >= desde30 && fechaDe(a) <= e.hoy);
  const asistencia30 = pctAsistencia(ultimos30);
  const desde60 = isoDia(dia(e.hoy) - 60 * 86400000);
  const asistenciaAnterior = pctAsistencia(marcas.filter((a) => fechaDe(a) >= desde60 && fechaDe(a) < desde30));

  // Por sección, últimos 30 días, de la más baja a la más alta.
  const porSeccion: FilaSeccion[] = [...secciones].map((sid) => {
    const deSec = ultimos30.filter((a) => seccionDe.get(a.estudiante_id) === sid);
    return { seccionId: sid, seccion: e.seccionNombre(sid), porcentaje: pctAsistencia(deSec), registros: deSec.length };
  }).sort((a, b) => (a.porcentaje ?? 101) - (b.porcentaje ?? 101) || a.seccion.localeCompare(b.seccion));

  // Serie semanal (lunes a domingo), de la más antigua a la actual.
  const lunesHoy = lunesDe(e.hoy);
  const semanas: PuntoSemana[] = [];
  for (let i = semanasAtras - 1; i >= 0; i--) {
    const inicio = isoDia(dia(lunesHoy) - i * 7 * 86400000);
    const fin = isoDia(dia(inicio) + 6 * 86400000);
    const deSemana = marcas.filter((a) => fechaDe(a) >= inicio && fechaDe(a) <= fin);
    semanas.push({ semana: inicio, porcentaje: pctAsistencia(deSemana), registros: deSemana.length, ...composicion(deSemana) });
  }

  // Serie diaria del mismo rango (solo días con registros).
  const desdeSerie = semanas[0]?.semana ?? e.hoy;
  const porDia = new Map<string, Asistencia[]>();
  for (const a of marcas) {
    const f = fechaDe(a);
    if (f >= desdeSerie && f <= e.hoy) porDia.set(f, [...(porDia.get(f) ?? []), a]);
  }
  const dias: PuntoDia[] = [...porDia].sort(([x], [y]) => x.localeCompare(y)).map(([fecha, m]) => ({ fecha, porcentaje: pctAsistencia(m), registros: m.length }));

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
  const distribucionTotal = { AD: 0, A: 0, B: 0, C: 0 };
  for (const f of distribucion) for (const n of ["AD", "A", "B", "C"] as const) distribucionTotal[n] += f.conteo[n];

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

  // Incidencias por mes (los últimos meses, incluido el actual, aunque no tengan casos).
  const incidenciasPorMes: PuntoMes[] = [];
  const [anioHoy, mesHoy] = e.hoy.split("-").map(Number);
  for (let k = mesesAtras - 1; k >= 0; k--) {
    const d = new Date(Date.UTC(anioHoy, mesHoy - 1 - k, 1));
    const mes = d.toISOString().slice(0, 7);
    const delMes = relevantes.filter((i) => i.fecha.startsWith(mes));
    const t: Record<string, number> = {};
    for (const i of delMes) t[i.tipo] = (t[i.tipo] ?? 0) + 1;
    incidenciasPorMes.push({ mes, n: delMes.length, tipos: t });
  }

  return {
    matriculados: ids.size,
    asistencia30,
    asistenciaAnterior,
    avanceNotas,
    enRiesgo,
    incidenciasAbiertas: relevantes.filter((i) => i.estado !== "cerrada").length,
    sisevePendientes: relevantes.filter((i) => i.requiere_siseve && !i.codigo_siseve?.trim()).length,
    justificacionesPendientes: e.justificaciones.filter((j) => !j.eliminado && j.estado === "pendiente" && ids.has(j.estudiante_id)).length,
    distribucion,
    distribucionTotal,
    semanas,
    dias,
    porSeccion,
    incidenciasPorTipo: [...tipos].map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n),
    incidenciasPorMes,
  };
}
