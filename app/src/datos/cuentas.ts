import { db } from "@/app/contexto";
import { MODO, supabase } from "@/config";
import { guardar } from "@/db/repositorio";
import type { Rol } from "@/db/tipos";
import { hayConexion } from "@/sync/red";

export interface NuevaPersona {
  nombres: string;
  apellidos: string;
  dni: string | null;
  email: string;
  roles: Rol[];
}

/**
 * Crea una persona con cuenta para ingresar.
 * - Demo: se crea el perfil en este equipo.
 * - Servidor real: necesita internet (Edge Function crear-usuario) y devuelve una contraseña temporal.
 */
export async function crearPersona(p: NuevaPersona, colegioId: string): Promise<{ id: string; claveTemporal: string | null }> {
  if (MODO === "demo") {
    const id = await guardar(db, "usuario", { ...p, activo: true }, colegioId);
    return { id, claveTemporal: null };
  }
  if (!hayConexion()) throw new Error("Crear cuentas necesita conexión a internet. Lo demás de la configuración funciona sin señal.");
  const { data, error } = await supabase!.functions.invoke("crear-usuario", { body: p });
  if (error) {
    const detalle = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detalle?.error ?? error.message);
  }
  return { id: data.id, claveTemporal: data.clave_temporal };
}
