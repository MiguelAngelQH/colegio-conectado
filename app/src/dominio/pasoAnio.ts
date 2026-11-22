// Paso al año siguiente: con la situación final de cada estudiante se arma la matrícula del nuevo año.
// PRO y RR pasan al grado siguiente (RR queda pendiente del resultado de su recuperación), PER se queda
// en su grado, 6.º de primaria pasa a 1.º de secundaria si el colegio la tiene y 5.º de secundaria egresa.
import type { DocenteAsignacion, Grado, Matricula, Seccion, SituacionFinal } from "@/db/tipos";

export interface PlanPaso {
  secciones: (Omit<Seccion, "colegio_id"> & { colegio_id?: string | null })[];
  matriculas: Omit<Matricula, "colegio_id">[];
  asignaciones: Omit<DocenteAsignacion, "colegio_id">[];
  egresados: string[];
  /** Quedaron en RR: van al grado siguiente hasta registrar el resultado de su recuperación. */
  pendientesRecuperacion: string[];
  /** Sin situación final confirmada: se promovieron según la propuesta (o al grado siguiente). */
  sinSituacion: string[];
}

/** Grado al que pasa un estudiante promovido; null si egresa. */
export function gradoSiguiente(g: Grado, grados: Grado[]): Grado | null {
  const mismo = grados.find((x) => x.nivel === g.nivel && x.numero === g.numero + 1 && !x.eliminado);
  if (mismo) return mismo;
  if (g.nivel === "primaria") return grados.find((x) => x.nivel === "secundaria" && x.numero === 1 && !x.eliminado) ?? null;
  return null;
}

export function planificarPaso(p: {
  nuevoAnioId: string;
  seccionesAnteriores: Seccion[];
  matriculasAnteriores: Matricula[];
  grados: Grado[];
  /** Mantener tutores y docentes por sección (mismo grado y letra). */
  mantenerDocentes: boolean;
  asignacionesAnteriores: DocenteAsignacion[];
  nuevoId: () => string;
}): PlanPaso {
  const plan: PlanPaso = { secciones: [], matriculas: [], asignaciones: [], egresados: [], pendientesRecuperacion: [], sinSituacion: [] };
  const grado = new Map(p.grados.map((g) => [g.id, g]));
  const clave = (gradoId: string, letra: string) => `${gradoId}|${letra}`;
  const nuevas = new Map<string, string>();
  const anteriorPorClave = new Map(p.seccionesAnteriores.filter((s) => !s.eliminado).map((s) => [clave(s.grado_id, s.letra), s]));

  const seccionNueva = (gradoId: string, letra: string) => {
    const k = clave(gradoId, letra);
    let id = nuevas.get(k);
    if (!id) {
      id = p.nuevoId();
      nuevas.set(k, id);
      const antes = anteriorPorClave.get(k);
      plan.secciones.push({ id, anio_id: p.nuevoAnioId, grado_id: gradoId, letra, tutor_id: p.mantenerDocentes ? antes?.tutor_id ?? null : null });
    }
    return id;
  };

  // La misma estructura del año anterior (cada grado con sus letras), aunque alguna sección quede vacía.
  for (const s of p.seccionesAnteriores.filter((x) => !x.eliminado)) seccionNueva(s.grado_id, s.letra);

  const seccionDe = new Map(p.seccionesAnteriores.map((s) => [s.id, s]));
  for (const m of p.matriculasAnteriores) {
    if (m.eliminado || m.estado !== "matriculado") continue; // retirados y trasladados no continúan
    const s = seccionDe.get(m.seccion_id);
    const g = s ? grado.get(s.grado_id) : undefined;
    if (!s || !g) continue;
    const sit: SituacionFinal = m.situacion_final ?? m.situacion_propuesta ?? "PRO";
    if (!m.situacion_final) plan.sinSituacion.push(m.estudiante_id);
    const destino = sit === "PER" ? g : gradoSiguiente(g, p.grados);
    if (!destino) {
      plan.egresados.push(m.estudiante_id);
      continue;
    }
    if (sit === "RR") plan.pendientesRecuperacion.push(m.estudiante_id);
    plan.matriculas.push({ id: p.nuevoId(), anio_id: p.nuevoAnioId, seccion_id: seccionNueva(destino.id, s.letra), estudiante_id: m.estudiante_id, estado: "matriculado" });
  }

  if (p.mantenerDocentes) {
    for (const a of p.asignacionesAnteriores) {
      const s = seccionDe.get(a.seccion_id);
      if (a.eliminado || !s) continue;
      const nueva = nuevas.get(clave(s.grado_id, s.letra));
      if (nueva) plan.asignaciones.push({ id: p.nuevoId(), docente_id: a.docente_id, seccion_id: nueva, area_id: a.area_id });
    }
  }
  return plan;
}
