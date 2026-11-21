// Cuentas con Supabase Auth. Con DNI se ingresa directo (correo derivado del DNI); con correo se pasa
// por la Edge Function acceso-por-correo. La administración de cuentas usa crear-usuario y gestionar-cuenta.
import type { SupabaseClient } from "@supabase/supabase-js";
import { correoDeAcceso, leerIdentificador } from "@/dominio/acceso";
import type { Autenticacion, NuevaCuenta, ResultadoCuenta } from "./autenticacion";
import { ErrorAcceso, MENSAJE_DESACTIVADA, MENSAJE_IDENTIFICADOR, MENSAJE_INCORRECTO } from "./autenticacion";
import { hayConexion } from "./red";

function traducir(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("invalid login credentials")) return MENSAJE_INCORRECTO;
  if (m.includes("banned")) return MENSAJE_DESACTIVADA;
  if (m.includes("should be different")) return "La contraseña nueva debe ser distinta de la anterior.";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Espere unos minutos y vuelva a intentar.";
  if (m.includes("fetch") || m.includes("network")) return "No hay conexión con el servidor. Revise su internet.";
  return mensaje;
}

export class AuthSupabase implements Autenticacion {
  constructor(private sb: SupabaseClient) {}

  private async funcion<T>(nombre: string, cuerpo: object): Promise<T> {
    if (!hayConexion()) throw new ErrorAcceso("Esta acción necesita conexión a internet.");
    const { data, error } = await this.sb.functions.invoke(nombre, { body: cuerpo });
    if (error) {
      const detalle = await (error as { context?: Response }).context?.json?.().catch(() => null);
      throw new ErrorAcceso(traducir(detalle?.error ?? error.message));
    }
    return data as T;
  }

  async ingresar(identificador: string, clave: string) {
    const id = leerIdentificador(identificador);
    if (!id) throw new ErrorAcceso(MENSAJE_IDENTIFICADOR);
    if (id.tipo === "dni") {
      const { error } = await this.sb.auth.signInWithPassword({ email: correoDeAcceso(id.dni), password: clave });
      if (error) throw new ErrorAcceso(traducir(error.message));
    } else {
      const tokens = await this.funcion<{ access_token: string; refresh_token: string }>("acceso-por-correo", { correo: id.correo, clave });
      const { error } = await this.sb.auth.setSession(tokens);
      if (error) throw new ErrorAcceso(traducir(error.message));
    }
    const { data } = await this.sb.auth.getUser();
    if (!data.user) throw new ErrorAcceso(MENSAJE_INCORRECTO);
    return { usuarioId: data.user.id, debeCambiarClave: !!data.user.user_metadata?.debe_cambiar_clave };
  }

  async cambiarClave(_usuarioId: string, nueva: string) {
    const { error } = await this.sb.auth.updateUser({ password: nueva, data: { debe_cambiar_clave: false } });
    if (error) throw new ErrorAcceso(traducir(error.message));
  }

  async sesionVigente(usuarioId: string) {
    if (!hayConexion()) return null;
    try {
      const { data, error } = await this.sb.auth.getUser();
      if (error && /fetch|network/i.test(error.message)) return null;
      return data.user?.id === usuarioId;
    } catch {
      return null;
    }
  }

  async salir() {
    await this.sb.auth.signOut().catch(() => undefined);
  }

  async crearCuenta(d: NuevaCuenta): Promise<ResultadoCuenta> {
    const r = await this.funcion<{ id: string; clave_temporal: string | null; existente: boolean }>("crear-usuario", d);
    return { id: r.id, claveTemporal: r.clave_temporal, existente: r.existente };
  }

  async restablecerClave(usuarioId: string) {
    return (await this.funcion<{ clave_temporal: string }>("gestionar-cuenta", { accion: "restablecer", usuario_id: usuarioId })).clave_temporal;
  }

  async cambiarEstado(usuarioId: string, activo: boolean) {
    await this.funcion("gestionar-cuenta", { accion: activo ? "activar" : "desactivar", usuario_id: usuarioId });
  }
}
