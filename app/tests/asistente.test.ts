import { describe, expect, it } from "vitest";
import { sugerenciasDelDia, type EntradaAsistente } from "../src/dominio/asistente";
import { esDeNoche, proximoCambio } from "../src/ui/tema";

// Miércoles 25 de noviembre de 2026, 8:20 a. m.
const MIERCOLES = new Date(2026, 10, 25, 8, 20);

const base = (cambios: Partial<EntradaAsistente> = {}): EntradaAsistente => ({
  ahora: MIERCOLES,
  clases: [],
  dicta: true,
  sesionesHoy: [],
  notasFaltantes: [],
  entregasPorRevisar: 0,
  justificacionesPendientes: 0,
  mensajesSinLeer: { cantidad: 0, de: null },
  faltasRecientes: [],
  tareas: [],
  eventos: [],
  avanceBajo: [],
  ...cambios,
});

const clase = { seccionId: "s1", areaId: "a1", dia: 3, inicio: "08:00", fin: "09:30", area: "Matemática", seccion: "2.º B" };

describe("asistente del día", () => {
  it("propone tomar asistencia de la clase en curso", () => {
    const [s] = sugerenciasDelDia(base({ clases: [clase] }));
    expect(s.tipo).toBe("clase");
    expect(s.titulo).toBe("Ahora: Matemática con 2.º B");
    expect(s.ruta).toBe("/asistencia?seccion=s1&area=a1");
  });

  it("no insiste si ya tomó asistencia de esa clase", () => {
    const r = sugerenciasDelDia(base({ clases: [clase], sesionesHoy: [{ seccionId: "s1", areaId: "a1" }] }));
    expect(r.find((x) => x.tipo === "clase")).toBeUndefined();
  });

  it("avisa de la próxima clase dentro de la hora", () => {
    const r = sugerenciasDelDia(base({ clases: [{ ...clase, inicio: "09:00", fin: "10:00" }] }));
    expect(r[0].titulo).toBe("En 40 min: Matemática con 2.º B");
  });

  it("solo avisa de notas faltantes cerca del cierre, y con más urgencia al final", () => {
    const notas = { notasFaltantes: [{ curso: "Comunicación 2.º B", faltan: 12 }, { curso: "Matemática 1.º A", faltan: 3 }] };
    expect(sugerenciasDelDia(base({ ...notas, periodo: { nombre: "IV Bimestre", fin: "2027-01-30" } }))).toEqual([]);
    const lejos = sugerenciasDelDia(base({ ...notas, periodo: { nombre: "IV Bimestre", fin: "2026-12-14" } }))[0];
    expect(lejos.titulo).toBe("Faltan 15 notas: el IV Bimestre cierra en 19 días");
    expect(lejos.detalle).toBe("La mayoría en Comunicación 2.º B y 1 curso más.");
  });

  it("calcula los días que quedan y sube la prioridad en la última semana", () => {
    const notas = { notasFaltantes: [{ curso: "Comunicación 2.º B", faltan: 1 }] };
    const pronto = sugerenciasDelDia(base({ ...notas, periodo: { nombre: "IV Bimestre", fin: "2026-11-27" } }))[0];
    expect(pronto.titulo).toBe("Falta 1 nota: el IV Bimestre cierra en 2 días");
    expect(pronto.prioridad).toBeGreaterThan(90);
    expect(sugerenciasDelDia(base({ ...notas, periodo: { nombre: "IV", fin: "2026-11-25" } }))[0].titulo).toContain("cierra hoy");
  });

  it("alerta de faltas seguidas desde 3 en dos semanas", () => {
    const r = sugerenciasDelDia(base({ faltasRecientes: [
      { estudianteId: "e1", nombre: "Luis", faltas: 3, ruta: "/tutoria/estudiante/e1" },
      { estudianteId: "e2", nombre: "Ana", faltas: 2, ruta: "/tutoria/estudiante/e2" },
    ] }));
    expect(r.map((x) => x.titulo)).toEqual(["Luis faltó 3 veces en dos semanas"]);
  });

  it("ordena las tareas de la familia por urgencia", () => {
    const r = sugerenciasDelDia(base({ dicta: false, tareas: [
      { id: "t1", titulo: "Ensayo", area: "Comunicación", entrega: "2026-11-26", estado: "pendiente", quien: null },
      { id: "t2", titulo: "Ejercicios", area: "Matemática", entrega: "2026-11-25", estado: "pendiente", quien: null },
      { id: "t3", titulo: "Maqueta", area: "Ciencia", entrega: "2026-12-10", estado: "pendiente", quien: null },
      { id: "t4", titulo: "Resumen", area: "Historia", entrega: "2026-11-20", estado: "devuelta", quien: "Luis" },
    ] }));
    expect(r.map((x) => x.titulo)).toEqual(['"Ejercicios" vence hoy', 'Luis: corregir "Resumen"', '"Ensayo" vence mañana']);
  });

  it("muestra como máximo cinco sugerencias", () => {
    const r = sugerenciasDelDia(base({
      clases: [clase], entregasPorRevisar: 4, justificacionesPendientes: 1, mensajesSinLeer: { cantidad: 1, de: "Rosa" },
      eventos: [{ titulo: "Reunión de padres", fecha: "2026-11-25" }, { titulo: "Feria", fecha: "2026-11-26" }],
    }));
    expect(r).toHaveLength(5);
    expect(r[0].tipo).toBe("clase");
    expect(r.find((x) => x.tipo === "mensajes")?.titulo).toBe("Mensaje nuevo de Rosa");
  });
});

describe("tema según la hora", () => {
  it("es de noche desde las 18:00 hasta antes de las 6:00", () => {
    expect(esDeNoche(new Date(2026, 10, 25, 17, 59))).toBe(false);
    expect(esDeNoche(new Date(2026, 10, 25, 18, 0))).toBe(true);
    expect(esDeNoche(new Date(2026, 10, 25, 5, 59))).toBe(true);
    expect(esDeNoche(new Date(2026, 10, 25, 6, 0))).toBe(false);
  });

  it("el próximo cambio es a las 6:00 o a las 18:00", () => {
    expect(proximoCambio(new Date(2026, 10, 25, 10, 30))).toEqual(new Date(2026, 10, 25, 18, 0));
    expect(proximoCambio(new Date(2026, 10, 25, 20, 0))).toEqual(new Date(2026, 10, 26, 6, 0));
    expect(proximoCambio(new Date(2026, 10, 25, 3, 0))).toEqual(new Date(2026, 10, 25, 6, 0));
  });
});

describe("buscador", () => {
  it("encuentra sin importar tildes, mayúsculas ni el orden de las palabras", async () => {
    const { coincide } = await import("../src/ui/Buscador");
    expect(coincide("García Pérez, María", "maria garcia")).toBeGreaterThan(0);
    expect(coincide("Registro de notas", "NOTAS")).toBeGreaterThan(0);
    expect(coincide("Registro de notas", "asistencia")).toBe(-1);
    // Vale más cuando la palabra empieza igual.
    expect(coincide("Ana Torres", "ana")).toBeGreaterThan(coincide("Mariana Torres", "ana"));
  });
});
