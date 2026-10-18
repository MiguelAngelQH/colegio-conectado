import type { CapacitorConfig } from "@capacitor/cli";

// La app web compilada (dist/) va dentro del APK: abre y funciona sin internet desde el primer uso.
const config: CapacitorConfig = {
  appId: "pe.colegioconectado.app",
  appName: "Colegio Conectado",
  webDir: "dist",
  android: {
    // https://localhost: contexto seguro (cámara, crypto.subtle) sin servidor externo.
    // Las llamadas a Supabase van por HTTPS normal.
    allowMixedContent: false,
  },
  server: { androidScheme: "https" },
};

export default config;
