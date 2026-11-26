import { describe, expect, it } from "vitest";
import { RECREO, validarHorario, type AreaHorario } from "../src/dominio/horario";

const MAT: AreaHorario = { id: "mat", nombre: "Matemática", docenteId: "carmen", docente: "Carmen Rojas" };
const COM: AreaHorario = { id: "com", nombre: "Comunicación", docenteId: "jorge", docente: "Jorge Flores" };
const vacio = ["", "", "", "", ""];

describe("validación del horario", () => {
  it("acepta un horario correcto y cuenta las horas pedagógicas", () => {
    const r = validarHorario([
      { inicio: "08:00", fin: "08:45", dias: ["mat", "mat", "com", "", ""] },
      { inicio: "08:45", fin: "09:30", dias: ["com", RECREO, "mat", "", ""] },
    ], [MAT, COM], []);
    expect(r.valido).toBe(true);
    expect(r.horas.map((h) => [h.area.nombre, h.horas])).toEqual([["Matemática", 3], ["Comunicación", 2]]);
  });

  it("rechaza horas vacías y un fin anterior al inicio", () => {
    const r = validarHorario([
      { inicio: "", fin: "08:45", dias: vacio },
      { inicio: "10:00", fin: "09:15", dias: vacio },
    ], [MAT], []);
    expect(r.valido).toBe(false);
    expect(r.errores[0]).toEqual(["Escriba la hora de inicio y de fin."]);
    expect(r.errores[1]).toEqual(["La hora de fin debe ser posterior a la de inicio."]);
  });

  it("detecta bloques que se cruzan, pero no los que solo se tocan", () => {
    const r = validarHorario([
      { inicio: "08:00", fin: "08:45", dias: vacio },
      { inicio: "08:30", fin: "09:15", dias: vacio },
      { inicio: "09:15", fin: "10:00", dias: vacio },
    ], [], []);
    expect(r.errores[0]).toEqual(["Se cruza con el bloque de 08:30 a 09:15."]);
    expect(r.errores[1]).toEqual(["Se cruza con el bloque de 08:00 a 08:45."]);
    expect(r.errores[2]).toEqual([]);
  });

  it("no deja poner a un docente en dos secciones a la misma hora", () => {
    const r = validarHorario(
      [{ inicio: "08:00", fin: "08:45", dias: ["mat", "com", "", "", ""] }],
      [MAT, COM],
      [{ docenteId: "carmen", dia: 1, inicio: "08:30", fin: "09:15", seccion: '3.º año "A"' }],
    );
    expect(r.valido).toBe(false);
    expect(r.choques[0][0]).toBe('Carmen Rojas ya tiene clase con 3.º año "A" el lunes de 08:30 a 09:15.');
    expect(r.choques[0][1]).toBeNull(); // el martes no choca
  });

  it("avisa sin bloquear: bloques largos, fuera de jornada y áreas sin horas", () => {
    const r = validarHorario([{ inicio: "05:00", fin: "09:00", dias: ["mat", "", "", "", ""] }], [MAT, COM], []);
    expect(r.valido).toBe(true);
    expect(r.avisos).toEqual([
      "El bloque de 05:00 a 09:00 dura más de 3 horas.",
      "El bloque de 05:00 a 09:00 está fuera de la jornada escolar habitual.",
      "Sin horas asignadas: Comunicación.",
    ]);
  });

  it("rechaza bloques de menos de 10 minutos", () => {
    expect(validarHorario([{ inicio: "08:00", fin: "08:05", dias: vacio }], [], []).errores[0]).toEqual(["Un bloque debe durar al menos 10 minutos."]);
  });
});

describe("horario de ejemplo", () => {
  it("ningún docente tiene dos clases a la misma hora", async () => {
    const { datosDemo } = await import("../src/data/demo");
    const datos = await datosDemo("2026-11-25");
    const clases = (datos.horario_clase ?? []) as unknown as { docente_id: string | null; dia: number; inicio: string }[];
    expect(clases.length).toBeGreaterThan(50);
    const vistos = new Set<string>();
    for (const c of clases.filter((x) => x.docente_id)) {
      const clave = `${c.docente_id}|${c.dia}|${c.inicio}`;
      expect(vistos.has(clave), `choque: ${clave}`).toBe(false);
      vistos.add(clave);
    }
  });
});
