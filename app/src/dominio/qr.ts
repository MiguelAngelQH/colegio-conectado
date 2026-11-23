// Protocolo del QR de asistencia.
//
// QR dinámico (lo muestra el docente, lo escanea el estudiante):
//   CC1.<sesion_id>.<ventana>.<firma>
//   ventana = floor(hora_del_docente_ms / 15000)   -> el código cambia cada 15 s
//   firma   = base64url(HMAC-SHA256(secreto, "<sesion_id>.<ventana>")[0..16])
// El secreto se crea en el equipo del docente y solo lo conocen él y el servidor. El estudiante
// no puede fabricar códigos; el servidor verifica la firma (supabase/migrations/0007).
//
// Código para escribir (si la cámara no funciona): 6 dígitos que cambian con el QR.
//   codigo = (primeros 4 bytes del mismo HMAC como entero) mod 1 000 000
//   El estudiante envía CC1.<sesion_id>.<su_ventana>.<codigo>; el servidor lo busca en su ventana
//   y en las 4 anteriores (el código pudo verse hasta un minuto antes).
//
// Carné (lo escanea el docente): CCE.<codigo_carne>

export const PREFIJO_QR = "CC1";
export const PREFIJO_CARNE = "CCE";
export const VENTANA_MS = 15_000;
/** Diferencia máxima entre la hora del código y la hora en que el estudiante lo escaneó. */
export const TOLERANCIA_MARCA_MS = 60_000;
/** Duración máxima de una sesión de asistencia con QR. */
export const DURACION_SESION_MS = 4 * 60 * 60_000;

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function nuevoSecreto(): string {
  return b64url(globalThis.crypto.getRandomValues(new Uint8Array(24)));
}

async function hmac(secreto: string, mensaje: string): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Este navegador no permite generar códigos seguros (se necesita HTTPS).");
  const clave = await subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle.sign("HMAC", clave, new TextEncoder().encode(mensaje)));
}

async function firmar(secreto: string, mensaje: string): Promise<string> {
  return b64url((await hmac(secreto, mensaje)).slice(0, 16));
}

/** Código de 6 dígitos que el docente muestra bajo el QR (cambia junto con él). */
export async function codigoCorto(sesionId: string, secreto: string, ventana: number): Promise<string> {
  const h = await hmac(secreto, `${sesionId}.${ventana}`);
  const n = ((h[0] << 24) >>> 0) + (h[1] << 16) + (h[2] << 8) + h[3];
  return String(n % 1_000_000).padStart(6, "0");
}

/** Lo que escribe el estudiante: 6 dígitos, con o sin espacio en medio. */
export function leerCodigoCorto(texto: string): string | null {
  const t = texto.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(t) ? t : null;
}

/** Ventanas anteriores en que se acepta un código escrito (el código se vio hasta un minuto antes). */
export const VENTANAS_CODIGO = 4;

export const tokenDeCodigo = (sesionId: string, ventana: number, codigo: string) => `${PREFIJO_QR}.${sesionId}.${ventana}.${codigo}`;

export const ventanaDe = (ms: number) => Math.floor(ms / VENTANA_MS);

export async function crearTokenQr(sesionId: string, secreto: string, ahoraMs: number): Promise<string> {
  const v = ventanaDe(ahoraMs);
  return `${PREFIJO_QR}.${sesionId}.${v}.${await firmar(secreto, `${sesionId}.${v}`)}`;
}

export interface TokenQr { sesionId: string; ventana: number; firma: string }

export function leerTokenQr(texto: string): TokenQr | null {
  const m = texto.trim().match(/^CC1\.([0-9a-f-]{36})\.(\d{1,12})\.(\d{6}|[A-Za-z0-9_-]{16,32})$/);
  return m ? { sesionId: m[1], ventana: +m[2], firma: m[3] } : null;
}

