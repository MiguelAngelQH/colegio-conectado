// Situación final del estudiante al cerrar el año (RVM 094-2020-MINEDU y modificatorias).
// La app PROPONE la situación y la dirección la confirma o corrige con motivo: el SIAGIE sigue siendo
// la fuente oficial. Algunos umbrales se redactan distinto según la fuente ("la mitad o más" frente a
// "más de la mitad"), por eso las reglas son configurables.
import type { Area, Calificacion, Competencia, Grado, NivelLogro, Periodo, SituacionFinal } from "@/db/tipos";

export const NOMBRE_SITUACION: Record<SituacionFinal, string> = {
  PRO: "Promovido(a)", RR: "Requiere recuperación", PER: "Permanece en el grado",
};

type Nivel = Grado["nivel"];

export interface Reglas {
  /** Grados con promoción automática (1.º de primaria). */
  automatica: Record<Nivel, number[]>;
  /** Grados finales de ciclo; los demás son intermedios. */
  finalesDeCiclo: Record<Nivel, number[]>;
  /** Cómo se cuenta "la mitad" de las competencias de un área. */
  criterioMitad: "mitad_o_mas" | "mas_de_la_mitad";
  /** Áreas con A o AD que pide la promoción en grados finales de ciclo. */
  areasPromocionFinal: Record<Nivel, number>;
  /** Áreas con C en la mitad de sus competencias que llevan a permanecer en el grado. */
  areasPermanencia: number;
}

export const REGLAS_POR_DEFECTO: Reglas = {
  automatica: { primaria: [1], secundaria: [] },
  finalesDeCiclo: { primaria: [2, 4, 6], secundaria: [2, 5] },
  criterioMitad: "mitad_o_mas",
  areasPromocionFinal: { primaria: 4, secundaria: 3 },
  areasPermanencia: 4,
};

/** Cuántas competencias son "la mitad" de n. Con "la mitad o más", 5 → 3, 3 → 2, 4 → 2, 1 → 1. */
export function mitad(n: number, criterio: Reglas["criterioMitad"]): number {
  if (n <= 0) return 0;
  return criterio === "mitad_o_mas" ? Math.ceil(n / 2) : Math.floor(n / 2) + 1;
}

const esBoMas = (n: NivelLogro) => n !== "C";
const esAoAD = (n: NivelLogro) => n === "A" || n === "AD";
const cuenta = (niveles: NivelLogro[], f: (n: NivelLogro) => boolean) => niveles.filter(f).length;

/** Nivel final de una competencia: el del último periodo en que se calificó (no se promedia). */
export function nivelFinal(califs: Calificacion[], periodos: Periodo[]): NivelLogro | null {
  const numero = new Map(periodos.map((p) => [p.id, p.numero]));
  const conNota = califs.filter((c) => !c.eliminado && c.nivel_logro && numero.has(c.periodo_id));
  if (!conNota.length) return null;
  return conNota.sort((a, b) => numero.get(b.periodo_id)! - numero.get(a.periodo_id)!)[0].nivel_logro;
}

/**
 * Niveles finales de un estudiante agrupados por área, sin las competencias transversales (no cuentan
 * para la situación final). "faltantes" son las competencias del nivel que no tienen ninguna nota.
 */
export function notasFinales(p: {
  estudianteId: string; calificaciones: Calificacion[]; competencias: Competencia[]; areas: Area[]; periodos: Periodo[]; nivel: Nivel;
  /** Áreas que se evaluaron en su sección (las que tienen docente asignado o notas). */
  areasEvaluadas?: Set<string>;
}): { porArea: Record<string, NivelLogro[]>; faltantes: number } {
  const areas = p.areas.filter((a) => a.nivel === p.nivel && !a.eliminado && a.codigo !== "TRV" && (!p.areasEvaluadas || p.areasEvaluadas.has(a.id)));
  const delEstudiante = p.calificaciones.filter((c) => c.estudiante_id === p.estudianteId);
  const porArea: Record<string, NivelLogro[]> = {};
  let faltantes = 0;
  for (const a of areas) {
    const niveles: NivelLogro[] = [];
    for (const k of p.competencias.filter((c) => c.area_id === a.id && !c.eliminado)) {
      const n = nivelFinal(delEstudiante.filter((c) => c.competencia_id === k.id), p.periodos);
      if (n) niveles.push(n);
      else faltantes++;
    }
    if (niveles.length) porArea[a.id] = niveles;
  }
  return { porArea, faltantes };
}

export interface Propuesta { situacion: SituacionFinal; motivo: string }

/** Situación final propuesta según el grado y los niveles finales por área. */
export function situacionPropuesta(p: { nivel: Nivel; grado: number; notas: Record<string, NivelLogro[]>; reglas?: Reglas }): Propuesta {
  const r = p.reglas ?? REGLAS_POR_DEFECTO;
  const textoMitad = r.criterioMitad === "mitad_o_mas" ? "la mitad o más" : "más de la mitad";
  if (r.automatica[p.nivel].includes(p.grado)) return { situacion: "PRO", motivo: "Promoción automática en este grado." };

  const areas = Object.values(p.notas).filter((n) => n.length > 0);
  const cumple = (niveles: NivelLogro[], f: (n: NivelLogro) => boolean) => cuenta(niveles, f) >= mitad(niveles.length, r.criterioMitad);
  const areasConC = areas.filter((n) => cumple(n, (x) => x === "C")).length;

  if (r.finalesDeCiclo[p.nivel].includes(p.grado)) {
    const conAoAD = areas.filter((n) => cumple(n, esAoAD)).length;
    const resto = areas.filter((n) => !cumple(n, esAoAD));
    if (conAoAD >= r.areasPromocionFinal[p.nivel] && resto.every((n) => cumple(n, esBoMas))) {
      return { situacion: "PRO", motivo: `A o AD en ${textoMitad} de las competencias de ${conAoAD} áreas, y B o más en las demás.` };
    }
  } else if (areas.every((n) => cumple(n, esBoMas))) {
    return { situacion: "PRO", motivo: `B o más en ${textoMitad} de las competencias de todas las áreas.` };
  }

  if (areasConC >= r.areasPermanencia) {
    return { situacion: "PER", motivo: `C en ${textoMitad} de las competencias de ${areasConC} áreas.` };
  }
  return { situacion: "RR", motivo: "No alcanza las condiciones de promoción: requiere recuperación pedagógica en las áreas con C." };
}

/** Resultado de la recuperación pedagógica, con los niveles alcanzados en las áreas que recuperó. */
export function resultadoRecuperacion(p: { nivel: Nivel; grado: number; notasRecuperacion: Record<string, NivelLogro[]>; reglas?: Reglas }): "PRO" | "PER" {
  const r = p.reglas ?? REGLAS_POR_DEFECTO;
  const areas = Object.values(p.notasRecuperacion).filter((n) => n.length > 0);
  // Se tolera una sola área con C en todas sus competencias.
  const todoC = areas.filter((n) => n.every((x) => x === "C"));
  if (todoC.length > 1) return "PER";
  const evaluadas = areas.filter((n) => !n.every((x) => x === "C"));
  const final = r.finalesDeCiclo[p.nivel].includes(p.grado);
  const ok = final
    ? evaluadas.every((n) => cuenta(n, esAoAD) >= mitad(n.length, r.criterioMitad) && n.every((x) => esAoAD(x) || x === "B"))
    : evaluadas.every((n) => n.every(esBoMas));
  return ok ? "PRO" : "PER";
}
