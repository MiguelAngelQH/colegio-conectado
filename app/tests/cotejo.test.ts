import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/contexto", () => ({ db: {} }));
import { consolidar } from "@/datos/cotejo";

describe("consolidar las listas de cotejo en capacidades (hojas C1..C4 del colegio)", () => {
  it("promedia los criterios de cada capacidad a lo largo de las sesiones", () => {
    const c = "comp-1";
    const r = consolidar([
      { criterios: [{ competencia_id: c, capacidad: 1, texto: "a" }, { competencia_id: c, capacidad: 2, texto: "b" }], notas: { e1: { 0: "B", 1: "A" } } },
      { criterios: [{ competencia_id: c, capacidad: 1, texto: "c" }, { competencia_id: c, capacidad: null, texto: "sin capacidad" }], notas: { e1: { 0: "AD", 1: "C" } } },
    ]);
    // Capacidad 1: B y AD -> (1+3)/2 = 2 -> A. Capacidad 2: A. El criterio sin capacidad no cuenta.
    expect(r.get("e1|comp-1")).toEqual({ 1: "A", 2: "A" });
  });
  it("no inventa notas para quien no fue calificado", () => {
    const r = consolidar([{ criterios: [{ competencia_id: "c", capacidad: 1, texto: "a" }], notas: { e1: {} } }]);
    expect(r.size).toBe(0);
  });
});
