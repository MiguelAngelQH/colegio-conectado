/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        marca: {
          50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 500: "#3b82f6",
          600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a",
        },
        nivel: { ad: "#1d4f91", a: "#5b9bd5", b: "#f0956a", c: "#b8322a" },
        tinta: { DEFAULT: "#0f1e36", suave: "#4a5a72" },
        laguna: { DEFAULT: "#2563eb", honda: "#1e3a8a" },
      },
      fontFamily: {
        sans: ["Onest Variable", "system-ui", "sans-serif"],
        display: ["Bricolage Grotesque Variable", "Onest Variable", "sans-serif"],
      },
    },
  },
  plugins: [],
};
