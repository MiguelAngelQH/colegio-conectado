import { describe, expect, it } from "vitest";
import { indicadores } from "@/dominio/seguimiento";
import type { Asistencia, Calificacion, EstadoAsistencia, Incidencia } from "@/db/tipos";

const asis = (estado: EstadoAsistencia, i: number): Asistencia => ({ id: `a${i}`, colegio_id: "c", sesion_id: `s${i}`, estudiante_id: "e", estado, origen: "manual", marcado_en: null, token_qr: null, por_revisar: false });
const nota = (nivel_logro: Calificacion["nivel_logro"], i: number): Calificacion => ({ id: `c${i}`, colegio_id: "c", estudiante_id: "e", competencia_id: `k${i}`, periodo_id: "p", seccion_id: "s", nivel_logro, conclusion: null });
const inc = (estado: Incidencia["estado"]): Incidencia => ({ id: estado, colegio_id: "c", estudiante_id: "e", reportado_por: "u", fecha: "2026-10-01", tipo: "x", descripcion: "x", estado, codigo_siseve: null });

describe("indicadores de seguimiento", () => {
  it("calcula asistencia sin contar las justificadas y no alerta si todo está bien", () => {
    const r = indicadores({ asistencias: ["P", "P", "T", "J", "P"].map((e, i) => asis(e as EstadoAsistencia, i)), calificacionesPeriodo: [nota("A", 1), nota("B", 2)], incidencias: [inc("cerrada")] });
    expect(r).toMatchObject({ sesiones: 5, faltas: 0, tardanzas: 1, justificadas: 1, asistencia: 100, notasB: 1, incidenciasAbiertas: 0, alertas: [] });
  });

  it("alerta por faltas, notas en inicio e incidencias abiertas", () => {
    const r = indicadores({
      asistencias: ["F", "F", "P", "F", "P", "P"].map((e, i) => asis(e as EstadoAsistencia, i)),
      calificacionesPeriodo: [nota("C", 1), nota("C", 2), nota("A", 3)],
      incidencias: [inc("abierta"), inc("en_seguimiento")],
    });
    expect(r.asistencia).toBe(50);
    expect(r.alertas).toEqual(["3 faltas sin justificar", "2 competencias en inicio (C)", "2 incidencias abiertas"]);
  });

  it("alerta por porcentaje bajo aunque haya pocas faltas, solo con suficientes registros", () => {
    const pocos = indicadores({ asistencias: [asis("F", 1), asis("P", 2)], calificacionesPeriodo: [], incidencias: [] });
    expect(pocos.alertas).toEqual([]);
    const serie = (faltas: number, total: number) =>
      Array.from({ length: total }, (_, i) => asis(i < faltas ? "F" : "P", i));
    // 2 faltas de 15 = 87%: sobre el umbral de 85%, sin alerta.
    const bien = indicadores({ asistencias: serie(2, 15), calificacionesPeriodo: [], incidencias: [] });
    expect(bien).toMatchObject({ asistencia: 87, alertas: [] });
    // 2 faltas de 8 = 75%: bajo el umbral aunque no llegue a 3 faltas.
    const bajo = indicadores({ asistencias: serie(2, 8), calificacionesPeriodo: [], incidencias: [] });
    expect(bajo.alertas).toEqual(["Asistencia de 75%"]);
  });
});
