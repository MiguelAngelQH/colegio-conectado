import { describe, expect, it } from "vitest";
import { type FilaImportada, convertirFilas, detectarEncabezado, mapeoSuficiente, reconocerColumna, separarNombreCompleto } from "@/dominio/importar";
import { numeroGrado, planificarImportacion } from "@/dominio/matricula";
import { proponerPeriodos, validarPeriodos } from "@/dominio/periodos";
import { nombrePropio, normalizarDni, normalizarFecha, normalizarSexo } from "@/dominio/texto";

describe("texto", () => {
  it("normaliza nombres respetando tildes, ñ y partículas", () => {
    expect(nombrePropio("  QUISPE DE LA CRUZ  ")).toBe("Quispe de la Cruz");
    expect(nombrePropio("PEÑA ÑAHUI JOSÉ")).toBe("Peña Ñahui José");
  });

  it("recupera los ceros del DNI que Excel pierde y rechaza los inválidos", () => {
    expect(normalizarDni(1234567)).toBe("01234567");
    expect(normalizarDni("71.234.567")).toBe("71234567");
    expect(normalizarDni("123456789")).toBeNull();
    expect(normalizarDni("123")).toBeNull();
    expect(normalizarDni("")).toBeNull();
  });

  it("entiende varias formas de escribir el sexo y la fecha", () => {
    expect(normalizarSexo("Mujer")).toBe("F");
    expect(normalizarSexo("H")).toBe("M");
    expect(normalizarSexo("x")).toBeNull();
    expect(normalizarFecha("14/05/2013")).toBe("2013-05-14");
    expect(normalizarFecha("2013-05-14")).toBe("2013-05-14");
    expect(normalizarFecha(41408)).toBe("2013-05-14"); // serie de Excel
    expect(normalizarFecha("31/02/2013")).toBeNull();
  });
});

describe("periodos", () => {
  it("propone 4 bimestres y 3 trimestres válidos que empiezan en lunes", () => {
    const b = proponerPeriodos(2026, "bimestre");
    expect(b).toHaveLength(4);
    expect(validarPeriodos(2026, b)).toEqual([]);
    expect(new Date(`${b[0].inicio}T12:00:00Z`).getUTCDay()).toBe(1);
    expect(new Date(`${b[0].fin}T12:00:00Z`).getUTCDay()).toBe(5);
    expect(b[3].fin < "2026-12-24").toBe(true);
    const t = proponerPeriodos(2026, "trimestre");
    expect(t.map((p) => p.nombre)).toEqual(["I Trimestre", "II Trimestre", "III Trimestre"]);
    expect(validarPeriodos(2026, t)).toEqual([]);
  });

  it("detecta periodos cruzados, invertidos o fuera del año", () => {
    const e = validarPeriodos(2026, [
      { numero: 1, nombre: "I Bimestre", inicio: "2026-03-16", fin: "2026-05-20" },
      { numero: 2, nombre: "II Bimestre", inicio: "2026-05-18", fin: "2026-05-10" },
      { numero: 3, nombre: "III Bimestre", inicio: "2027-01-05", fin: "2027-02-01" },
    ]);
    expect(e.join(" ")).toMatch(/termina antes de empezar/);
    expect(e.join(" ")).toMatch(/se cruza/);
    expect(e.join(" ")).toMatch(/dentro de 2026/);
  });
});

describe("importación de nómina", () => {
  it("reconoce encabezados con o sin tildes", () => {
    expect(reconocerColumna("Apellido Paterno")).toBe("apellido_paterno");
    expect(reconocerColumna("N° Documento")).toBe("dni");
    expect(reconocerColumna("FECHA DE NACIMIENTO")).toBe("fecha_nacimiento");
    expect(reconocerColumna("Sección")).toBe("seccion");
    expect(reconocerColumna("Apellidos y Nombres")).toBe("nombre_completo");
    expect(reconocerColumna("Observaciones")).toBeNull();
  });

  it("encuentra la fila de encabezados debajo de un título y convierte las filas", () => {
    const hoja = [
      ["NÓMINA DE MATRÍCULA 2026"],
      ["I.E. Demostración"],
      [],
      ["N°", "DNI", "Apellido paterno", "Apellido materno", "Nombres", "Sexo", "Fecha de nacimiento"],
      [1, 1234567, "QUISPE", "MAMANI", "LUIS ANGEL", "H", "14/05/2013"],
      [2, "72345678", "CCAMA", "HUANCA", "ANA", "Mujer", 41580],
      [3, "", "VILCA", "", "JUAN", "", ""],
      [],
      ["", "", "", "", "", "Total: 3"],
    ];
    const enc = detectarEncabezado(hoja)!;
    expect(enc.indice).toBe(3);
    expect(mapeoSuficiente(enc.mapeo)).toBe(true);
    const filas = convertirFilas(hoja, enc.indice, enc.mapeo);
    expect(filas).toHaveLength(3);
    expect(filas[0]).toMatchObject({ fila: 5, dni: "01234567", apellidos: "Quispe Mamani", nombres: "Luis Angel", sexo: "M", fecha_nacimiento: "2013-05-14", errores: [] });
    expect(filas[1]).toMatchObject({ sexo: "F", fecha_nacimiento: "2013-11-02" });
    expect(filas[2]).toMatchObject({ apellidos: "Vilca", dni: null, avisos: ["Sin DNI"] });
  });

  it("marca errores: DNI repetido o inválido y nombres faltantes", () => {
    const hoja = [
      ["DNI", "Apellidos", "Nombres"],
      ["71234567", "Rojas", "Ana"],
      ["71234567", "Flores", "Juan"],
      ["123", "Paz", ""],
    ];
    const enc = detectarEncabezado(hoja)!;
    const filas = convertirFilas(hoja, enc.indice, enc.mapeo);
    expect(filas[1].errores[0]).toMatch(/repetido.*fila 2/);
    expect(filas[2].errores).toEqual(["Faltan los nombres", "DNI inválido (debe tener 8 dígitos)"]);
  });

  it("separa apellidos y nombres cuando vienen en una sola columna", () => {
    expect(separarNombreCompleto("QUISPE MAMANI, Luis Ángel")).toEqual({ apellidos: "QUISPE MAMANI", nombres: "Luis Ángel" });
    expect(separarNombreCompleto("QUISPE MAMANI LUIS ANGEL")).toEqual({ apellidos: "QUISPE MAMANI", nombres: "LUIS ANGEL" });
    const hoja = [["Código", "Apellidos y nombres", "Sexo"], ["0001", "PUMA RAMOS, ELENA", "F"]];
    const enc = detectarEncabezado(hoja)!;
    expect(convertirFilas(hoja, enc.indice, enc.mapeo)[0]).toMatchObject({ apellidos: "Puma Ramos", nombres: "Elena", codigo: "0001" });
  });
});

