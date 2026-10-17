import type { Periodo } from "@/db/tipos";

export type Regimen = "bimestre" | "trimestre";
export type PeriodoBorrador = Pick<Periodo, "numero" | "nombre" | "inicio" | "fin">;

const ROMANOS = ["I", "II", "III", "IV"];

/** Lunes más cercano a una fecha (las clases empiezan en lunes y terminan en viernes). */
function lunes(anio: number, mes: number, dia: number): Date {
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  const dow = f.getUTCDay(); // 0 domingo
  const ajuste = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
  f.setUTCDate(f.getUTCDate() + ajuste);
  return f;
}

const iso = (f: Date) => f.toISOString().slice(0, 10);
const masDias = (f: Date, n: number) => new Date(f.getTime() + n * 86400000);

/**
 * Propuesta de periodos según el calendario escolar habitual del MINEDU (inicio a mediados de marzo,
 * vacaciones de una semana entre bimestres y dos a fin de julio). El director puede ajustar las fechas.
 */
export function proponerPeriodos(anio: number, regimen: Regimen): PeriodoBorrador[] {
  const inicio = lunes(anio, 3, 16);
  const bloques = regimen === "bimestre"
    ? [{ semanas: 9, descanso: 1 }, { semanas: 9, descanso: 2 }, { semanas: 9, descanso: 1 }, { semanas: 9, descanso: 0 }]
    : [{ semanas: 12, descanso: 2 }, { semanas: 12, descanso: 1 }, { semanas: 12, descanso: 0 }];
  const res: PeriodoBorrador[] = [];
  let cursor = inicio;
  bloques.forEach((b, i) => {
    const fin = masDias(cursor, b.semanas * 7 - 3); // termina en viernes
    res.push({
      numero: i + 1,
      nombre: `${ROMANOS[i]} ${regimen === "bimestre" ? "Bimestre" : "Trimestre"}`,
      inicio: iso(cursor),
      fin: iso(fin),
    });
    cursor = masDias(cursor, (b.semanas + b.descanso) * 7);
  });
  return res;
}

/** Errores de un conjunto de periodos; lista vacía si está bien. */
export function validarPeriodos(anio: number, periodos: PeriodoBorrador[]): string[] {
  const errores: string[] = [];
  const ordenados = [...periodos].sort((a, b) => a.numero - b.numero);
  ordenados.forEach((p, i) => {
    if (!p.inicio || !p.fin) errores.push(`${p.nombre}: falta la fecha de inicio o de fin.`);
    else {
      if (p.fin < p.inicio) errores.push(`${p.nombre}: termina antes de empezar.`);
      if (!p.inicio.startsWith(String(anio)) || !p.fin.startsWith(String(anio))) errores.push(`${p.nombre}: las fechas deben estar dentro de ${anio}.`);
      const previo = ordenados[i - 1];
      if (previo?.fin && p.inicio <= previo.fin) errores.push(`${p.nombre}: se cruza con el ${previo.nombre}.`);
    }
  });
  return errores;
}
