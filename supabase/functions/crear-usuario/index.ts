// Edge Function: crea la cuenta (Auth) y el perfil (tabla usuario) de una persona del colegio.
// Solo la puede usar un director o subdirector activo, y solo para su propio colegio.
// Necesita internet: crear cuentas es una de las pocas acciones que no funcionan sin conexión.
//
// Despliegue:  supabase functions deploy crear-usuario
// Variables (las provee Supabase): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Roles que puede otorgar la dirección. La cuenta UGEL la crea el administrador de la plataforma.
const ROLES_PERMITIDOS = ["director", "subdirector", "docente", "tutor", "auxiliar", "estudiante", "apoderado"];

function respuesta(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, "Content-Type": "application/json" } });
}

function claveTemporal(): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(b, (x) => letras[x % letras.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respuesta({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const jwt = req.headers.get("Authorization") ?? "";
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: jwt } } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: quien } = await comoUsuario.auth.getUser();
  if (!quien.user) return respuesta({ error: "Sesión no válida" }, 401);

  const { data: perfil } = await admin.from("usuario").select("colegio_id, roles, activo, eliminado").eq("id", quien.user.id).single();
  if (!perfil || !perfil.activo || perfil.eliminado || !perfil.roles.some((r: string) => r === "director" || r === "subdirector")) {
    return respuesta({ error: "Solo la dirección puede crear cuentas" }, 403);
  }

  let datos: { nombres?: string; apellidos?: string; dni?: string | null; email?: string; roles?: string[] };
  try {
    datos = await req.json();
  } catch {
    return respuesta({ error: "Datos inválidos" }, 400);
  }
  const nombres = datos.nombres?.trim();
  const apellidos = datos.apellidos?.trim();
  const email = datos.email?.trim().toLowerCase();
  const roles = (datos.roles ?? []).filter((r) => ROLES_PERMITIDOS.includes(r));
  if (!nombres || !apellidos || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || roles.length === 0) {
    return respuesta({ error: "Faltan nombres, apellidos, un correo válido o al menos un rol" }, 400);
  }

  const clave = claveTemporal();
  const { data: creado, error } = await admin.auth.admin.createUser({
    email,
    password: clave,
    email_confirm: true,
    user_metadata: { nombres, apellidos, debe_cambiar_clave: true },
  });
  if (error || !creado.user) {
    const yaExiste = error?.message?.toLowerCase().includes("already");
    return respuesta({ error: yaExiste ? "Ya existe una cuenta con ese correo" : error?.message ?? "No se pudo crear la cuenta" }, yaExiste ? 409 : 500);
  }

  const { error: errPerfil } = await admin.from("usuario").insert({
    id: creado.user.id,
    colegio_id: perfil.colegio_id,
    nombres,
    apellidos,
    dni: datos.dni?.trim() || null,
    email,
    roles,
    activo: true,
  });
  if (errPerfil) {
    // Sin perfil la cuenta no sirve: se deshace para no dejar cuentas huérfanas.
    await admin.auth.admin.deleteUser(creado.user.id);
    return respuesta({ error: `No se pudo guardar el perfil: ${errPerfil.message}` }, 500);
  }

  return respuesta({ id: creado.user.id, clave_temporal: clave });
});
