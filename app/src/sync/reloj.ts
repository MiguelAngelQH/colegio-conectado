// Hora corregida con la del servidor. Los celulares sin internet pueden tener la hora mal;
// cada sincronización actualiza la diferencia y se guarda para usarla sin conexión.

let desfaseMs = 0;

export function fijarDesfase(ms: number) {
  if (Number.isFinite(ms)) desfaseMs = ms;
}

export function desfase() {
  return desfaseMs;
}

/** Milisegundos "del servidor" aunque no haya conexión (último desfase conocido). */
export function ahoraServidor(): number {
  return Date.now() + desfaseMs;
}