describe("planificar importación", () => {
  const anioId = "anio";
  const grados = [
    { id: "g2s", colegio_id: "c", nivel: "secundaria" as const, numero: 2, nombre: "2.º año" },
    { id: "g3p", colegio_id: "c", nivel: "primaria" as const, numero: 3, nombre: "3.º grado" },
  ];
  const secciones = [
    { id: "s2B", colegio_id: "c", anio_id: anioId, grado_id: "g2s", letra: "B", tutor_id: null },
    { id: "s3A", colegio_id: "c", anio_id: anioId, grado_id: "g3p", letra: "A", tutor_id: null },
  ];
  const fila = (n: number, extra: Partial<FilaImportada> = {}): FilaImportada => ({
    fila: n, dni: null, codigo: null, apellidos: `Ap${n}`, nombres: `Nom${n}`, sexo: null, fecha_nacimiento: null,
    grado: null, seccion: null, errores: [], avisos: [], ...extra,
  });

  it("crea estudiantes nuevos con su matrícula y omite filas con errores", () => {
    const r = planificarImportacion({
      filas: [fila(2, { dni: "71234567" }), fila(3), fila(4, { errores: ["Faltan los nombres"] })],
      destino: { tipo: "seccion", seccionId: "s2B" }, anioId, secciones, grados, estudiantes: [], matriculas: [], actualizarExistentes: false,
    });
    expect(r).toMatchObject({ nuevos: 2, matriculados: 2, actualizados: 0 });
    expect(r.omitidas).toEqual([{ fila: 4, motivo: "Faltan los nombres" }]);
    expect(r.escrituras.map((e) => e.tabla)).toEqual(["estudiante", "matricula", "estudiante", "matricula"]);
    // El carné usa el DNI cuando lo hay.
    expect(r.escrituras[0].datos).toMatchObject({ codigo_carne: "71234567" });
  });

  it("reconoce estudiantes existentes por DNI y no los duplica ni los matricula dos veces", () => {
    const existente = { id: "e1", colegio_id: "c", usuario_id: null, dni: "71234567", nombres: "Luis", apellidos: "Quispe", fecha_nacimiento: null, sexo: null, codigo_carne: "71234567" };
    const r = planificarImportacion({
      filas: [fila(2, { dni: "71234567", nombres: "Luis Angel", apellidos: "Quispe Mamani" })],
      destino: { tipo: "seccion", seccionId: "s2B" }, anioId, secciones, grados,
      estudiantes: [existente],
      matriculas: [{ id: "m1", colegio_id: "c", anio_id: anioId, seccion_id: "s2B", estudiante_id: "e1", estado: "matriculado" }],
      actualizarExistentes: true,
    });
    expect(r).toMatchObject({ nuevos: 0, actualizados: 1, matriculados: 0, yaMatriculados: 1 });
    expect(r.escrituras).toEqual([{ tabla: "estudiante", datos: { id: "e1", nombres: "Luis Angel", apellidos: "Quispe Mamani" } }]);
  });

  it("no mueve en silencio a un estudiante matriculado en otra sección", () => {
    const r = planificarImportacion({
      filas: [fila(2, { dni: "71234567" })], destino: { tipo: "seccion", seccionId: "s3A" }, anioId, secciones, grados,
      estudiantes: [{ id: "e1", colegio_id: "c", usuario_id: null, dni: "71234567", nombres: "L", apellidos: "Q", fecha_nacimiento: null, sexo: null, codigo_carne: "X" }],
      matriculas: [{ id: "m1", colegio_id: "c", anio_id: anioId, seccion_id: "s2B", estudiante_id: "e1", estado: "matriculado" }],
      actualizarExistentes: false,
    });
    expect(r.matriculados).toBe(0);
    expect(r.omitidas[0].motivo).toMatch(/otra sección/);
  });

  it("ubica la sección con las columnas grado y sección del archivo", () => {
    expect(numeroGrado("SEGUNDO")).toBe(2);
    expect(numeroGrado("2do")).toBe(2);
    expect(numeroGrado("3.º grado")).toBe(3);
    const r = planificarImportacion({
      filas: [fila(2, { grado: "2°", seccion: "b" }), fila(3, { grado: "4", seccion: "A" })],
      destino: { tipo: "columnas", nivel: "secundaria" }, anioId, secciones, grados, estudiantes: [], matriculas: [], actualizarExistentes: false,
    });
    expect(r.matriculados).toBe(1);
    expect(r.escrituras[1].datos).toMatchObject({ seccion_id: "s2B" });
    expect(r.omitidas[0].motivo).toMatch(/No existe la sección 4 "A"/);
  });
});
