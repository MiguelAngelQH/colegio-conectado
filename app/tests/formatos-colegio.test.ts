import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/contexto", () => ({ db: {} }));
import { logroPromedio } from "@/datos/formatos-colegio";

describe("logro bimestral como en el registro auxiliar del colegio", () => {
  it("promedia con AD=3, A=2, B=1, C=0 y redondea", () => {
    expect(logroPromedio(["B", "A", "A", "A"])).toBe("A"); // 1,75 -> 2
    expect(logroPromedio(["C", "B", "B", "C"])).toBe("B"); // 0,5 -> 1 (redondeo de Excel)
    expect(logroPromedio(["AD", "AD", "A", "A"])).toBe("AD"); // 2,5 -> 3
    expect(logroPromedio(["C", "C", "B"])).toBe("C"); // 0,33 -> 0
  });
  it("ignora las competencias sin nota y devuelve vacío si no hay ninguna", () => {
    expect(logroPromedio(["A", null, undefined])).toBe("A");
    expect(logroPromedio([null, null])).toBeNull();
  });
});
