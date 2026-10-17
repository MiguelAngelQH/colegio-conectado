// Importación de la nómina de estudiantes desde Excel. Acepta la plantilla propia y archivos
// exportados de otros sistemas (por ejemplo la nómina del SIAGIE): busca la fila de encabezados
// y reconoce las columnas por su nombre, con o sin tildes.
import { normalizar, normalizarDni, normalizarFecha, normalizarSexo, nombrePropio } from "./texto";

export type Campo =
  | "dni" | "codigo" | "apellido_paterno" | "apellido_materno" | "apellidos" | "nombres"
  | "nombre_completo" | "sexo" | "fecha_nacimiento" | "grado" | "seccion";

export const ETIQUETA_CAMPO: Record<Campo, string> = {
  dni: "DNI",
  codigo: "Código del estudiante",
  apellido_paterno: "Apellido paterno",
  apellido_materno: "Apellido materno",
  apellidos: "Apellidos",
  nombres: "Nombres",
  nombre_completo: "Apellidos y nombres (juntos)",
  sexo: "Sexo",
  fecha_nacimiento: "Fecha de nacimiento",
  grado: "Grado",
  seccion: "Sección",
};

// El orden importa: los nombres compuestos se prueban antes que los simples.
const SINONIMOS: [Campo, string[]][] = [
  ["nombre_completo", ["apellidos y nombres", "nombres y apellidos", "apellidos nombres", "nombre completo", "estudiante", "alumno", "alumna"]],
  ["apellido_paterno", ["apellido paterno", "ap paterno", "paterno", "primer apellido"]],
  ["apellido_materno", ["apellido materno", "ap materno", "materno", "segundo apellido"]],
  ["apellidos", ["apellidos", "apellido"]],
  ["nombres", ["nombres", "nombre", "nombre s"]],
  ["dni", ["dni", "documento", "nro documento", "n documento", "numero de documento", "num doc", "documento de identidad", "doc identidad", "nro dni"]],
  ["codigo", ["codigo del estudiante", "codigo estudiante", "cod estudiante", "codigo siagie", "codigo"]],
  ["sexo", ["sexo", "genero"]],
  ["fecha_nacimiento", ["fecha de nacimiento", "fecha nacimiento", "f nacimiento", "fec nac", "fecha nac", "nacimiento"]],
  ["grado", ["grado"]],
  ["seccion", ["seccion"]],
];

const limpiar = (v: unknown) => normalizar(String(v ?? "")).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function reconocerColumna(encabezado: unknown): Campo | null {
  const c = limpiar(encabezado);
  if (!c) return null;
  for (const [campo, sins] of SINONIMOS) if (sins.includes(c)) return campo;
  for (const [campo, sins] of SINONIMOS) if (sins.some((s) => s.length >= 8 && c.includes(s))) return campo;
  return null;
}

export type Mapeo = Partial<Record<Campo, number>>;

/** Busca en las primeras filas la que más se parece a una fila de encabezados. */
export function detectarEncabezado(filas: unknown[][]): { indice: number; mapeo: Mapeo } | null {
  let mejor: { indice: number; mapeo: Mapeo; puntos: number } | null = null;
  filas.slice(0, 30).forEach((fila, indice) => {
    const mapeo: Mapeo = {};
    fila.forEach((celda, col) => {
      const campo = reconocerColumna(celda);
      if (campo && mapeo[campo] === undefined) mapeo[campo] = col;
    });
    const puntos = Object.keys(mapeo).length;
    if (puntos >= 2 && (!mejor || puntos > mejor.puntos)) mejor = { indice, mapeo, puntos };
  });
  if (!mejor) return null;
  const { indice, mapeo } = mejor;
  return { indice, mapeo };
}

/** Indica si el mapeo alcanza para importar (hace falta saber nombres y apellidos). */
export function mapeoSuficiente(m: Mapeo): boolean {
  const tieneApellidos = m.apellidos !== undefined || m.apellido_paterno !== undefined;
  return m.nombre_completo !== undefined || (m.nombres !== undefined && tieneApellidos);
}

export interface FilaImportada {
  fila: number; // número de fila en Excel (1 = primera)
  dni: string | null;
  codigo: string | null;
  apellidos: string;
  nombres: string;
  sexo: "M" | "F" | null;
  fecha_nacimiento: string | null;
  grado: string | null;
  seccion: string | null;
  errores: string[];
  avisos: string[];
}

