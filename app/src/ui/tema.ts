import { useSyncExternalStore } from "react";

/**
 * Tema de la app.
 * - "claro" (por defecto) / "oscuro": fijo. Si el modo no va con la hora (de noche en claro o de día en oscuro),
 *   la app pregunta una vez por tramo si se desea cambiar (ver SugerenciaTema).
 * - "auto": cambia solo, nocturno desde las 18:00 hasta las 6:00 (hora del equipo).
 */
export type PreferenciaTema = "claro" | "oscuro" | "auto";

export const HORA_NOCHE = 18;
export const HORA_DIA = 6;

const CLAVE = "tema";
const CLAVE_AVISO = "tema-aviso-hasta";
const oyentes = new Set<() => void>();

export function preferenciaTema(): PreferenciaTema {
  const v = localStorage.getItem(CLAVE);
  return v === "oscuro" || v === "auto" ? v : "claro";
}

export const esDeNoche = (d = new Date()) => d.getHours() >= HORA_NOCHE || d.getHours() < HORA_DIA;

/** Próximo momento en que cambia el tramo del día (6:00 o 18:00). */
export function proximoCambio(d = new Date()): Date {
  const r = new Date(d);
  r.setMinutes(0, 0, 0);
  if (d.getHours() < HORA_DIA) r.setHours(HORA_DIA);
  else if (d.getHours() < HORA_NOCHE) r.setHours(HORA_NOCHE);
  else {
    r.setDate(r.getDate() + 1);
    r.setHours(HORA_DIA);
  }
  return r;
}

export function temaOscuro(): boolean {
  const p = preferenciaTema();
  return p === "auto" ? esDeNoche() : p === "oscuro";
}

/** Qué conviene sugerir ahora: el modo que va con la hora, si no es el actual y no se respondió en este tramo. */
export function sugerenciaTema(): "oscuro" | "claro" | null {
  if (preferenciaTema() === "auto") return null;
  const noche = esDeNoche();
  if (noche === temaOscuro()) return null;
  if (Date.now() < Number(localStorage.getItem(CLAVE_AVISO) ?? 0)) return null;
  return noche ? "oscuro" : "claro";
}

let ultimo = "";
/** Pone o quita la clase "dark" del documento y avisa a los componentes si algo cambió. */
function aplicar() {
  const oscuro = temaOscuro();
  document.documentElement.classList.toggle("dark", oscuro);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", oscuro ? "#0b1424" : "#1e3a8a");
  const estado = `${oscuro}|${preferenciaTema()}|${sugerenciaTema()}`;
  if (estado !== ultimo) {
    ultimo = estado;
    oyentes.forEach((f) => f());
  }
}

export function fijarTema(p: PreferenciaTema) {
  localStorage.setItem(CLAVE, p);
  aplicar();
}

/** Botón de la barra: pasa de claro a nocturno o al revés (deja de ser automático). */
export function alternarTema() {
  fijarTema(temaOscuro() ? "claro" : "oscuro");
}

/** "Ahora no": no volver a preguntar hasta el próximo cambio de tramo (6:00 o 18:00). */
export function posponerSugerencia() {
  localStorage.setItem(CLAVE_AVISO, String(proximoCambio().getTime()));
  aplicar();
}

/** Se llama una vez al arrancar: aplica el tema y lo revisa cada minuto (por si cambió la hora). */
export function iniciarTema() {
  aplicar();
  setInterval(aplicar, 60_000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && aplicar());
}

const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};

export const useTemaOscuro = () => useSyncExternalStore(suscribir, temaOscuro);
export const usePreferenciaTema = () => useSyncExternalStore(suscribir, preferenciaTema);
export const useSugerenciaTema = () => useSyncExternalStore(suscribir, sugerenciaTema);
