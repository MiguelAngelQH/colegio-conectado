// Piezas comunes de las funciones de cuentas. Deben coincidir con app/src/dominio/acceso.ts.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const DOMINIO_ACCESO = "dni.colegio.invalid";
export const correoDeAcceso = (dni: string) => `${dni}@${DOMINIO_ACCESO}`;
export const dniValido = (dni: unknown): dni is string => typeof dni === "string" && /^\d{8}$/.test(dni);

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export function claveTemporal(): string {
  for (;;) {
    const clave = Array.from(crypto.getRandomValues(new Uint8Array(10)), (x) => ALFABETO[x % ALFABETO.length]).join("");
    if (/\d/.test(clave) && /[a-zA-Z]/.test(clave)) return clave;
  }
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function respuesta(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, "Content-Type": "application/json" } });
}

export function clienteAdmin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

/** Perfil de quien llama, si es director o subdirector activo. Si no, null. */
export async function direccionQueLlama(req: Request, admin: SupabaseClient) {
  const jwt = req.headers.get("Authorization") ?? "";
  const comoUsuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: jwt } } });
  const { data: quien } = await comoUsuario.auth.getUser();
  if (!quien.user) return null;
  const { data: perfil } = await admin.from("usuario").select("id, colegio_id, roles, activo, eliminado").eq("id", quien.user.id).single();
  if (!perfil || !perfil.activo || perfil.eliminado || !perfil.roles.some((r: string) => r === "director" || r === "subdirector")) return null;
  return perfil as { id: string; colegio_id: string; roles: string[] };
}
