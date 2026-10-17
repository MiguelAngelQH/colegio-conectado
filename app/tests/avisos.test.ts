import { describe, expect, it } from "vitest";
import { calcularAvisos, type EntradaAvisos } from "@/dominio/avisos";
import type { Asistencia, Calificacion, Comunicado, Justificacion } from "@/db/tipos";

const base = (extra: Partial<EntradaAvisos> = {}): EntradaAvisos => ({
  usuarioId: "apo", esFamilia: true, esPersonal: false, vistosHasta: "2026-10-15T00:00:00.000Z",
  nombreEstudiante: () => "Luis", faltas: [], notas: [], comunicados: [], leidos: new Set(), observaciones: [], justificaciones: [], ...extra,
});
const asis = (estado: Asistencia["estado"], updated_at: string): Asistencia => ({ id: estado + updated_at, colegio_id: "c", sesion_id: "s", estudiante_id: "e", estado, origen: "manual", marcado_en: null, token_qr: null, por_revisar: false, updated_at });
const jus = (estado: Justificacion["estado"], solicitante_id = "apo"): Justificacion => ({ id: estado, colegio_id: "c", asistencia_id: "a", estudiante_id: "e", solicitante_id, motivo: "Cita", estado, revisado_por: null, respuesta: null, updated_at: "2026-10-16T00:00:00.000Z" });

describe("avisos", () => {
  it("avisa faltas y tardanzas (no presentes) y marca como nuevas las posteriores a la última visita", () => {
    const r = calcularAvisos(base({ faltas: [
      { a: asis("F", "2026-10-16T08:00:00.000Z"), fecha: "2026-10-16", clase: "Matemática" },
      { a: asis("T", "2026-10-10T08:00:00.000Z"), fecha: "2026-10-10", clase: null },
      { a: asis("P", "2026-10-17T08:00:00.000Z"), fecha: "2026-10-17", clase: null },
    ] }));
    expect(r.map((a) => [a.tipo, a.nuevo, a.importante])).toEqual([["falta", true, true], ["tardanza", false, false]]);
    expect(r[0].detalle).toMatch(/Matemática/);
  });

  it("destaca las notas en inicio (C)", () => {
    const c: Calificacion = { id: "n1", colegio_id: "c", estudiante_id: "e", competencia_id: "k", periodo_id: "p", seccion_id: "s", nivel_logro: "C", conclusion: "x", updated_at: "2026-10-16T00:00:00.000Z" };
    const [a] = calcularAvisos(base({ notas: [{ c, competencia: "Resuelve problemas de cantidad", area: "Matemática" }] }));
    expect(a).toMatchObject({ titulo: "Matemática: C (necesita apoyo)", importante: true, nuevo: true });
  });

  it("la familia ve las respuestas a sus justificaciones; el personal ve las pendientes", () => {
    const familia = calcularAvisos(base({ justificaciones: [jus("aprobada"), jus("pendiente"), jus("rechazada", "otro")] }));
    expect(familia.map((a) => a.titulo)).toEqual(["Justificación aprobada"]);
    const personal = calcularAvisos(base({ usuarioId: "doc", esFamilia: false, esPersonal: true, justificaciones: [jus("aprobada"), jus("pendiente")] }));
    expect(personal.map((a) => a.tipo)).toEqual(["por_revisar"]);
  });

  it("no avisa los comunicados propios y destaca los no leídos", () => {
    const com = (id: string, autor_id: string): Comunicado => ({ id, colegio_id: "c", autor_id, titulo: id, cuerpo: "x".repeat(200), destino: "todos", seccion_id: null, fecha: "2026-10-16", updated_at: "2026-10-16T00:00:00.000Z" });
    const r = calcularAvisos(base({ comunicados: [com("a", "dir"), com("b", "apo"), com("c", "dir")], leidos: new Set(["c"]) }));
    expect(r.map((a) => [a.titulo, a.importante])).toEqual([["a", true], ["c", false]]);
    expect(r[0].detalle.length).toBeLessThan(150);
  });

  it("sin visita previa todo es nuevo", () => {
    const r = calcularAvisos(base({ vistosHasta: null, faltas: [{ a: asis("F", "2020-01-01T00:00:00.000Z"), fecha: "2020-01-01", clase: null }] }));
    expect(r[0].nuevo).toBe(true);
  });
});
