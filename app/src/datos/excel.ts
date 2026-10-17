// Lectura y escritura de Excel. SheetJS se carga solo cuando se usa (no pesa en el arranque).
import { COLUMNAS_PLANTILLA, EJEMPLO_PLANTILLA } from "@/dominio/importar";

export interface LibroLeido {
  hojas: { nombre: string; filas: unknown[][] }[];
}

export async function leerLibro(archivo: File): Promise<LibroLeido> {
  const XLSX = await import("xlsx");
  const datos = await archivo.arrayBuffer();
  const esTexto = /\.(csv|txt)$/i.test(archivo.name);
  // CSV: se decodifica a mano (UTF-8 o Windows-1252, que es lo que guarda Excel en español) y sin
  // interpretar fechas, porque SheetJS las leería en formato de EE. UU. (02/08 = 8 de febrero).
  const libro = esTexto
    ? XLSX.read(decodificar(datos), { type: "string", raw: true, dense: true })
    : XLSX.read(datos, { cellDates: true, dense: true });
  return {
    hojas: libro.SheetNames.map((nombre) => ({
      nombre,
      filas: XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], { header: 1, raw: true, defval: null, blankrows: true }),
    })),
  };
}

function decodificar(datos: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(datos).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(datos);
  }
}

export async function descargarPlantilla() {
  const XLSX = await import("xlsx");
  const hoja = XLSX.utils.aoa_to_sheet([COLUMNAS_PLANTILLA, ...EJEMPLO_PLANTILLA]);
  hoja["!cols"] = COLUMNAS_PLANTILLA.map((c) => ({ wch: Math.max(14, c.length + 2) }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Nómina");
  XLSX.writeFile(libro, "plantilla_nomina_estudiantes.xlsx");
}
