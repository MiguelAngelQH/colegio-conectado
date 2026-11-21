// Ingreso y administración de cuentas. Dos implementaciones con el mismo comportamiento:
// el servidor de demostración (auth-demo) y Supabase Auth con sus Edge Functions (auth-supabase).
import type { Rol } from "@/db/tipos";

export interface NuevaCuenta {
  nombres: string;
  apellidos: string;
  dni: string;
  email: string | null;
  roles: Rol[];
  /** Estudiante o apoderado que queda vinculado a la cuenta. */
  vincular?: { tabla: "estudiante" | "apoderado"; id: string };
}

export interface ResultadoCuenta {
  id: string;
  /** Contraseña para entregar a la persona; null si el DNI ya tenía cuenta (se le agregó el rol). */
  claveTemporal: string | null;
  existente: boolean;
}

export interface Autenticacion {
  ingresar(identificador: string, clave: string): Promise<{ usuarioId: string; debeCambiarClave: boolean }>;
  cambiarClave(usuarioId: string, nueva: string): Promise<void>;
  /** true: vigente. false: cerrada, borrada o desactivada. null: no se puede comprobar (sin conexión). */
  sesionVigente(usuarioId: string): Promise<boolean | null>;
  salir(): Promise<void>;
  crearCuenta(datos: NuevaCuenta, porUsuarioId: string): Promise<ResultadoCuenta>;
  restablecerClave(usuarioId: string, porUsuarioId: string): Promise<string>;
  cambiarEstado(usuarioId: string, activo: boolean, porUsuarioId: string): Promise<void>;
}

/** Error que se muestra tal cual a la persona. */
export class ErrorAcceso extends Error {}

export const MENSAJE_INCORRECTO = "DNI/correo o contraseña incorrectos.";
export const MENSAJE_DESACTIVADA = "Cuenta desactivada. Consulte con la dirección del colegio.";
export const MENSAJE_IDENTIFICADOR = "Escriba su DNI (8 dígitos) o su correo.";
