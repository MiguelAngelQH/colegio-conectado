import { describe, expect, it } from "vitest";
import { armarHoja, nombreHoja } from "@/dominio/siagie";
import type { Area, Calificacion, Competencia, Estudiante } from "@/db/tipos";

const area: Area = { id: "MAT", colegio_id: null, nivel: "secundaria", codigo: "MAT", nombre: "Matemática", opcional: false, orden: 1 };
const comp = (id: string, orden: number): Competencia => ({ id, colegio_id: null, area_id: "MAT", numero: 22 + orden, nombre: `Competencia ${orden}`, orden });
const est = (id: string, apellidos: string, dni: string | null = null): Estudiante => ({ id, colegio_id: "c", usuario_id: null, dni, nombres: "Ana", apellidos, fecha_nacimiento: null, sexo: null, codigo_carne: id });
const nota = (e: string, c: string, nivel_logro: Calificacion["nivel_logro"], conclusion: string | null = null): Calificacion =>
  ({ id: `${e}${c}`, colegio_id: "c", estudiante_id: e, competencia_id: c, periodo_id: "p", seccion_id: "s", nivel_logro, conclusion });

describe("hojas para el SIAGIE", () => {
  it("ordena por apellido y pone calificativos y conclusiones por competencia", () => {
    const h = armarHoja({
      colegio: "IE", codigoModular: "0001", nivel: "Secundaria", grado: "2.º año", seccion: "B", periodo: "III Bimestre", area,
      competencias: [comp("k2", 2), comp("k1", 1)], estudiantes: [est("e2", "Zapata"), est("e1", "Alva", "71234567")], periodoId: "p",
      calificaciones: [nota("e1", "k1", "A"), nota("e1", "k2", "C", "Necesita apoyo"), nota("e2", "k1", "B"), nota("e2", "k2", "A", null)],
      usados: new Set(),
    });
    expect(h.filas[6]).toEqual(["N°", "DNI", "APELLIDOS Y NOMBRES", "C1: Competencia 1", "C2: Competencia 2", "CONCLUSIÓN DESCRIPTIVA C1", "CONCLUSIÓN DESCRIPTIVA C2"]);
    expect(h.filas[7]).toEqual([1, "71234567", "ALVA, ANA", "A", "C", "", "Necesita apoyo"]);
    expect(h.filas[8]).toEqual([2, "", "ZAPATA, ANA", "B", "A", "", ""]);
    expect(h).toMatchObject({ faltantes: 0, sinConclusion: 1 });
  });

  it("cuenta las notas que faltan", () => {
    const h = armarHoja({
      colegio: "IE", codigoModular: "0001", nivel: "Primaria", grado: "3.º", seccion: "A", periodo: "I", area,
      competencias: [comp("k1", 1)], estudiantes: [est("e1", "Alva")], periodoId: "p", calificaciones: [], usados: new Set(),
    });
    expect(h.faltantes).toBe(1);
  });

  it("genera nombres de hoja válidos y únicos (máx. 31 caracteres)", () => {
    const usados = new Set<string>();
    const a = nombreHoja('2.º año "B"', "Desarrollo Personal, Ciudadanía y Cívica", usados);
    const b = nombreHoja('2.º año "B"', "Desarrollo Personal, Ciudadanía y Cívica", usados);
    expect(a.length).toBeLessThanOrEqual(31);
    expect(a).not.toMatch(/["]/);
    expect(b).not.toBe(a);
  });
});