export function leerCarne(texto: string): string | null {
  const t = texto.trim();
  if (t.startsWith(`${PREFIJO_CARNE}.`)) return t.slice(PREFIJO_CARNE.length + 1) || null;
  // También se acepta el código escrito a mano o un carné sin prefijo.
  return /^[A-Za-z0-9-]{4,20}$/.test(t) ? t : null;
}

export const textoCarne = (codigo: string) => `${PREFIJO_CARNE}.${codigo}`;

/**
 * Ventana real del código si es válido (null si no). Para el QR es la del token; para el código
 * escrito se busca en la ventana del estudiante y en las anteriores.
 */
export async function ventanaValida(token: TokenQr, secreto: string): Promise<number | null> {
  if (/^\d{6}$/.test(token.firma)) {
    for (let v = token.ventana; v >= token.ventana - VENTANAS_CODIGO; v--) {
      if ((await codigoCorto(token.sesionId, secreto, v)) === token.firma) return v;
    }
    return null;
  }
  return (await firmar(secreto, `${token.sesionId}.${token.ventana}`)) === token.firma ? token.ventana : null;
}

export async function firmaValida(token: TokenQr, secreto: string): Promise<boolean> {
  return (await ventanaValida(token, secreto)) !== null;
}

export type ResultadoMarca =
  | { valida: false; motivo: string }
  | { valida: true; porRevisar: boolean; motivo: string | null };

/**
 * Reglas que aplica el servidor a una marca por QR (la misma lógica está en SQL).
 * - Código de la sesión y dentro de su duración.
 * - Si se escaneó lejos de la hora del código (foto reenviada) queda "por revisar".
 * - Si el estudiante usa un equipo distinto al habitual, o el equipo ya marcó por otro
 *   estudiante en la misma sesión, queda "por revisar".
 */
export function evaluarMarca(params: {
  token: TokenQr; firmaOk: boolean; sesionId: string; abiertaEnMs: number | null;
  marcadoEnMs: number | null; matriculado: boolean;
  dispositivoHabitual: string | null; dispositivo: string | null; dispositivoUsadoPorOtro: boolean;
}): ResultadoMarca {
  const p = params;
  if (p.token.sesionId !== p.sesionId) return { valida: false, motivo: "El código no corresponde a esta clase" };
  if (!p.firmaOk) return { valida: false, motivo: /^\d{6}$/.test(p.token.firma) ? "El código no es correcto o ya cambió" : "Código QR no válido" };
  if (!p.matriculado) return { valida: false, motivo: "No estás matriculado en esta sección" };
  const horaCodigo = p.token.ventana * VENTANA_MS;
  if (p.abiertaEnMs !== null && (horaCodigo < p.abiertaEnMs - VENTANA_MS * 4 || horaCodigo > p.abiertaEnMs + DURACION_SESION_MS)) {
    return { valida: false, motivo: "El código QR está vencido" };
  }
  const motivos: string[] = [];
  if (p.marcadoEnMs === null || Math.abs(p.marcadoEnMs - horaCodigo) > TOLERANCIA_MARCA_MS) motivos.push("Escaneó el código fuera de tiempo");
  if (p.dispositivoUsadoPorOtro) motivos.push("Este celular ya marcó por otro estudiante");
  else if (p.dispositivo && p.dispositivoHabitual && p.dispositivo !== p.dispositivoHabitual) motivos.push("Usó un celular distinto al habitual");
  return { valida: true, porRevisar: motivos.length > 0, motivo: motivos.join("; ") || null };
}

// ------------------------------------------------------------------ identificador del equipo

const CLAVE_EQUIPO = "cc.equipo";

/** Identificador aleatorio de este equipo (no es un dato personal; sirve para detectar marcas por terceros). */
export function idEquipo(): string {
  try {
    let id = localStorage.getItem(CLAVE_EQUIPO);
    if (!id) {
      id = b64url(globalThis.crypto.getRandomValues(new Uint8Array(12)));
      localStorage.setItem(CLAVE_EQUIPO, id);
    }
    return id;
  } catch {
    return "sin-almacenamiento";
  }
}
