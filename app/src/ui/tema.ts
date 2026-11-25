import { useSyncExternalStore } from "react";

export type PreferenciaTema = "claro" | "oscuro" | "auto";

const CLAVE = "tema";
const consulta = () => window.matchMedia("(prefers-color-scheme: dark)");
const oyentes = new Set<() => void>();

export function preferenciaTema(): PreferenciaTema {
  const v = localStorage.getItem(CLAVE);
  return v === "claro" || v === "oscuro" ? v : "auto";
}

export function temaOscuro(): boolean {
  const p = preferenciaTema();
  return p === "oscuro" || (p === "auto" && consulta().matches);
}

/** Pone o quita la clase "dark" del documento y el color de la barra del navegador. */
function aplicar() {
  const oscuro = temaOscuro();
  document.documentElement.classList.toggle("dark", oscuro);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", oscuro ? "#0b1424" : "#1e3a8a");
  oyentes.forEach((f) => f());
}

export function fijarTema(p: PreferenciaTema) {
  if (p === "auto") localStorage.removeItem(CLAVE);
  else localStorage.setItem(CLAVE, p);
  aplicar();
}

/** Se llama una vez al arrancar: aplica el tema y sigue los cambios del sistema en modo automático. */
export function iniciarTema() {
  aplicar();
  consulta().addEventListener("change", aplicar);
}

const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};

export const useTemaOscuro = () => useSyncExternalStore(suscribir, temaOscuro);
export const usePreferenciaTema = () => useSyncExternalStore(suscribir, preferenciaTema);
