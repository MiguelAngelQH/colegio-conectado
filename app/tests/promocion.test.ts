import { describe, expect, it } from "vitest";
import type { Area, Calificacion, Competencia, NivelLogro, Periodo } from "@/db/tipos";
import { mitad, nivelFinal, notasFinales, REGLAS_POR_DEFECTO, resultadoRecuperacion, situacionPropuesta, type Reglas } from "@/dominio/promocion";

// Áreas con 4, 3, 3, 3, 2 y 5 competencias (como en primaria del CNEB).
const areas = (...grupos: NivelLogro[][]) => Object.fromEntries(grupos.map((g, i) => [`a${i}`, g]));
const MAS = { ...REGLAS_POR_DEFECTO, criterioMitad: "mas_de_la_mitad" } satisfies Reglas;

describe("la mitad de las competencias", () => {
  it("se redondea hacia arriba con impares: 5 → 3, 3 → 2, 1 → 1", () => {
    expect([1, 2, 3, 4, 5].map((n) => mitad(n, "mitad_o_mas"))).toEqual([1, 1, 2, 2, 3]);
    expect([1, 2, 3, 4, 5].map((n) => mitad(n, "mas_de_la_mitad"))).toEqual([1, 2, 2, 3, 3]);
  });
});

describe("nivel final de una competencia", () => {
  const per = (id: string, numero: number) => ({ id, numero } as Periodo);
  const nota = (periodo_id: string, nivel_logro: NivelLogro | null) => ({ periodo_id, nivel_logro } as Calificacion);
  it("es el del último periodo con nota, no el promedio", () => {
    expect(nivelFinal([nota("p1", "C"), nota("p2", "B"), nota("p3", "AD")], [per("p1", 1), per("p2", 2), per("p3", 3)])).toBe("AD");
    expect(nivelFinal([nota("p1", "A"), nota("p4", null)], [per("p1", 1), per("p4", 4)])).toBe("A");
    expect(nivelFinal([], [per("p1", 1)])).toBeNull();
  });

  it("no cuenta las competencias transversales y avisa las que no tienen nota", () => {
    const area = (id: string, codigo: string) => ({ id, codigo, nivel: "primaria" } as Area);
    const comp = (id: string, area_id: string) => ({ id, area_id } as Competencia);
    const r = notasFinales({
      estudianteId: "e", nivel: "primaria", periodos: [per("p1", 1)],
      areas: [area("mat", "MAT"), area("trv", "TRV")], competencias: [comp("k1", "mat"), comp("k2", "mat"), comp("t1", "trv")],
      calificaciones: [
        { estudiante_id: "e", competencia_id: "k1", periodo_id: "p1", nivel_logro: "B" },
        { estudiante_id: "e", competencia_id: "t1", periodo_id: "p1", nivel_logro: "C" },
      ] as Calificacion[],
    });
    expect(r).toEqual({ porArea: { mat: ["B"] }, faltantes: 1 });
  });
});

describe("situación final propuesta", () => {
  it("1.º de primaria tiene promoción automática", () => {
    expect(situacionPropuesta({ nivel: "primaria", grado: 1, notas: areas(["C", "C"]) }).situacion).toBe("PRO");
  });

  it("grado intermedio: B o más en la mitad de las competencias de todas las áreas", () => {
    const pro = areas(["B", "B", "C", "C"], ["A", "B", "C"], ["B", "B", "C"], ["AD", "B", "C"]);
    expect(situacionPropuesta({ nivel: "secundaria", grado: 1, notas: pro }).situacion).toBe("PRO");
    // Con "más de la mitad", 2 de 4 ya no alcanza (ni 1 de 3).
    expect(situacionPropuesta({ nivel: "secundaria", grado: 1, notas: pro, reglas: MAS }).situacion).not.toBe("PRO");
  });

  it("grado final de ciclo: A o AD en la mitad de 3 áreas (secundaria) o 4 (primaria) y B en las demás", () => {
    const tres = areas(["A", "A", "B"], ["AD", "A", "B"], ["A", "C"], ["B", "B", "C"]);
    expect(situacionPropuesta({ nivel: "secundaria", grado: 2, notas: tres }).situacion).toBe("PRO");
    // En primaria pide 4 áreas con A/AD: estas mismas notas no alcanzan y, sin 4 áreas con C, va a recuperación.
    expect(situacionPropuesta({ nivel: "primaria", grado: 2, notas: tres }).situacion).toBe("RR");
  });

  it("permanece con C en la mitad de las competencias de 4 o más áreas", () => {
    const per = areas(["C", "C", "B"], ["C", "B"], ["C", "C", "A"], ["C", "C", "B", "B"], ["A", "A"]);
    const r = situacionPropuesta({ nivel: "secundaria", grado: 3, notas: per });
    expect(r.situacion).toBe("PER");
    expect(r.motivo).toMatch(/4 áreas/);
  });

  it("si no promueve ni permanece, requiere recuperación", () => {
    const rr = areas(["C", "C", "C"], ["C", "C"], ["A", "A", "B"], ["B", "B", "A"]);
    expect(situacionPropuesta({ nivel: "secundaria", grado: 4, notas: rr }).situacion).toBe("RR");
  });
});

describe("resultado de la recuperación", () => {
  it("grado intermedio: B o más en todas, se tolera una sola área toda en C", () => {
    expect(resultadoRecuperacion({ nivel: "secundaria", grado: 3, notasRecuperacion: areas(["B", "A"], ["C", "C"]) })).toBe("PRO");
    expect(resultadoRecuperacion({ nivel: "secundaria", grado: 3, notasRecuperacion: areas(["C", "C"], ["C"]) })).toBe("PER");
    expect(resultadoRecuperacion({ nivel: "secundaria", grado: 3, notasRecuperacion: areas(["B", "C"]) })).toBe("PER");
  });

  it("grado final: A o AD en la mitad y B en las demás", () => {
    expect(resultadoRecuperacion({ nivel: "secundaria", grado: 5, notasRecuperacion: areas(["A", "B"], ["AD", "A", "B"]) })).toBe("PRO");
    expect(resultadoRecuperacion({ nivel: "secundaria", grado: 5, notasRecuperacion: areas(["B", "B"]) })).toBe("PER");
  });
});
