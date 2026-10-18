// Hojas de notas para la carga al SIAGIE. El SIAGIE no tiene API pública: la carga se hace con
// archivos Excel. Este formato reúne lo que pide (estudiante, competencia, calificativo y conclusión
// descriptiva) en una hoja por sección y área. Cada IE debe contrastarlo con la plantilla que descarga
// de su SIAGIE antes de la primera carga.
import type { Area, Calificacion, Competencia, Estudiante, NivelLogro } from "@/db/tipos";
import { faltaConclusion } from "./notas";

export interface HojaSiagie {
  nombre: string; // máx. 31 caracteres (límite de Excel)
  filas: (string | number | null)[][];
  faltantes: number;
  sinConclusion: number;
}

export function nombreHoja(seccion: string, area: string, usados: Set<string>): string {
  const limpio = `${seccion}-${area}`.replace(/[\\/?*[\]:"]/g, "").replace(/\s+/g, " ").trim();
  let base = limpio.slice(0, 31);
  let n = 2;
  while (usados.has(base)) base = `${limpio.slice(0, 28)}~${n++}`;
  usados.add(base);
  return base;
}

export function armarHoja(p: {
  colegio: string; codigoModular: string; nivel: string; grado: string; seccion: string; periodo: string;
  area: Area; competencias: Competencia[]; estudiantes: Estudiante[]; calificaciones: Calificacion[]; periodoId: string;
  usados: Set<string>;
  /** Nombre corto de la sección para la pestaña (por ejemplo "3A P"); por defecto, la sección. */
  etiqueta?: string;
}): HojaSiagie {
  const comps = [...p.competencias].filter((c) => c.area_id === p.area.id && !c.eliminado).sort((a, b) => a.orden - b.orden);
  const ests = [...p.estudiantes].sort((a, b) => a.apellidos.localeCompare(b.apellidos) || a.nombres.localeCompare(b.nombres));
  const nota = (e: string, c: string) => p.calificaciones.find((x) => !x.eliminado && x.estudiante_id === e && x.competencia_id === c && x.periodo_id === p.periodoId);

  const filas: (string | number | null)[][] = [
    ["INSTITUCIÓN EDUCATIVA", p.colegio],
    ["CÓDIGO MODULAR", p.codigoModular],
    ["NIVEL", p.nivel, "GRADO", p.grado, "SECCIÓN", p.seccion],
    ["ÁREA", p.area.nombre],
    ["PERIODO", p.periodo],
    [],
    ["N°", "DNI", "APELLIDOS Y NOMBRES", ...comps.map((c, i) => `C${i + 1}: ${c.nombre}`), ...comps.map((_, i) => `CONCLUSIÓN DESCRIPTIVA C${i + 1}`)],
  ];
  let faltantes = 0;
  let sinConclusion = 0;
  ests.forEach((e, i) => {
    const notas = comps.map((c) => nota(e.id, c.id));
    notas.forEach((n) => {
      if (!n?.nivel_logro) faltantes++;
      else if (faltaConclusion(n)) sinConclusion++;
    });
    filas.push([
      i + 1, e.dni ?? "", `${e.apellidos.toUpperCase()}, ${e.nombres.toUpperCase()}`,
      ...notas.map((n) => (n?.nivel_logro ?? "") as NivelLogro | ""),
      ...notas.map((n) => n?.conclusion?.trim() ?? ""),
    ]);
  });
  return { nombre: nombreHoja(p.etiqueta ?? p.seccion, p.area.codigo || p.area.nombre, p.usados), filas, faltantes, sinConclusion };
}
