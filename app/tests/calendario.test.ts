import { describe, expect, it } from "vitest";
import { calcularAvisos } from "@/dominio/avisos";
import { cuadriculaMes, estadoDelDia, feriados, ocurreEn } from "@/dominio/calendario";

describe("calendario escolar", () => {
  it("incluye los feriados fijos y Semana Santa (Pascua 2026: 5 de abril)", () => {
    const f = feriados(2026);
    expect(f.get("2026-07-28")).toBe("Fiestas Patrias");
    expect(f.get("2026-04-02")).toBe("Jueves Santo");
    expect(f.get("2026-04-03")).toBe("Viernes Santo");
    expect(feriados(2027).get("2027-03-26")).toBe("Viernes Santo"); // Pascua 2027: 28 de marzo
  });
  it("arma el mes empezando en lunes", () => {
    const c = cuadriculaMes(2026, 10); // noviembre 2026 empieza en domingo
    expect(c.slice(0, 7)).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(c.length % 7).toBe(0);
  });
  it("un evento de varios días ocurre en cada día del rango", () => {
    expect(ocurreEn({ fecha: "2026-11-24", fecha_fin: "2026-11-26" }, "2026-11-25")).toBe(true);
    expect(ocurreEn({ fecha: "2026-11-24", fecha_fin: null }, "2026-11-25")).toBe(false);
  });
  it("recuerda el evento el día anterior y el mismo día", () => {
    const ev = (fecha: string) => ({ id: fecha, colegio_id: "c", autor_id: "u", seccion_id: null, tipo: "reunion" as const, titulo: "Reunión de padres", descripcion: null, fecha, fecha_fin: null, hora: "18:00" });
    const base = { usuarioId: "x", esFamilia: true, esPersonal: false, vistosHasta: null, nombreEstudiante: () => "", faltas: [], notas: [], comunicados: [], leidos: new Set<string>(), observaciones: [], justificaciones: [], hoy: "2026-11-24" };
    const titulos = calcularAvisos({ ...base, eventos: [ev("2026-11-24"), ev("2026-11-25"), ev("2026-11-30")] }).map((a) => a.titulo);
    expect(titulos).toEqual(expect.arrayContaining(["Hoy: Reunión de padres", "Mañana: Reunión de padres"]));
    expect(titulos).toHaveLength(2);
  });
});

describe("estado del día de asistencia", () => {
  it("la falta manda sobre la tardanza, la justificada y el presente", () => {
    expect(estadoDelDia(["P", "P", "F"])).toBe("F");
    expect(estadoDelDia(["P", "T", "J"])).toBe("T");
    expect(estadoDelDia(["P", "J"])).toBe("J");
    expect(estadoDelDia(["P"])).toBe("P");
    expect(estadoDelDia([])).toBeNull();
  });
});
