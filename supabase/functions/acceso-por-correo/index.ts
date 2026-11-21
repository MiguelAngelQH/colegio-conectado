// Edge Function: ingreso con correo. Las cuentas usan en Auth un correo derivado del DNI; esta
// función busca el DNI que corresponde al correo, inicia la sesión y devuelve los tokens.
// Así el cliente nunca puede consultar qué DNI tiene un correo.
// El error es siempre el mismo para no revelar si un correo está registrado.
//
// Despliegue (se llama sin sesión):  supabase functions deploy acceso-por-correo --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { clienteAdmin, CORS, correoDeAcceso, respuesta } from "../_shared/acceso.ts";

const INCORRECTO = { error: "DNI/correo o contraseña incorrectos." };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respuesta({ error: "Método no permitido" }, 405);

  let datos: { correo?: string; clave?: string };
  try {
    datos = await req.json();
  } catch {
    return respuesta({ error: "Datos inválidos" }, 400);
  }
  const correo = datos.correo?.trim().toLowerCase();
  if (!correo || !datos.clave) return respuesta(INCORRECTO, 401);

  const { data: cuenta } = await clienteAdmin().from("usuario").select("dni").ilike("email", correo).eq("eliminado", false).maybeSingle();
  if (!cuenta?.dni) return respuesta(INCORRECTO, 401);

  const anonimo = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
  const { data, error } = await anonimo.auth.signInWithPassword({ email: correoDeAcceso(cuenta.dni), password: datos.clave });
  if (error || !data.session) {
    const bloqueada = error?.message?.toLowerCase().includes("banned");
    return respuesta(bloqueada ? { error: "Cuenta desactivada. Consulte con la dirección del colegio." } : INCORRECTO, bloqueada ? 403 : 401);
  }
  return respuesta({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
});
