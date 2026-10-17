// Indicadores de seguimiento de un estudiante y alertas tempranas (riesgo de abandono o de no lograr
// las competencias). Las reglas son simples a propósito: el tutor ve el motivo de cada alerta.
import type { Asistencia, Calificacion, Incidencia } from "@/db/tipos";

export interface Indicadores {
  sesiones: number;
  faltas: number;
  tardanzas: number;
  justificadas: number;
  /** % de asistencia (presente o tardanza) sobre las sesiones registradas. null si no hay datos. */
  asistencia: number | null;
  notasC: number;
  notasB: number;
  incidenciasAbiertas: number;
  alertas: string[];
}

export const UMBRAL_FALTAS = 3;
export const UMBRAL_ASISTENCIA = 85;
export const UMBRAL_NOTAS_C = 2;

export function indicadores(p: {
  asistencias: Asistencia[];
  calificacionesPeriodo: Calificacion[];
  incidencias: Incidencia[];
}): Indicadores {
  const a = p.asistencias.filter((x) => !x.eliminado);
  const faltas = a.filter((x) => x.estado === "F").length;
  const tardanzas = a.filter((x) => x.estado === "T").length;
  const justificadas = a.filter((x) => x.estado === "J").length;
  const presentes = a.filter((x) => x.estado === "P" || x.estado === "T").length;
  // Las justificadas no cuentan en contra.
  const base = a.length - justificadas;
  const asistencia = base > 0 ? Math.round((presentes / base) * 100) : null;
  const notas = p.calificacionesPeriodo.filter((c) => !c.eliminado);
  const notasC = notas.filter((c) => c.nivel_logro === "C").length;
  const notasB = notas.filter((c) => c.nivel_logro === "B").length;
  const incidenciasAbiertas = p.incidencias.filter((i) => !i.eliminado && i.estado !== "cerrada").length;

  const alertas: string[] = [];
  if (faltas >= UMBRAL_FALTAS) alertas.push(`${faltas} faltas sin justificar`);
  else if (asistencia !== null && a.length >= 5 && asistencia < UMBRAL_ASISTENCIA) alertas.push(`Asistencia de ${asistencia}%`);
  if (notasC >= UMBRAL_NOTAS_C) alertas.push(`${notasC} competencias en inicio (C)`);
  if (incidenciasAbiertas > 0) alertas.push(`${incidenciasAbiertas} ${incidenciasAbiertas === 1 ? "incidencia abierta" : "incidencias abiertas"}`);

  return { sesiones: a.length, faltas, tardanzas, justificadas, asistencia, notasC, notasB, incidenciasAbiertas, alertas };
}