/** Separa "QUISPE MAMANI, Luis Ángel" o "QUISPE MAMANI LUIS ANGEL" en apellidos y nombres. */
export function separarNombreCompleto(s: string): { apellidos: string; nombres: string } {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.includes(",")) {
    const [a, ...n] = t.split(",");
    return { apellidos: a.trim(), nombres: n.join(" ").trim() };
  }
  const partes = t.split(" ");
  if (partes.length <= 2) return { apellidos: partes[0] ?? "", nombres: partes.slice(1).join(" ") };
  // Sin coma se asume el formato peruano habitual: dos apellidos y luego los nombres.
  return { apellidos: partes.slice(0, 2).join(" "), nombres: partes.slice(2).join(" ") };
}

export function convertirFilas(filas: unknown[][], indiceEncabezado: number, m: Mapeo): FilaImportada[] {
  const celda = (fila: unknown[], c: Campo) => (m[c] === undefined ? undefined : fila[m[c]!]);
  const texto = (fila: unknown[], c: Campo) => {
    const v = celda(fila, c);
    return v === undefined || v === null ? "" : String(v).trim();
  };
  const res: FilaImportada[] = [];
  const dnis = new Map<string, number>();

  filas.slice(indiceEncabezado + 1).forEach((fila, i) => {
    if (!fila || fila.every((v) => v === null || v === undefined || String(v).trim() === "")) return;
    const numero = indiceEncabezado + 2 + i;

    let apellidos = "";
    let nombres = texto(fila, "nombres");
    if (m.nombre_completo !== undefined && (!nombres || m.apellidos === undefined && m.apellido_paterno === undefined)) {
      const sep = separarNombreCompleto(texto(fila, "nombre_completo"));
      apellidos = sep.apellidos;
      nombres = nombres || sep.nombres;
    } else {
      apellidos = texto(fila, "apellidos") || [texto(fila, "apellido_paterno"), texto(fila, "apellido_materno")].filter(Boolean).join(" ");
    }
    // Filas de totales o notas al pie: sin nombre ni apellido, se ignoran.
    if (!apellidos && !nombres) return;

    const errores: string[] = [];
    const avisos: string[] = [];
    if (!apellidos) errores.push("Falta el apellido");
    if (!nombres) errores.push("Faltan los nombres");

    const dniCrudo = celda(fila, "dni");
    const dni = normalizarDni(dniCrudo);
    if (dniCrudo !== undefined && String(dniCrudo ?? "").trim() && !dni) errores.push("DNI inválido (debe tener 8 dígitos)");
    if (dni) {
      if (dnis.has(dni)) errores.push(`DNI repetido (también en la fila ${dnis.get(dni)})`);
      else dnis.set(dni, numero);
    } else if (dniCrudo === undefined || !String(dniCrudo ?? "").trim()) {
      avisos.push("Sin DNI");
    }

    const sexoCrudo = celda(fila, "sexo");
    const sexo = normalizarSexo(sexoCrudo);
    if (sexoCrudo !== undefined && String(sexoCrudo ?? "").trim() && !sexo) avisos.push("Sexo no reconocido");

    const fechaCruda = celda(fila, "fecha_nacimiento");
    const fecha = normalizarFecha(fechaCruda);
    if (fechaCruda !== undefined && String(fechaCruda ?? "").trim() && !fecha) avisos.push("Fecha de nacimiento no reconocida");

    res.push({
      fila: numero,
      dni,
      codigo: texto(fila, "codigo") || null,
      apellidos: nombrePropio(apellidos),
      nombres: nombrePropio(nombres),
      sexo,
      fecha_nacimiento: fecha,
      grado: texto(fila, "grado") || null,
      seccion: texto(fila, "seccion") || null,
      errores,
      avisos,
    });
  });
  return res;
}

export const COLUMNAS_PLANTILLA = ["DNI", "Apellido paterno", "Apellido materno", "Nombres", "Sexo (M/F)", "Fecha de nacimiento (dd/mm/aaaa)"];
export const EJEMPLO_PLANTILLA = [
  ["71234567", "QUISPE", "MAMANI", "LUIS ANGEL", "M", "14/05/2013"],
  ["72345678", "CCAMA", "HUANCA", "ANA LUCIA", "F", "02/11/2012"],
];
