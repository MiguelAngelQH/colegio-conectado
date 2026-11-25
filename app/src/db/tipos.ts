// Tipos del dominio. Los nombres de tablas y campos son iguales a los del servidor (Postgres)
// para que la sincronización no necesite traducciones.

export type Rol =
  | "ugel"
  | "director"
  | "subdirector"
  | "docente"
  | "tutor"
  | "auxiliar"
  | "estudiante"
  | "apoderado";

export type Nivel = "primaria" | "secundaria";
export type NivelLogro = "AD" | "A" | "B" | "C";
export type EstadoAsistencia = "P" | "T" | "F" | "J";

/** Campos comunes a toda fila sincronizable. */
export interface Fila {
  id: string;
  colegio_id: string | null;
  /** Lo asigna el servidor. En local solo es referencial. */
  updated_at?: string;
  updated_by?: string | null;
  eliminado?: boolean;
}

export interface Colegio extends Fila {
  nombre: string;
  /** 7 dígitos (ESCALE / SIAGIE). */
  codigo_modular: string;
  /** 6 dígitos. */
  codigo_local?: string;
  ugel: string;
  /** DRE o GRE. */
  dre?: string;
  region: string;
  provincia?: string;
  distrito: string;
  direccion?: string;
  telefono?: string;
  correo?: string;
  lema?: string;
  /** Insignia como imagen PNG o JPEG pequeña (data URL): se sincroniza y sirve sin conexión. */
  insignia?: string | null;
  /** Si es false, la asistencia no ofrece "Tardanza" (registro A/F/J). */
  usa_tardanza?: boolean;
}

export interface Usuario extends Fila {
  nombres: string;
  apellidos: string;
  dni: string | null;
  email: string | null;
  roles: Rol[];
  activo: boolean;
}

export interface AnioEscolar extends Fila {
  anio: number;
  regimen: "bimestre" | "trimestre";
  activo: boolean;
  /** Año cerrado por la dirección: sus notas y asistencia ya no se modifican. */
  cerrado_en?: string | null;
}

export interface Periodo extends Fila {
  anio_id: string;
  numero: number;
  nombre: string;
  inicio: string;
  fin: string;
  estado: "abierto" | "cerrado";
  /** Motivo de la última reapertura (queda también en la auditoría). */
  motivo_reapertura?: string | null;
}

export interface Grado extends Fila {
  nivel: Nivel;
  numero: number;
  nombre: string;
}

export interface Seccion extends Fila {
  anio_id: string;
  grado_id: string;
  letra: string;
  tutor_id: string | null;
}

/** Áreas y competencias del CNEB: colegio_id = null es catálogo oficial. */
export interface Area extends Fila {
  nivel: Nivel;
  codigo: string;
  nombre: string;
  opcional: boolean;
  orden: number;
}

export interface Competencia extends Fila {
  area_id: string;
  numero: number;
  nombre: string;
  orden: number;
}

export interface DocenteAsignacion extends Fila {
  docente_id: string;
  seccion_id: string;
  area_id: string;
}

export interface Estudiante extends Fila {
  usuario_id: string | null;
  dni: string | null;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string | null;
  sexo: "M" | "F" | null;
  /** Código impreso en el carné (QR del modo "escanear carnés"). */
  codigo_carne: string;
  // Ficha complementaria (salud y emergencias)
  direccion?: string | null;
  contacto_emergencia?: string | null;
  telefono_emergencia?: string | null;
  seguro?: "SIS" | "EsSalud" | "Privado" | "Ninguno" | null;
  /** Alergias, enfermedades, medicamentos. */
  salud?: string | null;
  /** Necesidades educativas especiales o discapacidad, y apoyos que necesita. */
  nee?: string | null;
  lengua_materna?: string | null;
  vive_con?: string | null;
}

export type SituacionFinal = "PRO" | "RR" | "PER";

