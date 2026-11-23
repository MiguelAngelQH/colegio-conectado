import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * "supabase": servidor real. "demo": datos de ejemplo en este equipo, solo al programar (npm run dev)
 * o en una versión hecha para presentaciones (npm run build:demo). Una versión publicada sin servidor
 * y sin VITE_DEMO queda "sin-configurar": no se puede entrar (nunca se publica un demo por error).
 */
// VITE_DEMO=1 (npm run dev:demo / build:demo) fuerza el demo aunque app/.env tenga el servidor real.
const demoForzado = import.meta.env.VITE_DEMO === "1";
export const MODO: "demo" | "supabase" | "sin-configurar" =
  demoForzado ? "demo" : url && clave ? "supabase" : import.meta.env.DEV ? "demo" : "sin-configurar";

export const supabase: SupabaseClient | null =
  MODO === "supabase" ? createClient(url!, clave!, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

/** Cada cuánto se sincroniza mientras hay conexión. */
export const INTERVALO_SYNC_MS = 60_000;
/** Espera después de un cambio local antes de enviarlo (agrupa ediciones seguidas). */
export const ESPERA_TRAS_CAMBIO_MS = 4_000;
