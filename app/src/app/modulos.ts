import type { LucideIcon } from "lucide-react";
import {
  Bell, BookOpenCheck, ChartColumn, ClipboardList, Eye, FileSpreadsheet, HandHeart, House, ListChecks, Megaphone,
  QrCode, RefreshCw, Settings, ShieldAlert, User,
} from "lucide-react";
import type { Rol } from "@/db/tipos";

export interface Modulo {
  id: string;
  titulo: string;
  descripcion: string;
  icono: LucideIcon;
  ruta: string;
  roles: Rol[] | "todos";
  /** Fase del plan en la que el módulo queda operativo. */
  fase: number;
  /** Visible en la cuadrícula de inicio (además del menú lateral). */
  enInicio?: boolean;
  /** Color de su gema (clase tono-* de index.css). */
  tono: string;
}

const PERSONAL: Rol[] = ["director", "subdirector", "docente", "tutor", "auxiliar"];

export const MODULOS: Modulo[] = [
  { id: "inicio", titulo: "Inicio", descripcion: "Resumen del día", icono: House, ruta: "/", roles: "todos", fase: 0, tono: "tono-laguna" },
  { id: "perfil", titulo: "Perfil", descripcion: "Mis datos y mi equipo", icono: User, ruta: "/perfil", roles: "todos", fase: 0, enInicio: true, tono: "tono-pizarra" },
  { id: "configuracion", titulo: "Configuración del colegio", descripcion: "Año escolar, secciones, docentes y matrícula", icono: Settings, ruta: "/configuracion", roles: ["director", "subdirector"], fase: 1, enInicio: true, tono: "tono-pizarra" },
  { id: "notas", titulo: "Registro de notas", descripcion: "Calificación por competencias (AD, A, B, C)", icono: ClipboardList, ruta: "/notas", roles: ["docente", "tutor"], fase: 2, enInicio: true, tono: "tono-cielo" },
  { id: "notas-director", titulo: "Notas y libretas", descripcion: "Avance por docente, cierre de bimestre e informes de progreso", icono: BookOpenCheck, ruta: "/notas", roles: ["director", "subdirector"], fase: 2, enInicio: true, tono: "tono-cielo" },
  { id: "mis-notas", titulo: "Notas y libreta", descripcion: "Logros por competencia y libreta", icono: BookOpenCheck, ruta: "/mis-notas", roles: ["estudiante", "apoderado"], fase: 5, enInicio: true, tono: "tono-cielo" },
  { id: "asistencia", titulo: "Asistencia", descripcion: "Con QR, escaneo de carnés o lista", icono: QrCode, ruta: "/asistencia", roles: ["docente", "tutor", "auxiliar", "director", "subdirector"], fase: 3, enInicio: true, tono: "tono-laguna" },
  { id: "marcar", titulo: "Marcar asistencia", descripcion: "Escanear el QR del docente", icono: QrCode, ruta: "/marcar", roles: ["estudiante"], fase: 3, enInicio: true, tono: "tono-laguna" },
  { id: "mi-asistencia", titulo: "Asistencia", descripcion: "Faltas, tardanzas y justificaciones", icono: ListChecks, ruta: "/mi-asistencia", roles: ["apoderado", "estudiante"], fase: 5, enInicio: true, tono: "tono-laguna" },
  { id: "tutoria", titulo: "Tutoría", descripcion: "Sesiones, entrevistas y seguimiento", icono: HandHeart, ruta: "/tutoria", roles: ["tutor", "director", "subdirector", "estudiante"], fase: 4, enInicio: true, tono: "tono-rosa" },
  { id: "convivencia", titulo: "Convivencia", descripcion: "Incidencias y seguimiento (SíseVe)", icono: ShieldAlert, ruta: "/convivencia", roles: ["director", "subdirector", "tutor", "auxiliar"], fase: 4, enInicio: true, tono: "tono-coral" },
  { id: "comunicados", titulo: "Comunicados", descripcion: "Avisos para la comunidad educativa", icono: Megaphone, ruta: "/comunicados", roles: "todos", fase: 4, enInicio: true, tono: "tono-ambar" },
  { id: "paneles", titulo: "Paneles e indicadores", descripcion: "Avance, logros, asistencia y alertas", icono: ChartColumn, ruta: "/paneles", roles: ["director", "subdirector", "ugel"], fase: 6, enInicio: true, tono: "tono-lila" },
  { id: "monitoreo", titulo: "Monitoreo UGEL", descripcion: "Observaciones de monitoreo al director", icono: Eye, ruta: "/monitoreo", roles: ["ugel", "director"], fase: 6, enInicio: true, tono: "tono-lila" },
  { id: "siagie", titulo: "Exportar a SIAGIE", descripcion: "Archivo Excel para la carga oficial", icono: FileSpreadsheet, ruta: "/siagie", roles: ["director", "subdirector"], fase: 7, enInicio: true, tono: "tono-musgo" },
  { id: "avisos", titulo: "Avisos", descripcion: "Faltas, notas, comunicados y respuestas", icono: Bell, ruta: "/avisos", roles: "todos", fase: 5, tono: "tono-ambar" },
  { id: "sincronizacion", titulo: "Sincronización", descripcion: "Cambios pendientes y estado de la conexión", icono: RefreshCw, ruta: "/sincronizacion", roles: "todos", fase: 0, enInicio: true, tono: "tono-laguna" },
];

export function modulosPara(roles: Rol[]): Modulo[] {
  const vistos = new Set<string>();
  return MODULOS.filter((m) => {
    if (m.roles !== "todos" && !m.roles.some((r) => roles.includes(r))) return false;
    // Un mismo destino puede tener dos variantes por rol (p. ej. notas del docente y del director).
    if (vistos.has(m.ruta)) return false;
    vistos.add(m.ruta);
    return true;
  });
}

export const NOMBRE_ROL: Record<Rol, string> = {
  ugel: "Supervisor UGEL",
  director: "Director(a)",
  subdirector: "Subdirector(a)",
  docente: "Docente",
  tutor: "Tutor(a)",
  auxiliar: "Auxiliar de educación",
  estudiante: "Estudiante",
  apoderado: "Padre / Apoderado",
};

export const TONO_ROL: Record<Rol, string> = {
  ugel: "tono-lila",
  director: "tono-laguna",
  subdirector: "tono-laguna",
  docente: "tono-cielo",
  tutor: "tono-rosa",
  auxiliar: "tono-ambar",
  estudiante: "tono-musgo",
  apoderado: "tono-coral",
};

export function esPersonal(roles: Rol[]) {
  return roles.some((r) => PERSONAL.includes(r));
}
