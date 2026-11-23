// Edge Function: crea la cuenta (Auth) y el perfil (tabla usuario) de una persona del colegio.
// Solo la puede usar un director o subdirector activo, y solo para su propio colegio.
// Necesita internet: crear cuentas es una de las pocas acciones que no funcionan sin conexión.
//
// La persona ingresa con su DNI (y con su correo, si lo tiene). Si el DNI ya tiene cuenta en el
// colegio (por ejemplo, una docente que también es madre de familia), se le agregan el rol y el
// vínculo sin crear otra cuenta.
//
// Despliegue:  supabase functions deploy crear-usuario
// Variables (las provee Supabase): SUPABASE_URL y las claves (ver _shared/acceso.ts).
import { claveTemporal, clienteAdmin, CORS, correoDeAcceso, direccionQueLlama, dniValido, respuesta } from "../_shared/acceso.ts";

// Roles que puede otorgar la dirección. La cuenta UGEL la crea el administrador de la plataforma.
const ROLES_PERMITIDOS = ["director", "subdirector", "docente", "tutor", "auxiliar", "estudiante", "apoderado"];

interface Datos {
  nombres?: string; apellidos?: string; dni?: string; email?: string | null; roles?: string[];
  /** Fila de estudiante o apoderado que queda vinculada a la cuenta. */
  vincular?: { tabla: "estudiante" | "apoderado"; id: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respuesta({ error: "Método no permitido" }, 405);

  const admin = clienteAdmin();
  const perfil = await direccionQueLlama(req, admin);
  if (!perfil) return respuesta({ error: "Solo la dirección puede crear cuentas" }, 403);

  let datos: Datos;
  try {
    datos = await req.json();
  } catch {
    return respuesta({ error: "Datos inválidos" }, 400);
  }
  const nombres = datos.nombres?.trim();
  const apellidos = datos.apellidos?.trim();
  const dni = datos.dni?.trim();
  const email = datos.email?.trim().toLowerCase() || null;
  const roles = (datos.roles ?? []).filter((r) => ROLES_PERMITIDOS.includes(r));
  if (!nombres || !apellidos || !dniValido(dni) || roles.length === 0) {
    return respuesta({ error: "Faltan nombres, apellidos, un DNI de 8 dígitos o al menos un rol" }, 400);
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return respuesta({ error: "El correo no es válido" }, 400);

  // La fila a vincular debe ser del mismo colegio y no tener otra cuenta.
  if (datos.vincular) {
    if (!["estudiante", "apoderado"].includes(datos.vincular.tabla)) return respuesta({ error: "Vínculo inválido" }, 400);
    const { data: fila } = await admin.from(datos.vincular.tabla).select("colegio_id, usuario_id").eq("id", datos.vincular.id).single();
    if (!fila || fila.colegio_id !== perfil.colegio_id) return respuesta({ error: "No se encontró a la persona en este colegio" }, 404);
    if (fila.usuario_id) return respuesta({ error: "Esta persona ya tiene una cuenta" }, 409);
  }
  const vincular = async (usuarioId: string) => {
    if (!datos.vincular) return null;
    const { error } = await admin.from(datos.vincular.tabla).update({ usuario_id: usuarioId }).eq("id", datos.vincular.id);
    return error;
  };

  // ¿Ya existe una cuenta con ese DNI?
  const { data: existente } = await admin.from("usuario").select("id, colegio_id, roles, email").eq("dni", dni).eq("eliminado", false).maybeSingle();
  if (existente) {
    if (existente.colegio_id !== perfil.colegio_id) return respuesta({ error: "Ese DNI ya tiene una cuenta en otro colegio" }, 409);
    const nuevosRoles = [...new Set([...existente.roles, ...roles])];
    const { error } = await admin.from("usuario").update({ roles: nuevosRoles, email: existente.email ?? email }).eq("id", existente.id);
    if (error) return respuesta({ error: `No se pudo actualizar la cuenta: ${error.message}` }, 500);
    const errVinculo = await vincular(existente.id);
    if (errVinculo) return respuesta({ error: `No se pudo vincular la cuenta: ${errVinculo.message}` }, 500);
    return respuesta({ id: existente.id, clave_temporal: null, existente: true });
  }
  if (email) {
    const { data: conCorreo } = await admin.from("usuario").select("id").ilike("email", email).eq("eliminado", false).maybeSingle();
    if (conCorreo) return respuesta({ error: "Ese correo ya está registrado en otra cuenta" }, 409);
  }

  const clave = claveTemporal();
  const { data: creado, error } = await admin.auth.admin.createUser({
    email: correoDeAcceso(dni),
    password: clave,
    email_confirm: true,
    user_metadata: { nombres, apellidos, debe_cambiar_clave: true },
  });
  if (error || !creado.user) {
    const yaExiste = error?.message?.toLowerCase().includes("already");
    return respuesta({ error: yaExiste ? "Ese DNI ya tiene una cuenta" : error?.message ?? "No se pudo crear la cuenta" }, yaExiste ? 409 : 500);
  }

  const { error: errPerfil } = await admin.from("usuario").insert({
    id: creado.user.id, colegio_id: perfil.colegio_id, nombres, apellidos, dni, email, roles, activo: true,
  });
  const errVinculo = errPerfil ? null : await vincular(creado.user.id);
  if (errPerfil || errVinculo) {
    // Sin perfil o sin vínculo la cuenta no sirve: se deshace para no dejar cuentas huérfanas.
    await admin.from("usuario").delete().eq("id", creado.user.id);
    await admin.auth.admin.deleteUser(creado.user.id);
    return respuesta({ error: `No se pudo guardar la cuenta: ${(errPerfil ?? errVinculo)!.message}` }, 500);
  }

  return respuesta({ id: creado.user.id, clave_temporal: clave, existente: false });
});