export interface ResumenAsistencia { P: number; T: number; F: number; J: number; porcentaje: number | null }

export interface Matricula extends Fila {
  anio_id: string;
  seccion_id: string;
  estudiante_id: string;
  estado: "matriculado" | "retirado" | "trasladado";
  /** Propuesta calculada por la app al cerrar el año (RVM 094-2020). */
  situacion_propuesta?: SituacionFinal | null;
  /** Confirmada por la dirección (con motivo si difiere de la propuesta). */
  situacion_final?: SituacionFinal | null;
  situacion_motivo?: string | null;
  /** Guardado al cerrar el año: así el historial no depende de las sesiones de ese año. */
  asistencia_resumen?: ResumenAsistencia | null;
  /** Resultado de la recuperación pedagógica (enero y febrero) de quien quedó en RR. */
  resultado_recuperacion?: "PRO" | "PER" | null;
}

/** Criterio de evaluación de una lista de cotejo, ligado a una competencia y capacidad. */
export interface CriterioCotejo { competencia_id: string; capacidad: number | null; texto: string }

/** Lista de cotejo de una sesión de aprendizaje (como las hojas S17..S32 del registro del colegio). */
export interface ListaCotejo extends Fila {
  seccion_id: string;
  area_id: string;
  periodo_id: string;
  docente_id: string;
  numero: number | null;
  titulo: string;
  experiencia: string | null;
  evidencia: string | null;
  fecha: string;
  criterios: CriterioCotejo[];
  /** estudiante_id -> índice del criterio -> nivel */
  notas: Record<string, Record<string, NivelLogro>>;
}

/** Un bloque del horario de una sección (dia 1 = lunes). */
export interface HorarioClase extends Fila {
  seccion_id: string;
  dia: number;
  inicio: string; // "08:00"
  fin: string;
  area_id: string | null;
  docente_id: string | null;
  detalle: string | null;
}

/** Tarea que el docente deja a una sección. */
export interface Tarea extends Fila {
  seccion_id: string;
  area_id: string;
  docente_id: string;
  titulo: string;
  descripcion: string | null;
  entrega: string; // aaaa-mm-dd
}

export type TipoEvento = "examen" | "reunion" | "actividad" | "sin_clases" | "otro";

/** Evento del calendario escolar (seccion_id null = todo el colegio). */
export interface Evento extends Fila {
  autor_id: string;
  seccion_id: string | null;
  tipo: TipoEvento;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  fecha_fin: string | null;
  hora: string | null;
}

/** Informe del tutor al cerrar el año, para quien reciba al estudiante. Solo lo lee el personal. */
export interface InformeTutor extends Fila {
  estudiante_id: string;
  anio_id: string;
  tutor_id: string;
  fortalezas: string | null;
  dificultades: string | null;
  recomendaciones: string | null;
  apoyos: string | null;
  intereses: string | null;
}

export interface Apoderado extends Fila {
  usuario_id: string | null;
  dni: string | null;
  nombres: string;
  apellidos: string;
  telefono: string | null;
}

export interface EstudianteApoderado extends Fila {
  estudiante_id: string;
  apoderado_id: string;
  parentesco: string;
  orden: number;
}

export interface Calificacion extends Fila {
  estudiante_id: string;
  competencia_id: string;
  periodo_id: string;
  seccion_id: string;
  nivel_logro: NivelLogro | null;
  conclusion: string | null;
  /** Notas por capacidad: {"1": "B", "2": "A"}; el logro de la competencia sale de su promedio. */
  capacidades?: Record<string, NivelLogro>;
}

export interface AsistenciaSesion extends Fila {
  seccion_id: string;
  area_id: string | null;
  docente_id: string;
  fecha: string;
  modo: "manual" | "carne" | "qr";
  /** Hora (ms, reloj corregido del docente) en que se abrió; acota la validez de los QR. */
  abierta_en: number | null;
  estado: "abierta" | "confirmada";
}

