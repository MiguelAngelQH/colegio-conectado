import { describe, expect, it } from "vitest";
import { calcularPanel, lunesDe, type EntradaPanel } from "@/dominio/panel";
import type { Asistencia, AsistenciaSesion, Calificacion, Estudiante, Matricula } from "@/db/tipos";

const est = (id: string, apellidos = id): Estudiante => ({ id, colegio_id: "c", usuario_id: null, dni: null, nombres: id, apellidos, fecha_nacimiento: null, sexo: null, codigo_carne: id });
const mat = (estudiante_id: string, seccion_id = "s1"): Matricula => ({ id: `m-${estudiante_id}`, colegio_id: "c", anio_id: "a", seccion_id, estudiante_id, estado: "matriculado" });
const ses = (id: string, fecha: string): AsistenciaSesion => ({ id, colegio_id: "c", seccion_id: "s1", area_id: null, docente_id: "d", fecha, modo: "manual", abierta_en: null, estado: "confirmada" });
const asis = (sesion_id: string, estudiante_id: string, estado: Asistencia["estado"]): Asistencia => ({ id: `${sesion_id}-${estudiante_id}`, colegio_id: "c", sesion_id, estudiante_id, estado, origen: "manual", marcado_en: null, token_qr: null, por_revisar: false });
const nota = (estudiante_id: string, competencia_id: string, nivel_logro: Calificacion["nivel_logro"]): Calificacion => ({ id: `${estudiante_id}-${competencia_id}`, colegio_id: "c", estudiante_id, competencia_id, periodo_id: "p3", seccion_id: "s1", nivel_logro, conclusion: "x" });

function entrada(extra: Partial<EntradaPanel> = {}): EntradaPanel {
  return {
    hoy: "2026-10-17", periodoId: "p3",
    estudiantes: [est("e1", "Alva"), est("e2", "Bravo"), est("e3", "Cruz")],
    matriculas: [mat("e1"), mat("e2"), mat("e3")],
    seccionNombre: () => "2.º B",
    sesiones: [ses("s-a", "2026-10-12"), ses("s-b", "2026-10-14"), ses("s-c", "2026-10-15"), ses("s-viejo", "2026-08-01")],
    asistencias: [
      asis("s-a", "e1", "P"), asis("s-a", "e2", "F"), asis("s-a", "e3", "P"),
      asis("s-b", "e1", "P"), asis("s-b", "e2", "F"), asis("s-b", "e3", "J"),
      asis("s-c", "e1", "T"), asis("s-c", "e2", "F"), asis("s-c", "e3", "P"),
      asis("s-viejo", "e1", "F"),
    ],
    calificaciones: [nota("e1", "k1", "AD"), nota("e2", "k1", "C"), nota("e2", "k2", "C"), nota("e3", "k2", "B")],
    competencias: [
      { id: "k1", colegio_id: null, area_id: "MAT", numero: 23, nombre: "Cantidad", orden: 1 },
      { id: "k2", colegio_id: null, area_id: "COM", numero: 5, nombre: "Oral", orden: 1 },
    ],
    areaNombre: (id) => (id === "MAT" ? "Matemática" : "Comunicación"),
    asignaciones: [{ id: "as1", colegio_id: "c", docente_id: "d", seccion_id: "s1", area_id: "MAT" }],
    incidencias: [
      { id: "i1", colegio_id: "c", estudiante_id: "e3", reportado_por: "d", fecha: "2026-10-10", tipo: "Ciberacoso", descripcion: "x", estado: "abierta", codigo_siseve: null, requiere_siseve: true },
      { id: "i2", colegio_id: "c", estudiante_id: "e1", reportado_por: "d", fecha: "2026-10-01", tipo: "Ciberacoso", descripcion: "x", estado: "cerrada", codigo_siseve: "123", requiere_siseve: true },
    ],
    justificaciones: [{ id: "j1", colegio_id: "c", asistencia_id: "s-b-e3", estudiante_id: "e3", solicitante_id: "apo", motivo: "x", estado: "pendiente", revisado_por: null, respuesta: null }],
    ...extra,
  };
}

