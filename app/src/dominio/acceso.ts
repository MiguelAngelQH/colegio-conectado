// Reglas de acceso: con qué se ingresa (DNI o correo), cómo se forma el correo interno de la cuenta
// y qué contraseñas se aceptan. Funciones puras: las usan la app, el demo y las pruebas.
import { normalizarDni } from "./texto";

/**
 * Cada cuenta se crea en Supabase Auth con un correo derivado del DNI. El dominio .invalid está
 * reservado (RFC 2606): nunca recibe correos, así que no se envían mensajes a nadie.
 * Debe coincidir con supabase/functions/_shared/acceso.ts.
 */
export const DOMINIO_ACCESO = "dni.colegio.invalid";

export const correoDeAcceso = (dni: string) => `${dni}@${DOMINIO_ACCESO}`;

export type Identificador = { tipo: "dni"; dni: string } | { tipo: "correo"; correo: string };

/** Interpreta lo que la persona escribió en "DNI o correo". Null si no es ninguno de los dos. */
export function leerIdentificador(texto: string): Identificador | null {
  const t = texto.trim();
  if (t.includes("@")) {
    const correo = t.toLowerCase();
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo) ? { tipo: "correo", correo } : null;
  }
  if (!/^[\d\s.-]+$/.test(t)) return null;
  const dni = normalizarDni(t);
  return dni ? { tipo: "dni", dni } : null;
}

export const LARGO_MINIMO_CLAVE = 8;

/** Devuelve el motivo por el que no se acepta la contraseña nueva, o null si es válida. */
export function validarClaveNueva(clave: string, p: { dni?: string | null; anterior?: string | null } = {}): string | null {
  if (clave.length < LARGO_MINIMO_CLAVE) return `Use al menos ${LARGO_MINIMO_CLAVE} caracteres.`;
  if (!/[a-zA-ZñÑáéíóúÁÉÍÓÚ]/.test(clave) || !/\d/.test(clave)) return "Combine letras y números.";
  if (p.dni && clave.includes(p.dni)) return "No use su DNI como contraseña.";
  if (p.anterior && clave === p.anterior) return "La contraseña nueva debe ser distinta de la anterior.";
  if (/^(.)\1+$/.test(clave) || /^(?:0123456789|1234567890|abcdefgh)/i.test(clave)) return "Elija una contraseña menos predecible.";
  return null;
}

// Sin letras ni números que se confunden al dictar o copiar a mano (0/O, 1/l/I).
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Contraseña temporal para entregar en papel. Siempre incluye letras y números. */
export function generarClaveTemporal(aleatorio: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  for (;;) {
    const clave = Array.from(aleatorio(10), (x) => ALFABETO[x % ALFABETO.length]).join("");
    if (/\d/.test(clave) && /[a-zA-Z]/.test(clave)) return clave;
  }
}