/** Secreto HMAC del QR dinámico. Solo lo ven quien abrió la sesión, la dirección y el servidor. */
export interface AsistenciaSecreto extends Fila {
  sesion_id: string;
  docente_id: string;
  secreto: string;
}

export interface Asistencia extends Fila {
  sesion_id: string;
  estudiante_id: string;
  estado: EstadoAsistencia;
  origen: "manual" | "carne" | "qr";
  marcado_en: string | null;
  /** Token QR escaneado por el estudiante, validado por el servidor. */
  token_qr: string | null;
  por_revisar: boolean;
  /** Equipo desde el que el estudiante marcó (detecta celulares prestados). */
  dispositivo_id?: string | null;
  motivo_revision?: string | null;
}

/** Solicitud del apoderado para justificar una falta o tardanza; la revisa el personal. */
export interface Justificacion extends Fila {
  asistencia_id: string;
  estudiante_id: string;
  solicitante_id: string;
  motivo: string;
  estado: "pendiente" | "aprobada" | "rechazada";
  revisado_por: string | null;
  respuesta: string | null;
}

export interface Observacion extends Fila {
  estudiante_id: string;
  autor_id: string;
  fecha: string;
  tipo: "academica" | "conducta" | "felicitacion" | "otra";
  texto: string;
}

export interface SesionTutoria extends Fila {
  seccion_id: string;
  tutor_id: string;
  fecha: string;
  tema: string;
  acuerdos: string | null;
}

export interface Incidencia extends Fila {
  estudiante_id: string | null;
  reportado_por: string;
  fecha: string;
  tipo: string;
  descripcion: string;
  estado: "abierta" | "en_seguimiento" | "cerrada";
  codigo_siseve: string | null;
  /** Violencia o acoso: el colegio debe reportarla en el SíseVe (MINEDU). */
  requiere_siseve?: boolean;
}

export interface IncidenciaAccion extends Fila {
  incidencia_id: string;
  autor_id: string;
  fecha: string;
  texto: string;
}

export interface Entrevista extends Fila {
  estudiante_id: string;
  apoderado_id: string | null;
  tutor_id: string;
  fecha: string;
  motivo: string;
  acuerdos: string | null;
  asistio: boolean;
}

/** Pedido de ayuda del estudiante o su apoderado al tutor de la sección. */
export interface SolicitudTutoria extends Fila {
  estudiante_id: string;
  solicitante_id: string;
  /** Lo fija el servidor: el tutor de la sección del estudiante al momento de enviar. */
  tutor_id: string | null;
  motivo: "estudios" | "personal" | "companeros" | "familia" | "vocacional" | "otro";
  mensaje: string;
  modalidad: "presencial" | "app";
  estado: "enviada" | "vista" | "agendada" | "atendida" | "cancelada";
  /** Fecha y hora de la cita (ISO). */
  cita: string | null;
  respuesta: string | null;
  /** Entrevista registrada al atender el pedido. */
  entrevista_id: string | null;
  creada_en: string;
}

export interface ComunicadoLectura extends Fila {
  comunicado_id: string;
  usuario_id: string;
  leido_en: string;
}

export type EntidadEvidencia = "observacion" | "calificacion" | "incidencia" | "sesion_tutoria" | "entrevista" | "justificacion";

export interface Evidencia extends Fila {
  entidad: EntidadEvidencia;
  entidad_id: string;
  estudiante_id: string | null;
  autor_id: string;
  nombre: string;
  tipo: string;
  bytes: number;
  /** Ruta en el almacenamiento; null hasta que el equipo del autor sube el archivo. */
  ruta: string | null;
  descripcion: string | null;
}

export interface Comunicado extends Fila {
  autor_id: string;
  titulo: string;
  cuerpo: string;
  destino: "todos" | "seccion";
  seccion_id: string | null;
  fecha: string;
}

