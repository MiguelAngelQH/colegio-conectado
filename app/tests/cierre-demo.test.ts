import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Fila, NombreTabla } from "@/db/tipos";
import { ServidorDemo, TransporteDemo } from "@/sync/transporte-demo";

const C = "c1";
let n = 0;
let s: ServidorDemo;

beforeEach(async () => {
  s = new ServidorDemo(`cierre-${++n}`);
  const filas: Partial<Record<NombreTabla, Fila[]>> = {
    usuario: [
      { id: "dir", colegio_id: C, nombres: "D", apellidos: "D", dni: "40000001", email: null, roles: ["director"], activo: true },
      { id: "tut", colegio_id: C, nombres: "T", apellidos: "T", dni: "40000002", email: null, roles: ["docente", "tutor"], activo: true },
      { id: "otro", colegio_id: C, nombres: "O", apellidos: "O", dni: "40000003", email: null, roles: ["docente"], activo: true },
      { id: "u-est", colegio_id: C, nombres: "E", apellidos: "E", dni: "70000001", email: null, roles: ["estudiante"], activo: true },
    ] as unknown as Fila[],
    anio_escolar: [{ id: "a26", colegio_id: C, anio: 2026, regimen: "bimestre", activo: true }] as unknown as Fila[],
    periodo: [{ id: "p4", colegio_id: C, anio_id: "a26", numero: 4, nombre: "IV", inicio: "2026-10-19", fin: "2026-12-18", estado: "abierto" }] as unknown as Fila[],
    seccion: [{ id: "s1", colegio_id: C, anio_id: "a26", grado_id: "g", letra: "B", tutor_id: "tut" }] as unknown as Fila[],
    estudiante: [{ id: "e1", colegio_id: C, usuario_id: "u-est", dni: null, nombres: "E", apellidos: "E", fecha_nacimiento: null, sexo: null, codigo_carne: "1" }] as unknown as Fila[],
    matricula: [{ id: "m1", colegio_id: C, anio_id: "a26", seccion_id: "s1", estudiante_id: "e1", estado: "matriculado" }] as unknown as Fila[],
  };
  await s.sembrar(filas);
});

const informe = (tutor_id: string) => ({ id: "i1", colegio_id: C, estudiante_id: "e1", anio_id: "a26", tutor_id, fortalezas: "Curioso", dificultades: null, recomendaciones: null, apoyos: null, intereses: null });

describe("cierre del año en el servidor de demostración", () => {
  it("solo la dirección fija la situación final y con motivo si cambia la propuesta", async () => {
    await expect(s.aplicar("matricula", { id: "m1", situacion_final: "PRO" }, "tut")).rejects.toThrow(/dirección/);
    await expect(s.aplicar("matricula", { id: "m1", situacion_propuesta: "RR", situacion_final: "PRO" }, "dir")).rejects.toThrow(/motivo/);
    await s.aplicar("matricula", { id: "m1", situacion_propuesta: "RR", situacion_final: "PRO", situacion_motivo: "Recuperó en diciembre" }, "dir");
    expect((await s.tabla("matricula").get("m1"))?.situacion_final).toBe("PRO");
  });

  it("el informe lo escribe el tutor del estudiante; otro docente no", async () => {
    await expect(s.aplicar("informe_tutor", informe("otro"), "otro")).rejects.toThrow(/tutor/);
    await s.aplicar("informe_tutor", informe("tut"), "tut");
    expect((await s.tabla("informe_tutor").get("i1"))?.fortalezas).toBe("Curioso");
  });

  it("la familia y el estudiante no reciben el informe al sincronizar", async () => {
    await s.aplicar("informe_tutor", informe("tut"), "tut");
    const como = (u: string) => new TransporteDemo(s, () => u, () => true).pull(null);
    expect((await como("u-est")).filas.informe_tutor).toBeUndefined();
    expect((await como("otro")).filas.informe_tutor).toHaveLength(1);
  });

  it("con el año cerrado no se registran notas ni se edita el informe", async () => {
    await s.aplicar("informe_tutor", informe("tut"), "tut");
    await s.aplicar("anio_escolar", { id: "a26", cerrado_en: "2026-12-20T00:00:00Z" }, "dir");
    await expect(s.aplicar("calificacion", { id: "n1", colegio_id: C, estudiante_id: "e1", competencia_id: "k", periodo_id: "p4", seccion_id: "s1", nivel_logro: "A", conclusion: null }, "tut"))
      .rejects.toThrow(/cerrado/);
    await expect(s.aplicar("informe_tutor", { id: "i1", fortalezas: "Otra" }, "tut")).rejects.toThrow(/cerrado/);
  });
});
