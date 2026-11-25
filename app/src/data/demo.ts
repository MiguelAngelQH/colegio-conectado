// Datos ficticios para el modo demo (sin servidor). Los nombres son inventados.
// Las fechas se calculan a partir de hoy: el panel siempre muestra las últimas semanas con datos.
import cneb from "./cneb.json";
import { idCalificacion, idDeterministico } from "@/dominio/notas";
import { capacidadesDe } from "@/dominio/capacidades";
import type {
  AnioEscolar, Apoderado, InformeTutor, ObservacionMonitoreo, Asistencia, AsistenciaSesion, Incidencia, IncidenciaAccion, Justificacion, Observacion, SesionTutoria, Area, Calificacion, Colegio, Comunicado, Competencia, DocenteAsignacion,
  Estudiante, EstudianteApoderado, Fila, Grado, Matricula, NivelLogro, NombreTabla, Periodo, Rol, Seccion, Usuario,
} from "@/db/tipos";

const id = (pref: string, n: number) => `${pref}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
export const COLEGIO_DEMO = id("d0000000", 1);
const CID = COLEGIO_DEMO;

/** Contraseña de todas las cuentas de prueba (se muestra en la pantalla de ingreso del demo). */
export const CLAVE_DEMO = "Colegio2026";

export const USUARIOS_DEMO: { id: string; nombres: string; apellidos: string; dni: string; email: string | null; roles: Rol[]; descripcion: string }[] = [
  { id: id("e0000000", 1), nombres: "Patricia", apellidos: "Salas Vera", dni: "41000001", email: null, roles: ["ugel"], descripcion: "Especialista de la UGEL" },
  { id: id("e0000000", 2), nombres: "Roberto", apellidos: "Paredes Luna", dni: "41000002", email: "director@demo.edu.pe", roles: ["director"], descripcion: "Director de la I.E." },
  { id: id("e0000000", 3), nombres: "Carmen", apellidos: "Rojas Medina", dni: "41000003", email: "crojas@demo.edu.pe", roles: ["docente", "tutor"], descripcion: "Docente de Matemática y tutora de 2.º B secundaria" },
  { id: id("e0000000", 4), nombres: "Jorge", apellidos: "Flores Ticona", dni: "41000004", email: null, roles: ["docente", "tutor"], descripcion: "Docente de 3.º A primaria" },
  { id: id("e0000000", 5), nombres: "Marta", apellidos: "Huamán Cruz", dni: "41000005", email: null, roles: ["auxiliar"], descripcion: "Auxiliar de educación" },
  { id: id("e0000000", 6), nombres: "Luis", apellidos: "Mamani Quispe", dni: "72000001", email: null, roles: ["estudiante"], descripcion: "Estudiante de 2.º B secundaria" },
  { id: id("e0000000", 7), nombres: "Rosa", apellidos: "Quispe Apaza", dni: "41000007", email: null, roles: ["apoderado"], descripcion: "Madre de Luis Mamani" },
];

/** Resto del personal (aparece en listas y paneles; no se ofrece como cuenta de ingreso). */
const PERSONAL_EXTRA: { id: string; nombres: string; apellidos: string; dni: string }[] = [
  { id: id("e0000000", 8), nombres: "Ana", apellidos: "Gutiérrez Pinto", dni: "41000008" },
  { id: id("e0000000", 9), nombres: "Carlos", apellidos: "Núñez Arce", dni: "41000009" },
  { id: id("e0000000", 10), nombres: "Silvia", apellidos: "Paz Chávez", dni: "41000010" },
  { id: id("e0000000", 11), nombres: "Julia", apellidos: "Vargas Soto", dni: "41000011" },
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
const PILA_F = ["Daniela", "Fernanda", "Gabriela", "Isabel", "Jimena", "Karen", "Milagros", "Nayeli", "Paola", "Ruth", "Tatiana", "Yesenia", "Brenda", "Flor", "Katherine"];
const PILA_M = ["Alonso", "Bruno", "César", "Edwin", "Franco", "Gustavo", "Hugo", "Iván", "Joel", "Marco", "Nilton", "Óscar", "Renzo", "Saúl", "Wilber"];
const APELLIDOS = ["Aguilar", "Benavente", "Cáceres", "Delgado", "Espinoza", "Gonzales", "Herrera", "Inca", "Jara", "Llerena", "Málaga", "Nina", "Ochoa", "Pinto", "Rivera", "Salinas", "Tapia", "Urquizo", "Valdivia", "Zegarra"];

/** Generador pseudoaleatorio con semilla (los datos de demo son siempre iguales para una misma fecha). */
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
const CONCLUSIONES_GENERALES: Record<"B" | "C", string[]> = {
  B: [
    "Está próximo a lograr la competencia; necesita acompañamiento en algunas actividades.",
    "Avanza en la competencia, pero requiere más práctica para hacerlo con autonomía.",
  ],
  C: [
    "Muestra un progreso mínimo; requiere acompañamiento permanente del docente y la familia.",
    "Necesita reforzamiento para desarrollar la competencia; se acordará un plan con la familia.",
  ],
};

/** Feriados nacionales (mes-día) que caen en el año escolar. */
const FERIADOS = new Set(["05-01", "06-07", "06-29", "07-23", "07-28", "07-29", "08-06", "08-30", "10-08", "11-01", "12-08", "12-09"]);

// Fechas como texto AAAA-MM-DD, calculadas en UTC para no depender de la zona horaria.
const aFecha = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (f: string, n: number) => aFecha(new Date(Date.parse(`${f}T00:00:00Z`) + n * 86_400_000));
const diaSemana = (f: string) => new Date(`${f}T00:00:00Z`).getUTCDay(); // 0 domingo … 6 sábado
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Cambia este número cuando cambien los datos de demo: los equipos vuelven a sembrar. */
export const VERSION_DEMO = 17;

export async function datosDemo(hoyReal = hoyLocal()): Promise<Partial<Record<NombreTabla, Fila[]>>> {
  const r = rng(42);
  // Año escolar: el actual desde fines de marzo; antes, el anterior (ya completo).
  const anioNum = hoyReal < `${hoyReal.slice(0, 4)}-03-23` ? Number(hoyReal.slice(0, 4)) - 1 : Number(hoyReal.slice(0, 4));
  const hoy = hoyReal > `${anioNum}-12-18` ? `${anioNum}-12-19` : hoyReal;
  const hace = (n: number) => sumarDias(hoy, -n);

  const colegio: Colegio = {
    id: CID, colegio_id: CID, nombre: "I.E. Demostración N.° 00001", codigo_modular: "0000001",
    ugel: "UGEL de ejemplo", region: "Arequipa", distrito: "Cayma",
    codigo_local: "000001", dre: "GRE Arequipa", provincia: "Arequipa", direccion: "Av. Ejemplo 123", telefono: "054 000000",
    correo: "contacto@demo.edu.pe", lema: "Aprender juntos, sin dejar a nadie atrás", insignia: null,
  };
  const usuarios: Usuario[] = [
    ...USUARIOS_DEMO.map((u) => ({ id: u.id, colegio_id: CID, nombres: u.nombres, apellidos: u.apellidos, dni: u.dni, email: u.email, roles: u.roles, activo: true })),
    ...PERSONAL_EXTRA.map((u) => ({ id: u.id, colegio_id: CID, nombres: u.nombres, apellidos: u.apellidos, dni: u.dni, email: null, roles: ["docente", "tutor"] as Rol[], activo: true })),
  ];

  const anio: AnioEscolar = { id: id("f0000000", 1), colegio_id: CID, anio: anioNum, regimen: "bimestre", activo: true };
  const rangos = [["03-16", "05-15"], ["05-25", "07-24"], ["08-10", "10-09"], ["10-19", "12-18"]] as const;
  const terminados = rangos.filter(([, fin]) => `${anioNum}-${fin}` < hoy).length;
  const periodos: Periodo[] = rangos.map(([inicio, fin], i) => ({
    id: id("f1000000", i + 1), colegio_id: CID, anio_id: anio.id, numero: i + 1,
    nombre: `${["I", "II", "III", "IV"][i]} Bimestre`, inicio: `${anioNum}-${inicio}`, fin: `${anioNum}-${fin}`,
    // El último periodo terminado sigue abierto: aún se completan sus notas.
    estado: i < terminados - 1 ? "cerrado" : "abierto",
  }));
  const periodoDe = (f: string) => periodos.find((p) => p.inicio <= f && f <= p.fin) ?? null;

  const grados: Grado[] = [
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: id("f2000000", n), colegio_id: CID, nivel: "primaria" as const, numero: n, nombre: `${n}.º grado` })),
    ...[1, 2, 3, 4, 5].map((n) => ({ id: id("f2000000", 10 + n), colegio_id: CID, nivel: "secundaria" as const, numero: n, nombre: `${n}.º año` })),
  ];
  const [uUgel, uDirector, uRojas, uFlores, uAuxiliar, uLuis, uRosa] = USUARIOS_DEMO;
  const [uGutierrez, uNunez, uPaz, uVargas] = PERSONAL_EXTRA;
  const sec = (n: number, grado: number, letra: string, tutor: string): Seccion =>
    ({ id: id("f3000000", n), colegio_id: CID, anio_id: anio.id, grado_id: id("f2000000", grado), letra, tutor_id: tutor });
  const secSec = sec(1, 12, "B", uRojas.id);
  const secPri = sec(2, 3, "A", uFlores.id);
  const sec5 = sec(3, 15, "A", uGutierrez.id);
  const sec1 = sec(4, 11, "A", uNunez.id);
  const sec6p = sec(5, 6, "A", uPaz.id);
  const sec1p = sec(6, 1, "B", uVargas.id);
  const secciones = [secSec, sec5, sec1, secPri, sec6p, sec1p];

  const areas = cneb.areas as Area[];
  const competencias = cneb.competencias as Competencia[];
  // Notas por capacidad coherentes con el logro: una sube y otra baja un nivel, el promedio no cambia.
  const ESCALA: NivelLogro[] = ["C", "B", "A", "AD"];
  const capacidadesPara = (c: Competencia, n: NivelLogro): Record<string, NivelLogro> => {
    const caps = capacidadesDe(c).map(() => n);
    const k = ESCALA.indexOf(n);
    if (caps.length >= 2 && k > 0 && k < 3 && r() < 0.7) {
      const i = Math.floor(r() * caps.length);
      const j = (i + 1 + Math.floor(r() * (caps.length - 1))) % caps.length;
      caps[i] = ESCALA[k + 1];
      caps[j] = ESCALA[k - 1];
    }
    return Object.fromEntries(caps.map((v, i) => [String(i + 1), v]));
  };
  const area = (nivel: string, codigo: string) => areas.find((a) => a.nivel === nivel && a.codigo === codigo)!;

  // Quién enseña qué. En primaria el tutor dicta las áreas principales.
  const asignaciones: DocenteAsignacion[] = [];
  const asignar = (docente: string, s: Seccion, nivel: string, codigos: string[]) =>
    codigos.forEach((cod) => asignaciones.push({ id: id("f4000000", asignaciones.length + 1), colegio_id: CID, docente_id: docente, seccion_id: s.id, area_id: area(nivel, cod).id }));
  asignar(uRojas.id, secSec, "secundaria", ["MAT", "COM"]);
  asignar(uFlores.id, secPri, "primaria", ["MAT", "COM", "PS", "CYT", "AYC"]);
  asignar(uNunez.id, secSec, "secundaria", ["CYT"]);
  asignar(uGutierrez.id, secSec, "secundaria", ["CCSS"]);
  asignar(uGutierrez.id, sec5, "secundaria", ["MAT", "COM", "CCSS"]);
  asignar(uNunez.id, sec5, "secundaria", ["CYT"]);
  asignar(uNunez.id, sec1, "secundaria", ["MAT", "CYT"]);
  asignar(uGutierrez.id, sec1, "secundaria", ["COM", "CCSS"]);
  asignar(uPaz.id, sec6p, "primaria", ["MAT", "COM", "PS", "CYT", "AYC"]);
  asignar(uVargas.id, sec1p, "primaria", ["MAT", "COM", "PS", "CYT", "AYC"]);

  const estudiantes: Estudiante[] = [];
  const matriculas: Matricula[] = [];
  const porSeccion = new Map<string, Estudiante[]>();
  const crear = (lista: readonly (readonly [string, string, string])[], s: Seccion, base: number) =>
    lista.forEach(([nombres, apellidos, sexo], i) => {
      const eid = id("f5000000", base + i);
      const e: Estudiante = {
        id: eid, colegio_id: CID, usuario_id: base === 1 && i === 0 ? uLuis.id : null, dni: `7${String(2_000_000 + base + i).padStart(7, "0")}`,
        nombres, apellidos, fecha_nacimiento: null, sexo: sexo as "M" | "F", codigo_carne: `CC-${(base + i).toString().padStart(5, "0")}`,
      };
      estudiantes.push(e);
      porSeccion.set(s.id, [...(porSeccion.get(s.id) ?? []), e]);
      matriculas.push({ id: id("f6000000", base + i), colegio_id: CID, anio_id: anio.id, seccion_id: s.id, estudiante_id: eid, estado: "matriculado" });
    });
  const inventar = (cantidad: number, semilla: number) => {
    const g = rng(semilla);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(g() * xs.length)];
    return Array.from({ length: cantidad }, (_, i) => {
      const mujer = i % 2 === 0;
      return [pick(mujer ? PILA_F : PILA_M), `${pick(APELLIDOS)} ${pick(APELLIDOS)}`, mujer ? "F" : "M"] as const;
    });
  };
  crear(NOMBRES_SEC, secSec, 1);
  crear(NOMBRES_PRI, secPri, 101);
  crear(inventar(13, 11), sec5, 201);
  crear(inventar(14, 12), sec1, 301);
  crear(inventar(11, 13), sec6p, 401);
  crear(inventar(12, 14), sec1p, 501);

  const apoderado: Apoderado = { id: id("f7000000", 1), colegio_id: CID, usuario_id: uRosa.id, dni: uRosa.dni, nombres: "Rosa", apellidos: "Quispe Apaza", telefono: null };
  const vinculo: EstudianteApoderado = { id: id("f8000000", 1), colegio_id: CID, estudiante_id: estudiantes[0].id, apoderado_id: apoderado.id, parentesco: "Madre", orden: 1 };

  // ------------------------------------------------------------------ notas
  // Cada área tiene su propia dificultad (Matemática y CyT con más B y C) para que el panel muestre contrastes.
  const dificultad: Record<string, number> = { MAT: 0.12, CYT: 0.06, COM: 0.02, CCSS: -0.02, PS: -0.04, AYC: -0.1 };
  const elegir = (sesgo: number): NivelLogro => {
    const x = r() + sesgo;
    return x < 0.18 ? "AD" : x < 0.66 ? "A" : x < 0.95 ? "B" : "C";
  };
  // Avance del último periodo terminado por docente (la UGEL observó atraso en primaria).
  const avanceUltimo: Record<string, number> = { [uFlores.id]: 0.55, [uNunez.id]: 0.8, [uVargas.id]: 0.7 };
  // Cada estudiante tiene su propio nivel: unos pocos necesitan más apoyo y concentran los C.
  const habilidad = new Map(estudiantes.map((e, i) => [e.id, i % 6 === 2 ? 0.1 : -0.16 + r() * 0.08]));
  const pendientes: Calificacion[] = [];
  periodos.forEach((p, ip) => {
    const enCurso = p.inicio <= hoy && hoy <= p.fin;
    if (ip >= terminados && !enCurso) return;
    for (const a of asignaciones) {
      const s = secciones.find((x) => x.id === a.seccion_id)!;
      const ar = areas.find((x) => x.id === a.area_id)!;
      const ests = porSeccion.get(s.id)!;
      const sesgo = (dificultad[ar.codigo] ?? 0) + (s === sec1 ? 0.05 : s === sec6p ? -0.05 : 0);
      let fraccion = 1;
      if (ip === terminados - 1) fraccion = avanceUltimo[a.docente_id] ?? 1;
      if (enCurso) fraccion = a.docente_id === uRojas.id || a.docente_id === uGutierrez.id ? 0.35 : 0;
      const cuantos = Math.round(ests.length * fraccion);
      ests.slice(0, cuantos).forEach((e) => {
        for (const c of competencias.filter((k) => k.area_id === ar.id)) {
          const n = elegir(sesgo + (habilidad.get(e.id) ?? 0));
          const textos = ar.codigo === "MAT" ? CONCLUSIONES : CONCLUSIONES_GENERALES;
          pendientes.push({
            id: "", colegio_id: CID, estudiante_id: e.id, competencia_id: c.id, periodo_id: p.id, seccion_id: s.id, nivel_logro: n,
            conclusion: n === "B" || n === "C" ? textos[n][Math.floor(r() * 2)] : null, capacidades: capacidadesPara(c, n),
          });
        }
      });
    }
  });
  // Mismo id que generaría cualquier equipo al calificar (ver idCalificacion).
  const califs: Calificacion[] = await Promise.all(
    pendientes.map(async (c) => ({ ...c, id: await idCalificacion(c.estudiante_id, c.competencia_id, c.periodo_id) })),
  );

  // ------------------------------------------------------------------ año anterior (historial)
  // 2.º B cursó 1.º B el año pasado: notas, situación final, asistencia e informes de su tutora de
  // entonces. Así el historial muestra lo que vería un docente que recibe a la sección.
  const anioPrevio: AnioEscolar = {
    id: id("f0000000", 2), colegio_id: CID, anio: anioNum - 1, regimen: "bimestre", activo: false, cerrado_en: `${anioNum - 1}-12-20T17:00:00.000Z`,
  };
  const periodosPrevios: Periodo[] = rangos.map(([inicio, fin], i) => ({
    id: id("f1000000", 5 + i), colegio_id: CID, anio_id: anioPrevio.id, numero: i + 1,
    nombre: `${["I", "II", "III", "IV"][i]} Bimestre`, inicio: `${anioNum - 1}-${inicio}`, fin: `${anioNum - 1}-${fin}`, estado: "cerrado",
  }));
  const secPrevia: Seccion = { id: id("f3000000", 50), colegio_id: CID, anio_id: anioPrevio.id, grado_id: id("f2000000", 11), letra: "B", tutor_id: uGutierrez.id };
  const deSecSec = porSeccion.get(secSec.id)!;
  const azarPrevio = rng(99);
  const matriculasPrevias: Matricula[] = deSecSec.map((e, i) => {
    const F = Math.floor(azarPrevio() * 6), T = Math.floor(azarPrevio() * 5), J = Math.floor(azarPrevio() * 3), total = 150;
    const P = total - F - T - J;
    const juan = e.nombres === "Juan";
    return {
      id: id("f6000000", 900 + i), colegio_id: CID, anio_id: anioPrevio.id, seccion_id: secPrevia.id, estudiante_id: e.id, estado: "matriculado",
      situacion_propuesta: juan ? "RR" : "PRO", situacion_final: juan ? "RR" : "PRO", situacion_motivo: null,
      resultado_recuperacion: juan ? "PRO" : null,
      asistencia_resumen: { P, T, F: juan ? F + 9 : F, J, porcentaje: Math.round(((P + T) / (P + T + (juan ? F + 9 : F))) * 100) },
    };
  });
  const pendientesPrevias: Calificacion[] = [];
  for (const cod of ["MAT", "COM", "CYT", "CCSS"]) {
    const ar = area("secundaria", cod);
    deSecSec.forEach((e) => {
      periodosPrevios.forEach((p, ip) => {
        for (const c of competencias.filter((k) => k.area_id === ar.id)) {
          // Mejora a lo largo del año: los primeros bimestres son un poco más bajos.
          const n = elegir((dificultad[cod] ?? 0) + (habilidad.get(e.id) ?? 0) + (3 - ip) * 0.03);
          pendientesPrevias.push({
            id: "", colegio_id: CID, estudiante_id: e.id, competencia_id: c.id, periodo_id: p.id, seccion_id: secPrevia.id, nivel_logro: n,
            conclusion: n === "B" || n === "C" ? (cod === "MAT" ? CONCLUSIONES : CONCLUSIONES_GENERALES)[n][0] : null, capacidades: capacidadesPara(c, n),
          });
        }
      });
    });
  }
  const califsPrevias: Calificacion[] = await Promise.all(
    pendientesPrevias.map(async (c) => ({ ...c, id: await idCalificacion(c.estudiante_id, c.competencia_id, c.periodo_id) })),
  );
  const INFORMES: Record<string, [string, string, string, string | null, string]> = {
    Luis: ["Colaborador y respetuoso; muy bueno en Ciencia.", "Se distrae cuando el trabajo es individual y largo.", "Darle tareas cortas con metas claras y revisar avances.", null, "Fútbol, robótica."],
    Ana: ["Ordenada y constante. Excelente en Comunicación.", "Muy tímida para exponer frente al grupo.", "Empezar con exposiciones en parejas; reforzar su confianza.", null, "Dibujo, lectura."],
    Juan: ["Creativo y con buena disposición para los trabajos prácticos.", "Muchas faltas en el segundo semestre por trabajo familiar.", "Coordinar con la familia desde el inicio; seguimiento semanal de asistencia.", "Requirió recuperación en Matemática (aprobó en febrero).", "Música, carpintería."],
    Rosa: ["Líder natural; ayuda a sus compañeros.", "Le cuesta Matemática.", "Ofrecerle reforzamiento temprano en Matemática.", "Usa lentes: sentarla adelante.", "Vóley, danza."],
  };
  const informesPrevios: InformeTutor[] = deSecSec.filter((e) => INFORMES[e.nombres]).map((e, i) => {
    const [fortalezas, dificultades, recomendaciones, apoyos, intereses] = INFORMES[e.nombres];
    return { id: id("fe300000", i + 1), colegio_id: CID, estudiante_id: e.id, anio_id: anioPrevio.id, tutor_id: uGutierrez.id, fortalezas, dificultades, recomendaciones, apoyos, intereses };
  });
  const observacionesPrevias: Observacion[] = [
    { id: id("fb000000", 50), colegio_id: CID, estudiante_id: deSecSec[0].id, autor_id: uGutierrez.id, fecha: `${anioNum - 1}-09-12`, tipo: "felicitacion", texto: "Primer puesto en la feria de ciencias del colegio." },
    { id: id("fb000000", 51), colegio_id: CID, estudiante_id: deSecSec.find((e) => e.nombres === "Juan")!.id, autor_id: uGutierrez.id, fecha: `${anioNum - 1}-10-03`, tipo: "conducta", texto: "Acumula faltas; se citó a la familia." },
  ];

  // ------------------------------------------------------------------ asistencia
  // Días hábiles de las últimas 14 semanas (sin hoy, para que el docente pueda tomar la de hoy).
  const dias: string[] = [];
  for (let f = hace(98); f < hoy; f = sumarDias(f, 1)) {
    const d = diaSemana(f);
    if (d === 0 || d === 6 || FERIADOS.has(f.slice(5)) || !periodoDe(f)) continue;
    dias.push(f);
  }
  // Algunos días con mucha inasistencia (lluvia, paro de transporte) para que se vean en el mapa de calor.
  const diasBajos = new Set(dias.filter((_, k) => k % 23 === 17));
  const azar = rng(7);
  const sesionesAsis: AsistenciaSesion[] = [];
  const marcasAsis: Asistencia[] = [];
  const luis = estudiantes[0];
  const juan = estudiantes.find((e) => e.nombres === "Juan")!;
  const ultimaSemana = dias.slice(-5);
  const dosSemanas = new Set(dias.slice(-10));
  for (const s of secciones) {
    const ests = porSeccion.get(s.id)!;
    // Propensión a faltar de cada estudiante: la mayoría baja, uno o dos más altos por sección.
    const propension = new Map(ests.map((e, i) => [e.id, i % 9 === 4 ? 0.09 : 0.004 + azar() * 0.014]));
    const sesgoSeccion = s === sec1 ? 0.035 : s === sec1p ? 0.02 : 0;
    for (const fecha of dias) {
      const sid = id("ff000000", sesionesAsis.length + 1);
      sesionesAsis.push({ id: sid, colegio_id: CID, seccion_id: s.id, area_id: null, docente_id: s.tutor_id!, fecha, modo: "manual", abierta_en: Date.parse(`${fecha}T08:00:00-05:00`), estado: "confirmada" });
      const extra = sesgoSeccion + (diaSemana(fecha) === 1 ? 0.02 : 0) + (diasBajos.has(fecha) ? 0.12 : 0);
      for (const e of ests) {
        const x = azar();
        const pFalta = propension.get(e.id)! + extra;
        let estado: Asistencia["estado"] = x < pFalta ? "F" : x < pFalta + 0.05 ? "T" : "P";
        // Faltas antiguas: una parte ya fue justificada por la familia.
        if (estado === "F" && fecha < hace(14) && azar() < 0.6) estado = "J";
        if (e.id === luis.id) {
          estado = fecha === ultimaSemana[2] ? "F" : fecha === ultimaSemana[4] ? "T" : "P";
        }
        // Juan acumula faltas en las dos últimas semanas (genera alerta en tutoría).
        if (e.id === juan.id && dosSemanas.has(fecha)) estado = fecha === dias[dias.length - 9] ? "P" : "F";
        marcasAsis.push({ id: await idDeterministico("asistencia", sid, e.id), colegio_id: CID, sesion_id: sid, estudiante_id: e.id, estado, origen: "manual", marcado_en: `${fecha}T13:05:00.000Z`, token_qr: null, por_revisar: false });
      }
    }
  }
  // La madre de Luis justificó su falta del miércoles; queda pendiente de revisión.
  const faltaLuis = marcasAsis.find((m) => m.estudiante_id === luis.id && m.estado === "F");
  const justificaciones: Justificacion[] = faltaLuis ? [{
    id: id("fe200000", 1), colegio_id: CID, asistencia_id: faltaLuis.id, estudiante_id: luis.id, solicitante_id: uRosa.id,
    motivo: "Tuvo fiebre y lo llevé al centro de salud. Adjunto la constancia en la libreta.", estado: "pendiente", revisado_por: null, respuesta: null,
  }] : [];

  // ------------------------------------------------------------------ comunicados, tutoría y convivencia
  const comunicados: Comunicado[] = [
    {
      id: id("fa000000", 1), colegio_id: CID, autor_id: uDirector.id, titulo: "Reunión de padres y entrega de informes",
      cuerpo: "Se convoca a los padres de familia a la entrega de informes de progreso este viernes a las 3:00 p. m. en el patio principal.",
      destino: "todos", seccion_id: null, fecha: hace(6),
    },
    {
      id: id("fa000000", 2), colegio_id: CID, autor_id: uRojas.id, titulo: "Salida de estudio al museo",
      cuerpo: "La próxima semana visitaremos el museo regional. Enviar la autorización firmada hasta el martes.",
      destino: "seccion", seccion_id: secSec.id, fecha: hace(5),
    },
  ];
  const [e1, e2, e3, e4] = estudiantes;
  const observaciones: Observacion[] = [
    { id: id("fb000000", 1), colegio_id: CID, estudiante_id: e1.id, autor_id: uRojas.id, fecha: hace(16), tipo: "felicitacion", texto: "Ayudó a sus compañeros a preparar la feria de ciencias." },
    { id: id("fb000000", 2), colegio_id: CID, estudiante_id: e4.id, autor_id: uRojas.id, fecha: hace(9), tipo: "conducta", texto: "Llega tarde con frecuencia y se distrae en clase." },
  ];
  const sesionesTutoria: SesionTutoria[] = [
    { id: id("fc000000", 1), colegio_id: CID, seccion_id: secSec.id, tutor_id: uRojas.id, fecha: hace(12), tema: "Prevención del acoso escolar", acuerdos: "Elaborar normas de convivencia del aula." },
  ];
  const otros = (k: number) => estudiantes[(k * 7 + 5) % estudiantes.length];
  const incidencias: Incidencia[] = [
    { id: id("fd000000", 1), colegio_id: CID, estudiante_id: e2.id, reportado_por: uRojas.id, fecha: hace(7), tipo: "Acoso escolar (bullying)",
      descripcion: "Compañeros le ponen apodos de forma reiterada durante el recreo.", estado: "en_seguimiento", codigo_siseve: null, requiere_siseve: true },
    { id: id("fd000000", 2), colegio_id: CID, estudiante_id: e3.id, reportado_por: uAuxiliar.id, fecha: hace(19), tipo: "Uso indebido del celular",
      descripcion: "Usó el celular durante la evaluación.", estado: "cerrada", codigo_siseve: null, requiere_siseve: false },
  ];
  // Historial de los meses anteriores (todas cerradas o en seguimiento).
  const historial: [number, string, Incidencia["estado"], boolean][] = [
    [26, "Conducta inadecuada en clase", "cerrada", false], [33, "Uso indebido del celular", "cerrada", false],
    [41, "Violencia psicológica o verbal", "cerrada", true], [48, "Inasistencias o tardanzas reiteradas", "en_seguimiento", false],
    [55, "Daño a la propiedad", "cerrada", false], [63, "Conducta inadecuada en clase", "cerrada", false],
    [71, "Uso indebido del celular", "cerrada", false], [84, "Ciberacoso", "cerrada", true], [92, "Conducta inadecuada en clase", "cerrada", false],
  ];
  historial.forEach(([dias, tipo, estado, siseve], k) => incidencias.push({
    id: id("fd000000", 3 + k), colegio_id: CID, estudiante_id: otros(k).id, reportado_por: k % 2 ? uAuxiliar.id : uRojas.id, fecha: hace(dias), tipo,
    descripcion: "Registro de convivencia del aula.", estado, codigo_siseve: siseve ? `SV-${anioNum}-${1040 + k}` : null, requiere_siseve: siseve,
  }));
  const acciones: IncidenciaAccion[] = [
    { id: id("fe000000", 1), colegio_id: CID, incidencia_id: incidencias[0].id, autor_id: uRojas.id, fecha: hace(6), texto: "Conversación con los estudiantes involucrados y compromiso de respeto." },
  ];

  const ultimoTerminado = periodos[Math.max(0, terminados - 1)];
  const monitoreo: ObservacionMonitoreo[] = [{
    id: id("fe100000", 1), colegio_id: CID, autor_id: uUgel.id, fecha: hace(10), categoria: "pedagogica", estado: "pendiente", respuesta: null,
    texto: `En la visita de monitoreo se observó que el registro de notas del ${ultimoTerminado.nombre} está atrasado en primaria. Presentar un plan para completarlo antes del cierre.`,
  }];

  // Horario de las secciones de secundaria (lunes a viernes, 6 bloques y recreo) y algunas tareas.
  const BLOQUES = [["08:00", "08:45"], ["08:45", "09:30"], ["09:30", "10:15"], ["10:15", "10:35"], ["10:35", "11:20"], ["11:20", "12:05"], ["12:05", "12:50"]];
  const horario: Fila[] = [];
  for (const s of [secSec, sec5, sec1]) {
    const delaSeccion = asignaciones.filter((a) => a.seccion_id === s.id);
    if (!delaSeccion.length) continue;
    let k = 0;
    for (let dia = 1; dia <= 5; dia++) {
      BLOQUES.forEach(([inicio, fin], b) => {
        const recreo = b === 3;
        const a = recreo ? null : delaSeccion[(k++ + dia) % delaSeccion.length];
        horario.push({
          id: id("fe200000", horario.length + 1), colegio_id: CID, seccion_id: s.id, dia, inicio, fin,
          area_id: a?.area_id ?? null, docente_id: a?.docente_id ?? null, detalle: recreo ? "Recreo" : null,
        } as unknown as Fila);
      });
    }
  }
  const tareas: Fila[] = asignaciones.filter((a) => a.seccion_id === secSec.id).slice(0, 3).flatMap((a, i) => [
    { id: id("fe300000", i * 2 + 1), colegio_id: CID, seccion_id: secSec.id, area_id: a.area_id, docente_id: a.docente_id,
      titulo: ["Resolver la ficha de fracciones (páginas 12 y 13)", "Leer el cuento y responder las preguntas", "Traer materiales para el experimento"][i] ?? "Tarea",
      descripcion: "Revisar las indicaciones dadas en clase.", entrega: sumarDias(hoy, 2 + i) },
    { id: id("fe300000", i * 2 + 2), colegio_id: CID, seccion_id: secSec.id, area_id: a.area_id, docente_id: a.docente_id,
      titulo: "Repaso de la semana", descripcion: null, entrega: hace(5 + i) },
  ] as unknown as Fila[]);

  return {
    colegio: [colegio], usuario: usuarios, anio_escolar: [anioPrevio, anio], periodo: [...periodosPrevios, ...periodos], grado: grados,
    seccion: [secPrevia, ...secciones], area: areas, competencia: competencias, docente_asignacion: asignaciones,
    estudiante: estudiantes.map((e) => (e.id === id("f5000000", 1) ? {
      ...e, direccion: "Jr. Los Andes 123, Cayma", contacto_emergencia: "Rosa Quispe Apaza (madre)", telefono_emergencia: "987654321",
      seguro: "SIS" as const, salud: "Asma leve: usa inhalador en clase de Educación Física", nee: null, lengua_materna: "Castellano", vive_con: "Madre y abuela",
    } : e)), matricula: [...matriculasPrevias, ...matriculas], apoderado: [apoderado], estudiante_apoderado: [vinculo],
    calificacion: [...califsPrevias, ...califs], comunicado: comunicados, observacion: [...observacionesPrevias, ...observaciones], sesion_tutoria: sesionesTutoria,
    informe_tutor: informesPrevios,
    incidencia: incidencias, incidencia_accion: acciones, asistencia_sesion: sesionesAsis, asistencia: marcasAsis,
    justificacion: justificaciones, observacion_monitoreo: monitoreo,
    horario_clase: horario as never, tarea: tareas as never,
    evento: [
      { id: id("fe400000", 1), colegio_id: CID, autor_id: id("e0000000", 2), seccion_id: null, tipo: "reunion", titulo: "Reunión de padres de familia", descripcion: "Entrega de informes del bimestre en cada aula.", fecha: sumarDias(hoy, 3), fecha_fin: null, hora: "18:00" },
      { id: id("fe400000", 2), colegio_id: CID, autor_id: uRojas.id, seccion_id: secSec.id, tipo: "examen", titulo: "Evaluación de Matemática: fracciones", descripcion: "Traer regla y calculadora.", fecha: sumarDias(hoy, 1), fecha_fin: null, hora: "08:00" },
      { id: id("fe400000", 3), colegio_id: CID, autor_id: id("e0000000", 2), seccion_id: null, tipo: "actividad", titulo: "Feria de ciencias", descripcion: null, fecha: sumarDias(hoy, 9), fecha_fin: sumarDias(hoy, 10), hora: null },
    ] as never,
  };
}
