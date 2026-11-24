// Capacidades de cada competencia del Currículo Nacional (CNEB 2016), por número oficial de
// competencia. El docente califica cada capacidad y el logro de la competencia se calcula
// como en el registro auxiliar del colegio: AD=3, A=2, B=1, C=0, promedio redondeado.
import type { NivelLogro } from "@/db/tipos";

const ORAL = (lengua: string) => [
  "Obtiene información del texto oral",
  "Infiere e interpreta información del texto oral",
  "Adecúa, organiza y desarrolla las ideas de forma coherente y cohesionada",
  "Utiliza recursos no verbales y paraverbales de forma estratégica",
  "Interactúa estratégicamente con distintos interlocutores",
  `Reflexiona y evalúa la forma, el contenido y contexto del texto oral${lengua}`,
];
const LEE = [
  "Obtiene información del texto escrito",
  "Infiere e interpreta información del texto",
  "Reflexiona y evalúa la forma, el contenido y contexto del texto",
];
const ESCRIBE = [
  "Adecúa el texto a la situación comunicativa",
  "Organiza y desarrolla las ideas de forma coherente y cohesionada",
  "Utiliza convenciones del lenguaje escrito de forma pertinente",
  "Reflexiona y evalúa la forma, el contenido y contexto del texto escrito",
];

export const CAPACIDADES: Record<number, string[]> = {
  1: ["Comprende su cuerpo", "Se expresa corporalmente"],
  2: ["Comprende las relaciones entre la actividad física, alimentación, postura e higiene personal y del ambiente, y la salud", "Incorpora prácticas que mejoran su calidad de vida"],
  3: ["Se relaciona utilizando sus habilidades sociomotrices", "Crea y aplica estrategias y tácticas de juego"],
  4: ["Se valora a sí mismo", "Autorregula sus emociones", "Reflexiona y argumenta éticamente", "Vive su sexualidad de manera integral y responsable de acuerdo a su etapa de desarrollo y madurez"],
  5: ORAL(""),
  6: LEE,
  7: ESCRIBE,
  8: ["Percibe manifestaciones artístico-culturales", "Contextualiza manifestaciones artístico-culturales", "Reflexiona creativa y críticamente sobre manifestaciones artístico-culturales"],
  9: ["Explora y experimenta los lenguajes artísticos", "Aplica procesos creativos", "Evalúa y comunica sus procesos y proyectos"],
  10: ORAL(""),
  11: LEE,
  12: ESCRIBE,
  13: ORAL(""),
  14: LEE,
  15: ESCRIBE,
  16: ["Interactúa con todas las personas", "Construye normas y asume acuerdos y leyes", "Maneja conflictos de manera constructiva", "Delibera sobre asuntos públicos", "Participa en acciones que promueven el bienestar común"],
  17: ["Interpreta críticamente fuentes diversas", "Comprende el tiempo histórico", "Elabora explicaciones sobre procesos históricos"],
  18: ["Comprende las relaciones entre los elementos naturales y sociales", "Maneja fuentes de información para comprender el espacio geográfico y el ambiente", "Genera acciones para conservar el ambiente local y global"],
  19: ["Comprende las relaciones entre los elementos del sistema económico y financiero", "Toma decisiones económicas y financieras"],
  20: ["Problematiza situaciones para hacer indagación", "Diseña estrategias para hacer indagación", "Genera y registra datos o información", "Analiza datos e información", "Evalúa y comunica el proceso y resultados de su indagación"],
  21: ["Comprende y usa conocimientos sobre los seres vivos, materia y energía, biodiversidad, Tierra y universo", "Evalúa las implicancias del saber y del quehacer científico y tecnológico"],
  22: ["Determina una alternativa de solución tecnológica", "Diseña la alternativa de solución tecnológica", "Implementa y valida la alternativa de solución tecnológica", "Evalúa y comunica el funcionamiento y los impactos de su alternativa de solución tecnológica"],
  23: ["Traduce cantidades a expresiones numéricas", "Comunica su comprensión sobre los números y las operaciones", "Usa estrategias y procedimientos de estimación y cálculo", "Argumenta afirmaciones sobre las relaciones numéricas y las operaciones"],
  24: ["Traduce datos y condiciones a expresiones algebraicas y gráficas", "Comunica su comprensión sobre las relaciones algebraicas", "Usa estrategias y procedimientos para encontrar equivalencias y reglas generales", "Argumenta afirmaciones sobre relaciones de cambio y equivalencia"],
  25: ["Modela objetos con formas geométricas y sus transformaciones", "Comunica su comprensión sobre las formas y relaciones geométricas", "Usa estrategias y procedimientos para medir y orientarse en el espacio", "Argumenta afirmaciones sobre relaciones geométricas"],
  26: ["Representa datos con gráficos y medidas estadísticas o probabilísticas", "Comunica su comprensión de los conceptos estadísticos y probabilísticos", "Usa estrategias y procedimientos para recopilar y procesar datos", "Sustenta conclusiones o decisiones con base en la información obtenida"],
  27: ["Crea propuestas de valor", "Aplica habilidades técnicas", "Trabaja cooperativamente para lograr objetivos y metas", "Evalúa los resultados del proyecto de emprendimiento"],
  28: ["Conoce a Dios y asume su identidad religiosa y espiritual como persona digna, libre y trascendente", "Cultiva y valora las manifestaciones religiosas de su entorno argumentando su fe de manera comprensible y respetuosa"],
  29: ["Transforma su entorno desde el encuentro personal y comunitario con Dios y desde la fe que profesa", "Actúa coherentemente en razón de su fe según los principios de su conciencia moral en situaciones concretas de la vida"],
  30: ["Personaliza entornos virtuales", "Gestiona información del entorno virtual", "Interactúa en entornos virtuales", "Crea objetos virtuales en diversos formatos"],
  31: ["Define metas de aprendizaje", "Organiza acciones estratégicas para alcanzar sus metas de aprendizaje", "Monitorea y ajusta su desempeño durante el proceso de aprendizaje"],
};

/** Capacidades de una competencia (vacío si es propia del colegio y no tiene catálogo). */
export const capacidadesDe = (c: { numero?: number | null }) => (c.numero ? CAPACIDADES[c.numero] ?? [] : []);

const VALOR: Record<NivelLogro, number> = { AD: 3, A: 2, B: 1, C: 0 };
const DE_VALOR: NivelLogro[] = ["C", "B", "A", "AD"];

/** Regla del registro auxiliar del colegio: AD=3, A=2, B=1, C=0, promedio redondeado (como ROUND de Excel). */
export function logroPromedio(niveles: (NivelLogro | null | undefined)[]): NivelLogro | null {
  const v = niveles.filter((n): n is NivelLogro => !!n).map((n) => VALOR[n]);
  if (!v.length) return null;
  const prom = v.reduce((a, b) => a + b, 0) / v.length;
  return DE_VALOR[Math.min(3, Math.max(0, Math.round(prom)))];
}

/** Logro de la competencia a partir de las capacidades calificadas (claves "1", "2", ...). */
export const logroDeCapacidades = (caps: Record<string, NivelLogro> | null | undefined) => logroPromedio(Object.values(caps ?? {}));
