import { describe, expect, it } from "vitest";
import type { DocenteAsignacion, Grado, Matricula, Seccion } from "@/db/tipos";
import { gradoSiguiente, planificarPaso } from "@/dominio/pasoAnio";

const g = (id: string, nivel: Grado["nivel"], numero: number) => ({ id, colegio_id: "c", nivel, numero, nombre: id } as Grado);
const grados = [g("p5", "primaria", 5), g("p6", "primaria", 6), g("s1", "secundaria", 1), g("s4", "secundaria", 4), g("s5", "secundaria", 5)];
const sec = (id: string, grado_id: string, letra = "A", tutor_id: string | null = "tut") => ({ id, colegio_id: "c", anio_id: "a26", grado_id, letra, tutor_id } as Seccion);
const mat = (estudiante_id: string, seccion_id: string, extra: Partial<Matricula> = {}) =>
  ({ id: `m-${estudiante_id}`, colegio_id: "c", anio_id: "a26", seccion_id, estudiante_id, estado: "matriculado", ...extra } as Matricula);

let n = 0;
const nuevoId = () => `n${++n}`;

describe("paso al año siguiente", () => {
  it("6.º de primaria pasa a 1.º de secundaria y 5.º de secundaria egresa", () => {
    expect(gradoSiguiente(grados[1], grados)?.id).toBe("s1");
    expect(gradoSiguiente(grados[4], grados)).toBeNull();
    expect(gradoSiguiente(grados[1], grados.filter((x) => x.nivel === "primaria"))).toBeNull();
  });

  it("promueve, deja en su grado a quien permanece y marca la recuperación pendiente", () => {
    const plan = planificarPaso({
      nuevoAnioId: "a27", grados, mantenerDocentes: false, asignacionesAnteriores: [], nuevoId,
      seccionesAnteriores: [sec("sp5", "p5"), sec("ss4", "s4", "B"), sec("ss5", "s5")],
      matriculasAnteriores: [
        mat("pro", "sp5", { situacion_final: "PRO" }),
        mat("per", "sp5", { situacion_final: "PER" }),
        mat("rr", "ss4", { situacion_final: "RR" }),
        mat("egresa", "ss5", { situacion_final: "PRO" }),
        mat("retirado", "sp5", { estado: "retirado" }),
        mat("sin", "sp5", { situacion_propuesta: "PRO" }),
      ],
    });
    const seccion = (est: string) => {
      const m = plan.matriculas.find((x) => x.estudiante_id === est);
      const s = plan.secciones.find((x) => x.id === m?.seccion_id);
      return s ? `${s.grado_id}${s.letra}` : null;
    };
    expect(seccion("pro")).toBe("p6A");
    expect(seccion("per")).toBe("p5A");
    expect(seccion("rr")).toBe("s5B");
    expect(seccion("egresa")).toBeNull();
    expect(seccion("retirado")).toBeNull();
    expect(plan.egresados).toEqual(["egresa"]);
    expect(plan.pendientesRecuperacion).toEqual(["rr"]);
    expect(plan.sinSituacion).toEqual(["sin"]);
    // Sin mantener docentes, las secciones nuevas no tienen tutor.
    expect(plan.secciones.every((s) => s.anio_id === "a27" && s.tutor_id === null)).toBe(true);
  });

  it("puede mantener tutores y docentes en la misma sección (grado y letra)", () => {
    const asig = { id: "as1", colegio_id: "c", docente_id: "doc", seccion_id: "sp5", area_id: "MAT" } as DocenteAsignacion;
    const plan = planificarPaso({
      nuevoAnioId: "a27", grados, mantenerDocentes: true, asignacionesAnteriores: [asig], nuevoId,
      seccionesAnteriores: [sec("sp5", "p5", "A", "tutora")], matriculasAnteriores: [],
    });
    const quinto = plan.secciones.find((s) => s.grado_id === "p5")!;
    expect(quinto.tutor_id).toBe("tutora");
    expect(plan.asignaciones).toEqual([{ id: expect.any(String), docente_id: "doc", seccion_id: quinto.id, area_id: "MAT" }]);
  });
});
