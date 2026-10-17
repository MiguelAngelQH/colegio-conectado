/** Quita tildes y pasa a minúsculas: para comparar encabezados y nombres. */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "y", "e", "da", "van", "von"]);

/** "QUISPE DE LA CRUZ" -> "Quispe de la Cruz". Respeta tildes y la ñ. */
export function nombrePropio(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-PE")
    .split(" ")
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toLocaleUpperCase("es-PE") + p.slice(1)))
    .join(" ");
}

/** DNI peruano: 8 dígitos. Excel suele perder ceros a la izquierda; se recuperan. */
export function normalizarDni(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = String(v).replace(/\D/g, "");
  if (!d) return null;
  // Solo se recupera un cero perdido (DNI que empieza con 0); menos de 7 dígitos es un error.
  if (d.length > 8 || d.length < 7) return null;
  return d.padStart(8, "0");
}

export function normalizarSexo(v: unknown): "M" | "F" | null {
  const s = normalizar(String(v ?? ""));
  if (!s) return null;
  if (["m", "h", "masculino", "hombre", "varon"].includes(s)) return "M";
  if (["f", "femenino", "mujer", "dama"].includes(s)) return "F";
  return null;
}

/** Acepta Date, número de serie de Excel, "dd/mm/aaaa", "dd-mm-aaaa" o "aaaa-mm-dd". Devuelve aaaa-mm-dd. */
export function normalizarFecha(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 0) {
    // Serie de Excel: días desde 1899-12-30.
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return fechaValida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const anio = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return fechaValida(anio, +m[2], +m[1]);
  }
  return null;
}

function fechaValida(a: number, m: number, d: number): string | null {
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return f.toISOString().slice(0, 10);
}
