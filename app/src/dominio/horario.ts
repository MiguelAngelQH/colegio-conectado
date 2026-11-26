/**
 * Validación del horario de una sección antes de guardarlo.
 * Errores (no se puede guardar): horas inválidas, bloques que se cruzan y docentes con dos clases a la vez.
 * Avisos (se puede guardar): bloques muy cortos o largos, horas fuera de la jornada y áreas sin horas.
 */

export const RECREO = "__recreo";
export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"] as const;
/** Duración de una hora pedagógica en minutos. */
export const HORA_PEDAGOGICA = 45;

export interface FilaHorario {
  inicio: string;
  fin: string;
  /** Un valor por día (lunes a viernes): id de área, RECREO o "" (libre). */
  dias: string[];
}

export interface AreaHorario {
  id: string;
  nombre: string;
  docenteId: string;
  docente: string;
}

/** Clase ya guardada de otra sección (para detectar choques del docente). */
export interface ClaseOtraSeccion {
  docenteId: string;
  dia: number; // 1 = lunes
  inicio: string;
  fin: string;
  seccion: string;
}

export interface ResultadoHorario {
  /** Errores de cada bloque, por posición. */
  errores: string[][];
  /** Errores de cada celda: errores[fila][dia]. */
  choques: (string | null)[][];
  avisos: string[];
  /** Horas pedagógicas por semana de cada área. */
  horas: { area: AreaHorario; horas: number }[];
  valido: boolean;
}

export const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const horaValida = (h: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
const seCruzan = (a: { inicio: string; fin: string }, b: { inicio: string; fin: string }) =>
  minutos(a.inicio) < minutos(b.fin) && minutos(b.inicio) < minutos(a.fin);

export function validarHorario(filas: FilaHorario[], areas: AreaHorario[], otras: ClaseOtraSeccion[]): ResultadoHorario {
  const errores = filas.map(() => [] as string[]);
  const choques = filas.map((f) => f.dias.map(() => null as string | null));
  const avisos: string[] = [];
  const porId = new Map(areas.map((a) => [a.id, a]));

  filas.forEach((f, i) => {
    if (!horaValida(f.inicio) || !horaValida(f.fin)) {
      errores[i].push("Escriba la hora de inicio y de fin.");
      return;
    }
    if (minutos(f.inicio) >= minutos(f.fin)) {
      errores[i].push("La hora de fin debe ser posterior a la de inicio.");
      return;
    }
    const dur = minutos(f.fin) - minutos(f.inicio);
    if (dur < 10) errores[i].push("Un bloque debe durar al menos 10 minutos.");
    else if (dur > 180) avisos.push(`El bloque de ${f.inicio} a ${f.fin} dura más de 3 horas.`);
    if (minutos(f.inicio) < 6 * 60 || minutos(f.fin) > 21 * 60) avisos.push(`El bloque de ${f.inicio} a ${f.fin} está fuera de la jornada escolar habitual.`);

    // Bloques de la misma sección que se cruzan.
    filas.forEach((g, j) => {
      if (j <= i || !horaValida(g.inicio) || !horaValida(g.fin) || minutos(g.inicio) >= minutos(g.fin)) return;
      if (seCruzan(f, g)) {
        const texto = `Se cruza con el bloque de ${g.inicio} a ${g.fin}.`;
        errores[i].push(texto);
        errores[j].push(`Se cruza con el bloque de ${f.inicio} a ${f.fin}.`);
      }
    });

    // El docente no puede estar en dos secciones a la vez.
    f.dias.forEach((v, d) => {
      const area = v && v !== RECREO ? porId.get(v) : undefined;
      if (!area?.docenteId) return;
      const otra = otras.find((o) => o.docenteId === area.docenteId && o.dia === d + 1 && seCruzan(o, f));
      if (otra) choques[i][d] = `${area.docente} ya tiene clase con ${otra.seccion} el ${DIAS[d].toLowerCase()} de ${otra.inicio} a ${otra.fin}.`;
    });
  });

  // Horas pedagógicas por área a la semana (solo bloques válidos).
  const mins = new Map<string, number>();
  filas.forEach((f, i) => {
    if (errores[i].length) return;
    const dur = minutos(f.fin) - minutos(f.inicio);
    for (const v of f.dias) if (v && v !== RECREO) mins.set(v, (mins.get(v) ?? 0) + dur);
  });
  const horas = areas.map((a) => ({ area: a, horas: Math.round(((mins.get(a.id) ?? 0) / HORA_PEDAGOGICA) * 10) / 10 }));
  const sinHoras = horas.filter((h) => h.horas === 0).map((h) => h.area.nombre);
  if (sinHoras.length && mins.size) avisos.push(`Sin horas asignadas: ${sinHoras.join(", ")}.`);

  const valido = errores.every((e) => e.length === 0) && choques.every((c) => c.every((x) => !x));
  return { errores, choques, avisos, horas, valido };
}
