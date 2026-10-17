import { describe, expect, it } from "vitest";
import { armarLibreta, calcularAvance, faltaConclusion, idCalificacion, idDeterministico } from "@/dominio/notas";
import type { Area, Calificacion, Competencia, Periodo } from "@/db/tipos";

const area = (id: string, orden: number): Area => ({ id, colegio_id: null, nivel: "secundaria", codigo: id, nombre: id, opcional: false, orden });
const comp = (id: string, area_id: string, orden: number): Competencia => ({ id, colegio_id: null, area_id, numero: orden, nombre: id, orden });
const per = (id: string, numero: number): Periodo => ({ id, colegio_id: "c", anio_id: "a", numero, nombre: id, inicio: "", fin: "", estado: "abierto" });
const nota = (estudiante_id: string, competencia_id: string, periodo_id: string, nivel_logro: Calificacion["nivel_logro"], conclusion: string | null = null): Calificacion =>
  ({ id: `${estudiante_id}${competencia_id}${periodo_id}`, colegio_id: "c", estudiante_id, competencia_id, periodo_id, seccion_id: "s", nivel_logro, conclusion });

describe("ids determinísticos", () => {
  it("la misma nota da el mismo id en cualquier equipo, y distinta nota da otro id", async () => {
    const a = await idCalificacion("e1", "c1", "p1");
    expect(a).toBe(await idCalificacion("e1", "c1", "p1"));
    expect(a).not.toBe(await idCalificacion("e1", "c1", "p2"));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await idDeterministico("x", "a", "b")).not.toBe(await idDeterministico("y", "a", "b"));
  });
});

describe("avance del registro", () => {
  it("cuenta notas esperadas y registradas por asignación, y las B/C sin conclusión", () => {
    const r = calcularAvance({
      periodoId: "p1",
      asignaciones: [{ id: "as1", colegio_id: "c", docente_id: "d", seccion_id: "s", area_id: "MAT" }],
      matriculas: [
        { id: "m1", colegio_id: "c", anio_id: "a", seccion_id: "s", estudiante_id: "e1", estado: "matriculado" },
        { id: "m2", colegio_id: "c", anio_id: "a", seccion_id: "s", estudiante_id: "e2", estado: "matriculado" },
        { id: "m3", colegio_id: "c", anio_id: "a", seccion_id: "s", estudiante_id: "e3", estado: "retirado" },
      ],
      competencias: [comp("c1", "MAT", 1), comp("c2", "MAT", 2), comp("x", "COM", 1)],
      calificaciones: [
        nota("e1", "c1", "p1", "A"), nota("e1", "c2", "p1", "B"), nota("e2", "c1", "p1", "C", "Necesita apoyo"),
        nota("e2", "c2", "p2", "A"), nota("e3", "c1", "p1", "A"), nota("e1", "x", "p1", "A"),
      ],
    });
    expect(r[0]).toMatchObject({ esperadas: 4, registradas: 3, sinConclusion: 1, porcentaje: 75 });
  });

  it("exige conclusión solo en B y C", () => {
    expect(faltaConclusion({ nivel_logro: "B", conclusion: "  " })).toBe(true);
    expect(faltaConclusion({ nivel_logro: "C", conclusion: "ok" })).toBe(false);
    expect(faltaConclusion({ nivel_logro: "A", conclusion: null })).toBe(false);
  });
});

describe("libreta", () => {
  it("ordena áreas y competencias, pone un nivel por periodo y la última conclusión", () => {
    const filas = armarLibreta({
      estudianteId: "e1",
      areas: [area("COM", 2), area("MAT", 1), area("ING", 3)],
      competencias: [comp("m2", "MAT", 2), comp("m1", "MAT", 1), comp("c1", "COM", 1)],
      periodos: [per("p2", 2), per("p1", 1)],
      calificaciones: [
        nota("e1", "m1", "p1", "C", "Inicio difícil"), nota("e1", "m1", "p2", "B", "Mejorando"),
        nota("e1", "c1", "p1", "AD"), nota("e2", "m2", "p1", "A"),
      ],
    });
    expect(filas.map((f) => f.area.id)).toEqual(["MAT", "COM"]); // ING sin notas no aparece
    expect(filas[0].competencias.map((c) => c.competencia.id)).toEqual(["m1", "m2"]);
    expect(filas[0].competencias[0]).toMatchObject({ niveles: ["C", "B"], conclusion: "Mejorando" });
    expect(filas[0].competencias[1].niveles).toEqual([null, null]);
    expect(filas[1].competencias[0]).toMatchObject({ niveles: ["AD", null], conclusion: null });
  });
});
