import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** "demo": todo local con datos de ejemplo. "supabase": servidor real. */
export const MODO: "demo" | "supabase" = url && clave ? "supabase" : "demo";

export const supabase: SupabaseClient | null =
  MODO === "supabase" ? createClient(url!, clave!, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

/** Cada cuánto se sincroniza mientras hay conexión. */
export const INTERVALO_SYNC_MS = 60_000;
/** Espera después de un cambio local antes de enviarlo (agrupa ediciones seguidas). */
export const ESPERA_TRAS_CAMBIO_MS = 4_000;
