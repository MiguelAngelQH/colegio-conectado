/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        marca: {
          50: "#f0fdfa", 100: "#ccfbf1", 200: "#99f6e4", 500: "#14b8a6",
          600: "#0d9488", 700: "#0f766e", 800: "#115e59", 900: "#134e4a",
        },
        nivel: { ad: "#166534", a: "#22c55e", b: "#f59e0b", c: "#dc2626" },
        tinta: { DEFAULT: "#0b2e33", suave: "#3f5f63" },
        laguna: { DEFAULT: "#0fb5a6", honda: "#0b6e6a" },
      },
      fontFamily: {
        sans: ["Onest Variable", "system-ui", "sans-serif"],
        display: ["Bricolage Grotesque Variable", "Onest Variable", "sans-serif"],
      },
    },
  },
  plugins: [],
};
