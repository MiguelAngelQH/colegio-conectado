import { describe, expect, it } from "vitest";
import cneb from "@/data/cneb.json";
import { CAPACIDADES, capacidadesDe, logroDeCapacidades } from "@/dominio/capacidades";

describe("capacidades del CNEB", () => {
  it("todas las competencias del catálogo tienen sus capacidades", () => {
    const sin = (cneb.competencias as { numero: number; nombre: string }[]).filter((c) => !capacidadesDe(c).length);
    expect(sin).toEqual([]);
    expect(Object.keys(CAPACIDADES)).toHaveLength(31);
  });
  it("Resuelve problemas de cantidad tiene las 4 capacidades del registro auxiliar", () => {
    expect(CAPACIDADES[23]).toEqual([
      "Traduce cantidades a expresiones numéricas", "Comunica su comprensión sobre los números y las operaciones",
      "Usa estrategias y procedimientos de estimación y cálculo", "Argumenta afirmaciones sobre las relaciones numéricas y las operaciones",
    ]);
  });
  it("el logro de la competencia sale del promedio de sus capacidades", () => {
    expect(logroDeCapacidades({ 1: "B", 2: "A", 3: "A", 4: "A" })).toBe("A"); // fila 1 del registro del colegio
    expect(logroDeCapacidades({ 1: "C", 2: "B", 3: "B" })).toBe("B");
    expect(logroDeCapacidades({})).toBeNull();
  });
});
