// Datos ficticios para el modo demo (sin servidor). Los nombres son inventados.
import cneb from "./cneb.json";
import { idCalificacion, idDeterministico } from "@/dominio/notas";
import type {
  AnioEscolar, Apoderado, Asistencia, AsistenciaSesion, Incidencia, IncidenciaAccion, Observacion, SesionTutoria, Area, Calificacion, Colegio, Comunicado, Competencia, DocenteAsignacion,
  Estudiante, EstudianteApoderado, Fila, Grado, Matricula, NivelLogro, NombreTabla, Periodo, Rol, Seccion, Usuario,
} from "@/db/tipos";

const id = (pref: string, n: number) => `${pref}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
export const COLEGIO_DEMO = id("d0000000", 1);
const CID = COLEGIO_DEMO;

export const USUARIOS_DEMO: { id: string; nombres: string; apellidos: string; roles: Rol[]; descripcion: string }[] = [
  { id: id("e0000000", 1), nombres: "Patricia", apellidos: "Salas Vera", roles: ["ugel"], descripcion: "Especialista de la UGEL" },
  { id: id("e0000000", 2), nombres: "Roberto", apellidos: "Paredes Luna", roles: ["director"], descripcion: "Director de la I.E." },
  { id: id("e0000000", 3), nombres: "Carmen", apellidos: "Rojas Medina", roles: ["docente", "tutor"], descripcion: "Docente de Matemática y tutora de 2.º B secundaria" },
  { id: id("e0000000", 4), nombres: "Jorge", apellidos: "Flores Ticona", roles: ["docente", "tutor"], descripcion: "Docente de 3.º A primaria" },
  { id: id("e0000000", 5), nombres: "Marta", apellidos: "Huamán Cruz", roles: ["auxiliar"], descripcion: "Auxiliar de educación" },
  { id: id("e0000000", 6), nombres: "Luis", apellidos: "Mamani Quispe", roles: ["estudiante"], descripcion: "Estudiante de 2.º B secundaria" },
  { id: id("e0000000", 7), nombres: "Rosa", apellidos: "Quispe Apaza", roles: ["apoderado"], descripcion: "Madre de Luis Mamani" },
];

const NOMBRES_SEC = [
  ["Luis", "Mamani Quispe", "M"], ["Ana", "Ccama Huanca", "F"], ["Rosa", "Quispe Condori", "F"],
  ["Juan", "Vilca Choque", "M"], ["Elena", "Puma Ramos", "F"], ["Pedro", "Huamán Torres", "M"],
  ["Sara", "Condori Mendoza", "F"], ["Diego", "Apaza Flores", "M"], ["Lucía", "Choque Mamani", "F"],
  ["Miguel", "Ramos Ccori", "M"], ["Valeria", "Torres Huarca", "F"], ["Kevin", "Mendoza Laura", "M"],
] as const;
const NOMBRES_PRI = [
  ["Camila", "Laura Ticona", "F"], ["Mateo", "Ccori Pari", "M"], ["Sofía", "Huarca Yupanqui", "F"],
  ["Thiago", "Pari Calla", "M"], ["Mía", "Yupanqui Soto", "F"], ["Gael", "Calla Mamani", "M"],
  ["Luana", "Soto Ccama", "F"], ["Liam", "Turpo Quispe", "M"], ["Ariana", "Cutipa Vilca", "F"],
  ["Adrián", "Coaquira Puma", "M"],
] as const;

/** Generador pseudoaleatorio con semilla (los datos de demo son siempre iguales). */
function rng(semilla: number) {
  let s = semilla;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

const CONCLUSIONES: Record<"B" | "C", string[]> = {
  B: [
    "Resuelve problemas sencillos, pero necesita apoyo para justificar sus procedimientos.",
    "Identifica datos del problema; aún le cuesta elegir la estrategia adecuada.",
  ],
  C: [
    "Requiere acompañamiento para traducir situaciones a expresiones numéricas.",
    "Presenta dificultades para resolver problemas; se recomienda reforzamiento en casa y en aula.",
  ],
};

/** Cambia este número cuando cambien los datos de demo: los equipos vuelven a sembrar. */
export const VERSION_DEMO = 4;

export async function datosDemo(): Promise<Partial<Record<NombreTabla, Fila[]>>> {
  const r = rng(42);
  const colegio: Colegio = {
    id: CID, colegio_id: CID, nombre: "I.E. Demostración N.° 00001", codigo_modular: "0000001",
    ugel: "UGEL de ejemplo", region: "Arequipa", distrito: "Cayma",
  };
  const usuarios: Usuario[] = USUARIOS_DEMO.map((u) => ({
    id: u.id, colegio_id: CID, nombres: u.nombres, apellidos: u.apellidos, dni: null,
    email: null, roles: u.roles, activo: true,
  }));

  const anio: AnioEscolar = { id: id("f0000000", 1), colegio_id: CID, anio: 2026, regimen: "bimestre", activo: true };
  const fechas = [
    ["2026-03-16", "2026-05-15", "cerrado"], ["2026-05-25", "2026-07-24", "cerrado"],
    ["2026-08-10", "2026-10-09", "abierto"], ["2026-10-19", "2026-12-18", "abierto"],
  ] as const;
  const periodos: Periodo[] = fechas.map(([inicio, fin, estado], i) => ({
    id: id("f1000000", i + 1), colegio_id: CID, anio_id: anio.id, numero: i + 1,
    nombre: `${["I", "II", "III", "IV"][i]} Bimestre`, inicio, fin, estado,
  }));

  const grados: Grado[] = [
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: id("f2000000", n), colegio_id: CID, nivel: "primaria" as const, numero: n, nombre: `${n}.º grado` })),
    ...[1, 2, 3, 4, 5].map((n) => ({ id: id("f2000000", 10 + n), colegio_id: CID, nivel: "secundaria" as const, numero: n, nombre: `${n}.º año` })),
  ];
  const [uUgel, , uRojas, uFlores, , uLuis, uRosa] = USUARIOS_DEMO;
  const secSec: Seccion = { id: id("f3000000", 1), colegio_id: CID, anio_id: anio.id, grado_id: id("f2000000", 12), letra: "B", tutor_id: uRojas.id };
  const secPri: Seccion = { id: id("f3000000", 2), colegio_id: CID, anio_id: anio.id, grado_id: id("f2000000", 3), letra: "A", tutor_id: uFlores.id };

  const areas = cneb.areas as Area[];
  const competencias = cneb.competencias as Competencia[];
  const area = (nivel: string, codigo: string) => areas.find((a) => a.nivel === nivel && a.codigo === codigo)!;

  const asignaciones: DocenteAsignacion[] = [];
  let na = 0;
  for (const cod of ["MAT", "COM"]) asignaciones.push({ id: id("f4000000", ++na), colegio_id: CID, docente_id: uRojas.id, seccion_id: secSec.id, area_id: area("secundaria", cod).id });
  for (const cod of ["MAT", "COM", "PS", "CYT", "AYC"]) asignaciones.push({ id: id("f4000000", ++na), colegio_id: CID, docente_id: uFlores.id, seccion_id: secPri.id, area_id: area("primaria", cod).id });

  const estudiantes: Estudiante[] = [];
  const matriculas: Matricula[] = [];
  const crear = (lista: readonly (readonly [string, string, string])[], sec: Seccion, base: number) =>
    lista.forEach(([nombres, apellidos, sexo], i) => {
      const eid = id("f5000000", base + i);
      estudiantes.push({
        id: eid, colegio_id: CID, usuario_id: base === 1 && i === 0 ? uLuis.id : null, dni: null,
        nombres, apellidos, fecha_nacimiento: null, sexo: sexo as "M" | "F", codigo_carne: `CC-${(base + i).toString().padStart(5, "0")}`,
      });
      matriculas.push({ id: id("f6000000", base + i), colegio_id: CID, anio_id: anio.id, seccion_id: sec.id, estudiante_id: eid, estado: "matriculado" });
    });
  crear(NOMBRES_SEC, secSec, 1);
  crear(NOMBRES_PRI, secPri, 101);

  const apoderado: Apoderado = { id: id("f7000000", 1), colegio_id: CID, usuario_id: uRosa.id, dni: null, nombres: "Rosa", apellidos: "Quispe Apaza", telefono: null };
  const vinculo: EstudianteApoderado = { id: id("f8000000", 1), colegio_id: CID, estudiante_id: estudiantes[0].id, apoderado_id: apoderado.id, parentesco: "Madre", orden: 1 };

  // Notas de Matemática de 2.º B: bimestres I y II completos, III a medias.
  const pendientes: Calificacion[] = [];
  const compMat = competencias.filter((c) => c.area_id === area("secundaria", "MAT").id);
  const elegir = (): NivelLogro => {
    const x = r();
    return x < 0.15 ? "AD" : x < 0.6 ? "A" : x < 0.88 ? "B" : "C";
  };
  periodos.slice(0, 3).forEach((p, ip) => {
    estudiantes.filter((e) => matriculas.find((m) => m.estudiante_id === e.id)!.seccion_id === secSec.id).forEach((e, ie) => {
      if (ip === 2 && ie > 6) return;
      compMat.forEach((c) => {
        const n = elegir();
        pendientes.push({
          id: "", colegio_id: CID, estudiante_id: e.id, competencia_id: c.id, periodo_id: p.id,
          seccion_id: secSec.id, nivel_logro: n,
          conclusion: n === "B" || n === "C" ? CONCLUSIONES[n][Math.floor(r() * 2)] : null,
        });
      });
    });
  });

  // Mismo id que generaría cualquier equipo al calificar (ver idCalificacion).
  const califs: Calificacion[] = await Promise.all(
    pendientes.map(async (c) => ({ ...c, id: await idCalificacion(c.estudiante_id, c.competencia_id, c.periodo_id) })),
  );

  const comunicados: Comunicado[] = [{
    id: id("fa000000", 1), colegio_id: CID, autor_id: USUARIOS_DEMO[1].id, titulo: "Reunión de padres - III Bimestre",
    cuerpo: "Se convoca a los padres de familia a la entrega de informes de progreso el viernes 23 de octubre a las 3:00 p. m.",
    destino: "todos", seccion_id: null, fecha: "2026-10-15",
  }];
  comunicados.push({
    id: id("fa000000", 2), colegio_id: CID, autor_id: uRojas.id, titulo: "Salida de estudio al museo",
    cuerpo: "El jueves 29 de octubre visitaremos el museo regional. Enviar la autorización firmada hasta el martes.",
    destino: "seccion", seccion_id: secSec.id, fecha: "2026-10-16",
  });
  const [e1, e2, e3, e4] = estudiantes;
  const observaciones: Observacion[] = [
    { id: id("fb000000", 1), colegio_id: CID, estudiante_id: e1.id, autor_id: uRojas.id, fecha: "2026-10-05", tipo: "felicitacion", texto: "Ayudó a sus compañeros a preparar la feria de ciencias." },
    { id: id("fb000000", 2), colegio_id: CID, estudiante_id: e4.id, autor_id: uRojas.id, fecha: "2026-10-12", tipo: "conducta", texto: "Llega tarde con frecuencia y se distrae en clase." },
  ];
  const sesionesTutoria: SesionTutoria[] = [
    { id: id("fc000000", 1), colegio_id: CID, seccion_id: secSec.id, tutor_id: uRojas.id, fecha: "2026-10-09", tema: "Prevención del acoso escolar", acuerdos: "Elaborar normas de convivencia del aula." },
  ];
  const incidencias: Incidencia[] = [
    { id: id("fd000000", 1), colegio_id: CID, estudiante_id: e2.id, reportado_por: uRojas.id, fecha: "2026-10-14", tipo: "Acoso escolar (bullying)",
      descripcion: "Compañeros le ponen apodos de forma reiterada durante el recreo.", estado: "en_seguimiento", codigo_siseve: null, requiere_siseve: true },
    { id: id("fd000000", 2), colegio_id: CID, estudiante_id: e3.id, reportado_por: USUARIOS_DEMO[4].id, fecha: "2026-10-02", tipo: "Uso indebido del celular",
      descripcion: "Usó el celular durante la evaluación.", estado: "cerrada", codigo_siseve: null, requiere_siseve: false },
  ];
  const acciones: IncidenciaAccion[] = [
    { id: id("fe000000", 1), colegio_id: CID, incidencia_id: incidencias[0].id, autor_id: uRojas.id, fecha: "2026-10-15", texto: "Conversación con los estudiantes involucrados y compromiso de respeto." },
  ];
  // Asistencia de una semana en 2.º B: Luis faltó el miércoles y llegó tarde el viernes; Juan acumula faltas.
  const deSec = estudiantes.filter((e) => matriculas.find((m) => m.estudiante_id === e.id)!.seccion_id === secSec.id);
  const sesionesAsis: AsistenciaSesion[] = [];
  const marcasAsis: Asistencia[] = [];
  const dias = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];
  for (const [k, fecha] of dias.entries()) {
    const sid = id("ff000000", k + 1);
    sesionesAsis.push({ id: sid, colegio_id: CID, seccion_id: secSec.id, area_id: null, docente_id: uRojas.id, fecha, modo: "manual", abierta_en: Date.parse(`${fecha}T08:00:00-05:00`), estado: "confirmada" });
    for (const e of deSec) {
      let estado: Asistencia["estado"] = "P";
      if (e.id === estudiantes[0].id && k === 2) estado = "F";
      if (e.id === estudiantes[0].id && k === 4) estado = "T";
      if (e.nombres === "Juan" && k !== 1) estado = "F";
      marcasAsis.push({ id: await idDeterministico("asistencia", sid, e.id), colegio_id: CID, sesion_id: sid, estudiante_id: e.id, estado, origen: "manual", marcado_en: `${fecha}T13:05:00.000Z`, token_qr: null, por_revisar: false });
    }
  }
  void uUgel;

  return {
    colegio: [colegio], usuario: usuarios, anio_escolar: [anio], periodo: periodos, grado: grados,
    seccion: [secSec, secPri], area: areas, competencia: competencias, docente_asignacion: asignaciones,
    estudiante: estudiantes, matricula: matriculas, apoderado: [apoderado], estudiante_apoderado: [vinculo],
    calificacion: califs, comunicado: comunicados, observacion: observaciones, sesion_tutoria: sesionesTutoria,
    incidencia: incidencias, incidencia_accion: acciones, asistencia_sesion: sesionesAsis, asistencia: marcasAsis,
  };
}
