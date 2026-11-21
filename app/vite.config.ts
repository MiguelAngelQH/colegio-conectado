/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ command, mode }) => {
  // Una versión para publicar debe apuntar al servidor del colegio. El demo (elegir cuentas de prueba)
  // solo se compila a propósito: npm run build:demo.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (command === "build" && !(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) && env.VITE_DEMO !== "1") {
    throw new Error("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en app/.env. Para una versión de demostración use: npm run build:demo");
  }
  return {
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        includeAssets: ["icon.svg"],
        manifest: {
          name: "Colegio Conectado",
          short_name: "Colegio",
          description: "Gestión escolar: notas por competencias, asistencia, tutoría. Funciona sin internet.",
          lang: "es-PE",
          theme_color: "#0f766e",
          background_color: "#ffffff",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
            { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          navigateFallback: "/index.html",
        },
      }),
    ],
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      testTimeout: 30000,
    },
  };
});