describe("panel del colegio", () => {
  it("calcula los indicadores principales", () => {
    const p = calcularPanel(entrada());
    expect(p.matriculados).toBe(3);
    // Últimos 30 días: 8 marcas sin contar la J; presentes o tarde 5 -> 63%. La falta de agosto no cuenta.
    expect(p.asistencia30).toBe(63);
    // Matemática: 3 estudiantes x 1 competencia, 2 notas -> 67%.
    expect(p.avanceNotas).toBe(67);
    expect(p).toMatchObject({ incidenciasAbiertas: 1, sisevePendientes: 1, justificacionesPendientes: 1 });
  });

  it("lista a los estudiantes en riesgo, primero los de más alertas", () => {
    const p = calcularPanel(entrada());
    expect(p.enRiesgo.map((r) => [r.estudiante.id, r.alertas.length])).toEqual([["e2", 2], ["e3", 1]]);
    expect(p.enRiesgo[0].alertas).toEqual(["3 faltas sin justificar", "2 competencias en inicio (C)"]);
  });

  it("agrupa los logros por área y la asistencia por semana", () => {
    const p = calcularPanel(entrada());
    expect(p.distribucion).toEqual([
      { area: "Comunicación", conteo: { AD: 0, A: 0, B: 1, C: 1 }, total: 2 },
      { area: "Matemática", conteo: { AD: 1, A: 0, B: 0, C: 1 }, total: 2 },
    ]);
    expect(p.semanas).toHaveLength(14);
    expect(p.semanas.at(-1)).toMatchObject({ semana: "2026-10-12", registros: 9, porcentaje: 63, P: 4, T: 1, F: 3, J: 1 });
    expect(p.semanas[0].porcentaje).toBeNull();
    expect(p.incidenciasPorTipo).toEqual([{ tipo: "Ciberacoso", n: 2 }]);
  });

  it("calcula la serie diaria, la asistencia por sección y los totales de logro", () => {
    const p = calcularPanel(entrada());
    expect(p.dias.map((d) => d.fecha)).toEqual(["2026-08-01", "2026-10-12", "2026-10-14", "2026-10-15"]);
    expect(p.dias.at(-1)).toEqual({ fecha: "2026-10-15", porcentaje: 67, registros: 3 });
    expect(p.porSeccion).toEqual([{ seccionId: "s1", seccion: "2.º B", porcentaje: 63, registros: 9 }]);
    expect(p.distribucionTotal).toEqual({ AD: 1, A: 0, B: 1, C: 2 });
  });

  it("compara la asistencia con los 30 días anteriores", () => {
    const base = entrada();
    expect(calcularPanel(base).asistenciaAnterior).toBeNull();
    const p = calcularPanel(entrada({
      sesiones: [...base.sesiones, ses("s-ant", "2026-09-10")],
      asistencias: [...base.asistencias, asis("s-ant", "e1", "F"), asis("s-ant", "e2", "P")],
    }));
    expect(p.asistenciaAnterior).toBe(50);
  });

  it("cuenta las incidencias por mes, incluidos los meses sin casos", () => {
    const p = calcularPanel(entrada());
    expect(p.incidenciasPorMes.map((m) => m.mes)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(p.incidenciasPorMes.at(-1)).toEqual({ mes: "2026-10", n: 2, tipos: { Ciberacoso: 2 } });
    expect(p.incidenciasPorMes[4].n).toBe(0);
  });

  it("filtra por sección: los indicadores solo cuentan a sus estudiantes", () => {
    const p = calcularPanel(entrada({ matriculas: [mat("e1")] }));
    expect(p.matriculados).toBe(1);
    expect(p.enRiesgo).toEqual([]);
    expect(p.justificacionesPendientes).toBe(0);
  });

  it("calcula el lunes de cada semana", () => {
    expect(lunesDe("2026-10-17")).toBe("2026-10-12");
    expect(lunesDe("2026-10-12")).toBe("2026-10-12");
    expect(lunesDe("2026-10-18")).toBe("2026-10-12");
  });
});
