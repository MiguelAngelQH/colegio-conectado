// Estado de la conexión. Además del estado real del navegador permite forzar
// "sin conexión" para capacitación y pruebas de campo.

const CLAVE = "cc.forzar_sin_conexion";
type Oyente = () => void;
const oyentes = new Set<Oyente>();

function leerForzado(): boolean {
  try {
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

let forzado = typeof localStorage !== "undefined" ? leerForzado() : false;

export function hayConexion(): boolean {
  // Si el entorno no informa el estado (onLine indefinido) se asume conectado.
  const nav = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  return nav && !forzado;
}

export function sinConexionForzada(): boolean {
  return forzado;
}

export function forzarSinConexion(valor: boolean) {
  forzado = valor;
  try {
    localStorage.setItem(CLAVE, valor ? "1" : "0");
  } catch {
    /* almacenamiento bloqueado: el valor queda solo en memoria */
  }
  oyentes.forEach((o) => o());
}

export function alCambiarConexion(o: Oyente): () => void {
  oyentes.add(o);
  window.addEventListener("online", o);
  window.addEventListener("offline", o);
  return () => {
    oyentes.delete(o);
    window.removeEventListener("online", o);
    window.removeEventListener("offline", o);
  };
}