export type CategoriaMonitoreo = "pedagogica" | "gestion" | "convivencia" | "asistencia" | "infraestructura";

export interface ObservacionMonitoreo extends Fila {
  autor_id: string;
  fecha: string;
  texto: string;
  estado: "pendiente" | "atendida";
  categoria: CategoriaMonitoreo;
  respuesta: string | null;
  respondido_en?: string | null;
}

/** Mapa tabla -> tipo de fila. Debe coincidir con las tablas del servidor. */
export interface Tablas {
  colegio: Colegio;
  usuario: Usuario;
  anio_escolar: AnioEscolar;
  periodo: Periodo;
  grado: Grado;
  seccion: Seccion;
  area: Area;
  competencia: Competencia;
  docente_asignacion: DocenteAsignacion;
  estudiante: Estudiante;
  matricula: Matricula;
  apoderado: Apoderado;
  estudiante_apoderado: EstudianteApoderado;
  calificacion: Calificacion;
  asistencia_sesion: AsistenciaSesion;
  asistencia_secreto: AsistenciaSecreto;
  asistencia: Asistencia;
  justificacion: Justificacion;
  solicitud_tutoria: SolicitudTutoria;
  informe_tutor: InformeTutor;
  lista_cotejo: ListaCotejo;
  horario_clase: HorarioClase;
  tarea: Tarea;
  evento: Evento;
  observacion: Observacion;
  sesion_tutoria: SesionTutoria;
  entrevista: Entrevista;
  incidencia: Incidencia;
  incidencia_accion: IncidenciaAccion;
  comunicado: Comunicado;
  comunicado_lectura: ComunicadoLectura;
  evidencia: Evidencia;
  observacion_monitoreo: ObservacionMonitoreo;
}

export type NombreTabla = keyof Tablas;

/** Índices locales de cada tabla (formato Dexie, el primero es la clave). */
export const INDICES: Record<NombreTabla, string> = {
  colegio: "id",
  usuario: "id, colegio_id",
  anio_escolar: "id, colegio_id, activo",
  periodo: "id, anio_id",
  grado: "id, nivel",
  seccion: "id, anio_id, grado_id, tutor_id",
  area: "id, nivel",
  competencia: "id, area_id",
  docente_asignacion: "id, docente_id, seccion_id",
  estudiante: "id, usuario_id, codigo_carne",
  matricula: "id, seccion_id, estudiante_id",
  apoderado: "id, usuario_id",
  estudiante_apoderado: "id, estudiante_id, apoderado_id",
  calificacion: "id, [seccion_id+periodo_id], estudiante_id, [estudiante_id+competencia_id+periodo_id]",
  asistencia_sesion: "id, seccion_id, docente_id, fecha, [seccion_id+fecha]",
  asistencia_secreto: "id, sesion_id",
  asistencia: "id, sesion_id, estudiante_id, [sesion_id+estudiante_id]",
  justificacion: "id, estudiante_id, asistencia_id, estado",
  solicitud_tutoria: "id, estudiante_id, solicitante_id, tutor_id, estado",
  informe_tutor: "id, estudiante_id, anio_id",
  lista_cotejo: "id, [seccion_id+area_id+periodo_id], docente_id",
  horario_clase: "id, seccion_id, docente_id",
  tarea: "id, seccion_id, docente_id, entrega",
  evento: "id, fecha, seccion_id",
  observacion: "id, estudiante_id, autor_id",
  sesion_tutoria: "id, seccion_id",
  entrevista: "id, estudiante_id, tutor_id",
  incidencia: "id, estudiante_id, estado",
  incidencia_accion: "id, incidencia_id",
  comunicado: "id, fecha, seccion_id",
  comunicado_lectura: "id, comunicado_id, usuario_id",
  evidencia: "id, [entidad+entidad_id], estudiante_id",
  observacion_monitoreo: "id, fecha",
};

export const TABLAS = Object.keys(INDICES) as NombreTabla[];
