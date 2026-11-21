// Edge Function: la dirección restablece la contraseña de una cuenta o la desactiva/activa.
// Solo director o subdirector activo, solo cuentas de su colegio y nunca cuentas de la UGEL.
//
// Despliegue:  supabase functions deploy gestionar-cuenta
import { claveTemporal, clienteAdmin, CORS, direccionQueLlama, respuesta } from "../_shared/acceso.ts";

// Bloqueo "permanente" en Auth: unos 100 años.
const BLOQUEO = "876000h";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respuesta({ error: "Método no permitido" }, 405);

  const admin = clienteAdmin();
  const perfil = await direccionQueLlama(req, admin);
  if (!perfil) return respuesta({ error: "Solo la dirección puede administrar cuentas" }, 403);

  let datos: { accion?: string; usuario_id?: string };
  try {
    datos = await req.json();
  } catch {
    return respuesta({ error: "Datos inválidos" }, 400);
  }
  const { data: cuenta } = await admin.from("usuario").select("id, colegio_id, roles, eliminado").eq("id", datos.usuario_id ?? "").maybeSingle();
  if (!cuenta || cuenta.eliminado || cuenta.colegio_id !== perfil.colegio_id) return respuesta({ error: "No se encontró la cuenta en este colegio" }, 404);
  if (cuenta.roles.includes("ugel")) return respuesta({ error: "La cuenta de la UGEL la administra la plataforma" }, 403);

  switch (datos.accion) {
    case "restablecer": {
      const clave = claveTemporal();
      const { data: actual } = await admin.auth.admin.getUserById(cuenta.id);
      const { error } = await admin.auth.admin.updateUserById(cuenta.id, {
        password: clave,
        user_metadata: { ...(actual.user?.user_metadata ?? {}), debe_cambiar_clave: true },
      });
      if (error) return respuesta({ error: `No se pudo restablecer: ${error.message}` }, 500);
      return respuesta({ clave_temporal: clave });
    }
    case "desactivar":
    case "activar": {
      const activar = datos.accion === "activar";
      if (!activar && cuenta.id === perfil.id) return respuesta({ error: "No puede desactivar su propia cuenta" }, 400);
      const { error } = await admin.auth.admin.updateUserById(cuenta.id, { ban_duration: activar ? "none" : BLOQUEO });
      if (error) return respuesta({ error: `No se pudo actualizar el acceso: ${error.message}` }, 500);
      const { error: errPerfil } = await admin.from("usuario").update({ activo: activar }).eq("id", cuenta.id);
      if (errPerfil) return respuesta({ error: `No se pudo actualizar el perfil: ${errPerfil.message}` }, 500);
      return respuesta({ ok: true });
    }
    default:
      return respuesta({ error: "Acción desconocida" }, 400);
  }
});
