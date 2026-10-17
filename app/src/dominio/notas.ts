// Reglas de evaluación por competencias (CNEB, RVM 094-2020-MINEDU).
import type { Area, Calificacion, Competencia, DocenteAsignacion, Matricula, NivelLogro, Periodo } from "@/db/tipos";

export const NIVELES: NivelLogro[] = ["AD", "A", "B", "C"];

export const DESCRIPCION_NIVEL: Record<NivelLogro, { nombre: string; texto: string }> = {
  AD: { nombre: "Logro destacado", texto: "Evidencia un nivel superior a lo esperado respecto a la competencia." },
  A: { nombre: "Logro esperado", texto: "Evidencia el nivel esperado respecto a la competencia, demostrando manejo satisfactorio en todas las tareas propuestas." },
  B: { nombre: "En proceso", texto: "Está próximo o cerca al nivel esperado respecto a la competencia, para lo cual requiere acompañamiento durante un tiempo razonable." },
  C: { nombre: "En inicio", texto: "Muestra un progreso mínimo en una competencia de acuerdo al nivel esperado. Necesita mayor tiempo de acompañamiento e intervención del docente." },
};

/** La norma pide conclusión descriptiva cuando el nivel es B o C. */
export const requiereConclusion = (n: NivelLogro | null | undefined) => n === "B" || n === "C";

export const faltaConclusion = (c: Pick<Calificacion, "nivel_logro" | "conclusion">) =>
  requiereConclusion(c.nivel_logro) && !c.conclusion?.trim();

/** Frases de inicio para escribir rápido desde el celular (el docente las completa). */
export const PLANTILLAS_CONCLUSION: Record<"B" | "C", string[]> = {
  B: [
    "Logra parcialmente lo esperado; necesita apoyo para ",
    "Resuelve situaciones sencillas, pero aún le cuesta ",
    "Muestra avances; se recomienda reforzar ",
  ],
  C: [
    "Requiere acompañamiento constante para ",
    "Presenta dificultades para ",
    "Se recomienda reforzamiento en el aula y en casa para ",
  ],
};

// ------------------------------------------------------------------ ids determinísticos
// Dos equipos sin conexión que califican al mismo estudiante en la misma competencia y periodo
// generan el MISMO id: sus cambios se fusionan en lugar de chocar en el servidor.

function aUuid(bytes: Uint8Array): string {
  const b = bytes.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // versión 5 (basado en nombre)
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Hash de respaldo (cyrb128) para navegadores sin crypto.subtle (páginas sin HTTPS). */
function hashRespaldo(s: string): Uint8Array {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < s.length; i++) {
    const k = s.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const out = new Uint8Array(16);
  new DataView(out.buffer).setUint32(0, (h1 ^ h2 ^ h3 ^ h4) >>> 0);
  new DataView(out.buffer).setUint32(4, (h2 ^ h1) >>> 0);
  new DataView(out.buffer).setUint32(8, (h3 ^ h1) >>> 0);
  new DataView(out.buffer).setUint32(12, (h4 ^ h1) >>> 0);
  return out;
}

export async function idDeterministico(espacio: string, ...partes: string[]): Promise<string> {
  const texto = `${espacio}|${partes.join("|")}`;
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const hash = await subtle.digest("SHA-1", new TextEncoder().encode(texto));
    return aUuid(new Uint8Array(hash));
  }
  return aUuid(hashRespaldo(texto));
}

export const idCalificacion = (estudianteId: string, competenciaId: string, periodoId: string) =>
  idDeterministico("calificacion", estudianteId, competenciaId, periodoId);

// ------------------------------------------------------------------ avance del registro

export interface AvanceAsignacion {
  asignacion: DocenteAsignacion;
  esperadas: number;
  registradas: number;
  sinConclusion: number;
  porcentaje: number;
}

/** Cuántas notas se esperan y cuántas hay por cada asignación (docente-sección-área) en un periodo. */
export function calcularAvance(params: {
  periodoId: string;
  asignaciones: DocenteAsignacion[];
  matriculas: Matricula[];
  competencias: Competencia[];
  calificaciones: Calificacion[];
}): AvanceAsignacion[] {
  const { periodoId, asignaciones, matriculas, competencias, calificaciones } = params;
  const delPeriodo = calificaciones.filter((c) => c.periodo_id === periodoId && !c.eliminado);
  return asignaciones.filter((a) => !a.eliminado).map((a) => {
    const estudiantes = new Set(matriculas.filter((m) => m.seccion_id === a.seccion_id && !m.eliminado && m.estado === "matriculado").map((m) => m.estudiante_id));
    const comps = new Set(competencias.filter((c) => c.area_id === a.area_id && !c.eliminado).map((c) => c.id));
    const notas = delPeriodo.filter((c) => c.seccion_id === a.seccion_id && comps.has(c.competencia_id) && estudiantes.has(c.estudiante_id) && c.nivel_logro);
    const esperadas = estudiantes.size * comps.size;
    return {
      asignacion: a,
      esperadas,
      registradas: notas.length,
      sinConclusion: notas.filter(faltaConclusion).length,
      porcentaje: esperadas ? Math.round((notas.length / esperadas) * 100) : 0,
    };
  });
}

// ------------------------------------------------------------------ libreta

export interface FilaLibreta {
  area: Area;
  competencias: {
    competencia: Competencia;
    niveles: (NivelLogro | null)[]; // uno por periodo
    conclusion: string | null;       // la del último periodo con nota
  }[];
}

/** Arma el contenido del informe de progreso de un estudiante. */
export function armarLibreta(params: {
  estudianteId: string;
  areas: Area[];
  competencias: Competencia[];
  periodos: Periodo[];
  calificaciones: Calificacion[];
}): FilaLibreta[] {
  const { estudianteId, areas, competencias, periodos, calificaciones } = params;
  const propias = calificaciones.filter((c) => c.estudiante_id === estudianteId && !c.eliminado);
  const ordenPeriodos = [...periodos].sort((a, b) => a.numero - b.numero);
  return [...areas]
    .sort((a, b) => a.orden - b.orden)
    .map((area) => ({
      area,
      competencias: competencias
        .filter((c) => c.area_id === area.id && !c.eliminado)
        .sort((a, b) => a.orden - b.orden)
        .map((competencia) => {
          const porPeriodo = ordenPeriodos.map((p) => propias.find((c) => c.competencia_id === competencia.id && c.periodo_id === p.id));
          const ultima = [...porPeriodo].reverse().find((c) => c?.nivel_logro);
          return {
            competencia,
            niveles: porPeriodo.map((c) => c?.nivel_logro ?? null),
            conclusion: ultima?.conclusion?.trim() || null,
          };
        }),
    }))
    // Solo se incluyen las áreas en las que el estudiante tiene al menos una nota.
    .filter((f) => f.competencias.some((c) => c.niveles.some(Boolean)));
}
