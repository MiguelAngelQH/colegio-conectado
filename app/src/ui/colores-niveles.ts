// Colores de los niveles de logro. Par divergente azul / rojo-anaranjado validado para daltonismo
// (protan ΔE 16,9). Módulo aparte para que notas y libreta no carguen la librería de gráficos.
import type { NivelLogro } from "@/db/tipos";

export const NIVEL_HEX: Record<NivelLogro, string> = { AD: "#1d4f91", A: "#5b9bd5", B: "#f0956a", C: "#b8322a" };
/** Texto sobre cada relleno (los claros llevan tinta oscura). */
export const NIVEL_TEXTO: Record<NivelLogro, string> = { AD: "#ffffff", A: "#0b2e33", B: "#0b2e33", C: "#ffffff" };
