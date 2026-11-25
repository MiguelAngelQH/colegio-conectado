import colores from "tailwindcss/colors";
import plugin from "tailwindcss/plugin";

/*
  Tema claro y oscuro con las mismas clases.
  Las familias de color salen de variables CSS: en modo oscuro los tonos claros (50-300) pasan a ser
  los oscuros y viceversa, así un "bg-red-50 text-red-700" se ve bien en los dos temas sin tocar cada pantalla.
  Los tonos medios (400-600, botones sólidos con texto blanco) no cambian.
*/
const FAMILIAS = ["slate", "gray", "red", "orange", "amber", "yellow", "lime", "green", "emerald", "sky", "blue", "indigo", "violet", "purple", "pink", "rose"];
const TONOS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const EN_OSCURO = { 50: 950, 100: 900, 200: 800, 300: 700, 700: 300, 800: 200, 900: 100, 950: 50 };

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};
const variable = (nombre) => `rgb(var(--${nombre}) / <alpha-value>)`;

const familias = Object.fromEntries(FAMILIAS.map((f) => [f, Object.fromEntries(TONOS.map((t) => [t, variable(`c-${f}-${t}`)]))]));
const varsClaro = {};
const varsOscuro = {};
for (const f of FAMILIAS)
  for (const t of TONOS) {
    varsClaro[`--c-${f}-${t}`] = rgb(colores[f][t]);
    varsOscuro[`--c-${f}-${t}`] = rgb(colores[f][EN_OSCURO[t] ?? t]);
  }

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ...familias,
        marca: {
          50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 500: "#3b82f6",
          600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a",
        },
        nivel: { ad: "#1d4f91", a: "#5b9bd5", b: "#f0956a", c: "#b8322a" },
        tinta: { DEFAULT: variable("tinta-rgb"), suave: variable("tinta-suave-rgb") },
        /** Superficie de vidrio: blanca en el tema claro, azul pizarra en el oscuro. */
        sup: variable("sup-rgb"),
        /** Azul marino fijo (velos, tooltips, visor de cámara): igual en los dos temas. */
        noche: "#0f1e36",
        laguna: { DEFAULT: "#2563eb", honda: "#1e3a8a" },
      },
      fontFamily: {
        sans: ["Onest Variable", "system-ui", "sans-serif"],
        display: ["Bricolage Grotesque Variable", "Onest Variable", "sans-serif"],
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({ ":root": varsClaro, ".dark": varsOscuro });
    }),
  ],
};
