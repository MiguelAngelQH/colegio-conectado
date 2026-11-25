import type { LucideIcon } from "lucide-react";
import {
  BookOpen, CalendarRange, ChartColumn, ClipboardCheck, FileCheck, FileUp, GraduationCap, HandHeart, IdCard, Inbox, LayoutGrid,
  LayoutDashboard, Library, Lock, MessagesSquare, School, Settings, Users,
} from "lucide-react";
import type { Rol } from "@/db/tipos";
import { modulosPara, type Modulo } from "./modulos";

export interface ItemMenu {
  id: string;
  titulo: string;
  ruta: string;
  icono: LucideIcon;
  descripcion?: string;
  tono?: string;
  /** Subopciones que se despliegan con la flecha. */
  hijos?: ItemMenu[];
}

export interface GrupoMenu {
  id: string;
  titulo: string;
  /** Nombre corto para la barra de íconos. */
  corto: string;
  descripcion: string;
  icono: LucideIcon;
  items: ItemMenu[];
}

/** Grupos del menú y los módulos que reúne cada uno, en orden. Perfil y sincronización van en el menú de la cuenta. */
const GRUPOS: { id: string; titulo: string; corto: string; descripcion: string; icono: LucideIcon; modulos: string[] }[] = [
  { id: "academico", titulo: "Académico", corto: "Académico", descripcion: "Notas, asistencia y tareas del día a día", icono: BookOpen, modulos: ["notas", "notas-director", "mis-notas", "asistencia", "marcar", "mi-asistencia", "tareas", "horario"] },
  { id: "comunicacion", titulo: "Comunicación", corto: "Comunicación", descripcion: "Mensajes, comunicados y fechas importantes", icono: MessagesSquare, modulos: ["mensajes", "comunicados", "calendario", "avisos"] },
  { id: "bienestar", titulo: "Bienestar", corto: "Bienestar", descripcion: "Tutoría y convivencia escolar", icono: HandHeart, modulos: ["tutoria", "convivencia"] },
  { id: "gestion", titulo: "Gestión", corto: "Gestión", descripcion: "Indicadores, monitoreo y reportes", icono: ChartColumn, modulos: ["paneles", "monitoreo", "siagie"] },
  { id: "configuracion", titulo: "Configuración", corto: "Ajustes", descripcion: "Estructura del colegio y matrícula", icono: Settings, modulos: ["configuracion"] },
];

const tiene = (roles: Rol[], ...r: Rol[]) => roles.some((x) => r.includes(x));

const CONFIGURACION: ItemMenu[] = [
  { id: "conf-resumen", titulo: "Resumen", ruta: "/configuracion", icono: LayoutDashboard, tono: "tono-pizarra", descripcion: "Pasos de la puesta en marcha" },
  { id: "conf-anio", titulo: "Año escolar", ruta: "/configuracion/anio", icono: CalendarRange, tono: "tono-cielo", descripcion: "Periodos y fechas" },
  { id: "conf-secciones", titulo: "Grados y secciones", ruta: "/configuracion/secciones", icono: LayoutGrid, tono: "tono-lila", descripcion: "Secciones y tutores" },
  { id: "conf-personal", titulo: "Personal", ruta: "/configuracion/personal", icono: Users, tono: "tono-ambar", descripcion: "Docentes y asignaciones" },
  {
    id: "conf-estudiantes", titulo: "Estudiantes", ruta: "/configuracion/estudiantes", icono: GraduationCap, tono: "tono-musgo", descripcion: "Matrícula y cuentas",
    hijos: [
      { id: "conf-est-lista", titulo: "Lista por sección", ruta: "/configuracion/estudiantes", icono: GraduationCap },
      { id: "conf-importar", titulo: "Importar desde Excel", ruta: "/configuracion/estudiantes/importar", icono: FileUp },
    ],
  },
  { id: "conf-areas", titulo: "Áreas propias", ruta: "/configuracion/areas", icono: Library, tono: "tono-rosa", descripcion: "Talleres del colegio" },
  { id: "conf-colegio", titulo: "Datos del colegio", ruta: "/configuracion/colegio", icono: School, tono: "tono-laguna", descripcion: "Nombre, insignia y opciones" },
  { id: "conf-cierre", titulo: "Cierre del año", ruta: "/configuracion/cierre", icono: Lock, tono: "tono-coral", descripcion: "Situación final y actas" },
];

function itemDe(m: Modulo, roles: Rol[]): ItemMenu {
  const item: ItemMenu = { id: m.id, titulo: m.titulo, ruta: m.ruta, icono: m.icono, descripcion: m.descripcion, tono: m.tono };
  if (m.id === "asistencia") {
    item.hijos = [
      { id: "asis-tomar", titulo: "Tomar asistencia", ruta: "/asistencia", icono: ClipboardCheck },
      { id: "asis-justificaciones", titulo: "Justificaciones", ruta: "/asistencia/justificaciones", icono: FileCheck },
    ];
    if (tiene(roles, "director", "subdirector", "auxiliar")) item.hijos.push({ id: "asis-carnes", titulo: "Carnés QR", ruta: "/asistencia/carnes", icono: IdCard });
  }
  if (m.id === "tutoria" && tiene(roles, "tutor")) {
    item.hijos = [
      { id: "tut-estudiantes", titulo: "Mis estudiantes", ruta: "/tutoria", icono: HandHeart },
      { id: "tut-pedidos", titulo: "Pedidos de ayuda", ruta: "/tutoria/pedidos", icono: Inbox },
    ];
  }
  return item;
}

/** Menú del rol: los módulos agrupados (los grupos vacíos no se muestran). */
export function menuPara(roles: Rol[]): GrupoMenu[] {
  const porId = new Map(modulosPara(roles).map((m) => [m.id, m]));
  return GRUPOS.map((g) => ({
    id: g.id,
    titulo: g.titulo,
    corto: g.corto,
    descripcion: g.descripcion,
    icono: g.icono,
    items: g.id === "configuracion"
      ? (porId.has("configuracion") ? CONFIGURACION : [])
      : g.modulos.flatMap((id) => (porId.has(id) ? [itemDe(porId.get(id)!, roles)] : [])),
  })).filter((g) => g.items.length > 0);
}

const todos = (items: ItemMenu[]): ItemMenu[] => items.flatMap((i) => [i, ...(i.hijos ? todos(i.hijos) : [])]);

/** La opción activa es la de ruta más larga que contiene a la ruta actual (la subopción gana a su padre). */
export function itemActivo(grupos: GrupoMenu[], ruta: string): { grupo: GrupoMenu; item: ItemMenu } | undefined {
  let mejor: { grupo: GrupoMenu; item: ItemMenu } | undefined;
  for (const g of grupos)
    for (const i of todos(g.items))
      if ((ruta === i.ruta || ruta.startsWith(`${i.ruta}/`)) && (!mejor || i.ruta.length > mejor.item.ruta.length || (i.ruta.length === mejor.item.ruta.length && !i.hijos)))
        mejor = { grupo: g, item: i };
  return mejor;
}

/** ¿La opción (o alguna de sus subopciones) es la activa? */
export const contiene = (i: ItemMenu, activo?: ItemMenu): boolean => !!activo && (i === activo || !!i.hijos?.some((h) => contiene(h, activo)));
