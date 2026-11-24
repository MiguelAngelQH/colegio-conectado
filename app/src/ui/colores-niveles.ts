// Colores de los niveles de logro: los mismos del mapa de calor que usan los colegios
// (AD azul, A verde, B amarillo, C rojo), para que el docente vea en la app lo mismo que en
// su registro auxiliar. La letra del nivel siempre se muestra, así el color nunca es la única pista.
// Módulo aparte para que notas y libreta no carguen la librería de gráficos.
import type { NivelLogro } from "@/db/tipos";

export const NIVEL_HEX: Record<NivelLogro, string> = { AD: "#0070c0", A: "#00a651", B: "#ffd400", C: "#e02424" };
/** Texto sobre cada relleno (el amarillo lleva tinta oscura). */
export const NIVEL_TEXTO: Record<NivelLogro, string> = { AD: "#ffffff", A: "#ffffff", B: "#0b2e33", C: "#ffffff" };
