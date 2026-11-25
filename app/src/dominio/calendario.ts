// Calendario escolar: feriados nacionales del Perú y utilidades de fechas (aaaa-mm-dd, hora local).
import type { Evento, TipoEvento } from "@/db/tipos";

const FIJOS: Record<string, string> = {
  "01-01": "Año Nuevo",
  "05-01": "Día del Trabajo",
  "06-07": "Batalla de Arica y Día de la Bandera",
  "06-29": "San Pedro y San Pablo",
  "07-23": "Día de la Fuerza Aérea del Perú",
  "07-28": "Fiestas Patrias",
  "07-29": "Fiestas Patrias",
  "08-06": "Batalla de Junín",
  "08-30": "Santa Rosa de Lima",
  "10-08": "Combate de Angamos",
  "11-01": "Día de Todos los Santos",
  "12-08": "Inmaculada Concepción",
  "12-09": "Batalla de Ayacucho",
  "12-25": "Navidad",
};

const aTexto = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). */
function pascua(anio: number): Date {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}

/** Feriados nacionales de un año: fecha -> nombre (incluye Jueves y Viernes Santo). */
export function feriados(anio: number): Map<string, string> {
  const m = new Map(Object.entries(FIJOS).map(([md, n]) => [`${anio}-${md}`, n]));
  const p = pascua(anio);
  m.set(aTexto(new Date(p.getFullYear(), p.getMonth(), p.getDate() - 3)), "Jueves Santo");
  m.set(aTexto(new Date(p.getFullYear(), p.getMonth(), p.getDate() - 2)), "Viernes Santo");
  return m;
}

export const TIPO_EVENTO: Record<TipoEvento, string> = {
  examen: "Evaluación", reunion: "Reunión", actividad: "Actividad", sin_clases: "Sin clases", otro: "Otro",
};

/** ¿El evento ocupa ese día? (los de varios días se muestran en todos). */
export const ocurreEn = (e: Pick<Evento, "fecha" | "fecha_fin">, dia: string) => dia >= e.fecha && dia <= (e.fecha_fin ?? e.fecha);

/** Días del mes en una cuadrícula que empieza en lunes (null = relleno). */
export function cuadriculaMes(anio: number, mes: number): (string | null)[] {
  const primero = new Date(anio, mes, 1);
  const relleno = (primero.getDay() + 6) % 7; // lunes = 0
  const dias = new Date(anio, mes + 1, 0).getDate();
  const celdas: (string | null)[] = Array.from({ length: relleno }, () => null);
  for (let d = 1; d <= dias; d++) celdas.push(aTexto(new Date(anio, mes, d)));
  while (celdas.length % 7) celdas.push(null);
  return celdas;
}

export const sumarDiasTexto = (fecha: string, n: number) => {
  const [a, m, d] = fecha.split("-").map(Number);
  return aTexto(new Date(a, m - 1, d + n));
};
