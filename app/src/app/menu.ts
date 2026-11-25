import type { LucideIcon } from "lucide-react";
import {
  BookOpen, CalendarRange, ChartColumn, FileCheck, FileUp, GraduationCap, HandHeart, IdCard, Inbox, LayoutGrid,
  LayoutDashboard, Library, Lock, MessagesSquare, School, Settings, User, Users,
} from "lucide-react";
import type { Rol } from "@/db/tipos";
import { modulosPara, type Modulo } from "./modulos";

export interface ItemMenu {
  id: string;
  titulo: string;
  ruta: string;
  icono: LucideIcon;
}

export interface GrupoMenu {
  id: string;
  titulo: string;
  icono: LucideIcon;
  tono: string;
  items: ItemMenu[];
}

/** Grupos del menú lateral y los módulos que reúne cada uno, en orden. */
const GRUPOS: { id: string; titulo: string; icono: LucideIcon; tono: string; modulos: string[] }[] = [
  { id: "academico", titulo: "Académico", icono: BookOpen, tono: "tono-cielo", modulos: ["notas", "notas-director", "mis-notas", "asistencia", "marcar", "mi-asistencia", "tareas", "horario"] },
  { id: "comunicacion", titulo: "Comunicación", icono: MessagesSquare, tono: "tono-laguna", modulos: ["mensajes", "comunicados", "calendario", "avisos"] },
  { id: "bienestar", titulo: "Bienestar", icono: HandHeart, tono: "tono-rosa", modulos: ["tutoria", "convivencia"] },
  { id: "gestion", titulo: "Gestión", icono: ChartColumn, tono: "tono-lila", modulos: ["paneles", "monitoreo", "siagie"] },
  { id: "configuracion", titulo: "Configuración", icono: Settings, tono: "tono-pizarra", modulos: ["configuracion"] },
  { id: "cuenta", titulo: "Mi cuenta", icono: User, tono: "tono-pizarra", modulos: ["perfil", "sincronizacion"] },
];

const tiene = (roles: Rol[], ...r: Rol[]) => roles.some((x) => r.includes(x));

/** Subpáginas que se muestran debajo de su módulo, según el rol. */
function subpaginas(m: Modulo, roles: Rol[]): ItemMenu[] {
  if (m.id === "configuracion") {
    return [
      { id: "conf-resumen", titulo: "Resumen", ruta: "/configuracion", icono: LayoutDashboard },
      { id: "conf-anio", titulo: "Año escolar", ruta: "/configuracion/anio", icono: CalendarRange },
      { id: "conf-secciones", titulo: "Grados y secciones", ruta: "/configuracion/secciones", icono: LayoutGrid },
      { id: "conf-personal", titulo: "Personal", ruta: "/configuracion/personal", icono: Users },
      { id: "conf-estudiantes", titulo: "Estudiantes", ruta: "/configuracion/estudiantes", icono: GraduationCap },
      { id: "conf-importar", titulo: "Importar estudiantes", ruta: "/configuracion/estudiantes/importar", icono: FileUp },
      { id: "conf-areas", titulo: "Áreas propias", ruta: "/configuracion/areas", icono: Library },
      { id: "conf-colegio", titulo: "Datos del colegio", ruta: "/configuracion/colegio", icono: School },
      { id: "conf-cierre", titulo: "Cierre del año", ruta: "/configuracion/cierre", icono: Lock },
    ];
  }
  const propio: ItemMenu = { id: m.id, titulo: m.titulo, ruta: m.ruta, icono: m.icono };
  if (m.id === "asistencia") {
    const extra: ItemMenu[] = [{ id: "asis-justificaciones", titulo: "Justificaciones", ruta: "/asistencia/justificaciones", icono: FileCheck }];
    if (tiene(roles, "director", "subdirector", "auxiliar")) extra.push({ id: "asis-carnes", titulo: "Carnés QR", ruta: "/asistencia/carnes", icono: IdCard });
    return [propio, ...extra];
  }
  if (m.id === "tutoria" && tiene(roles, "tutor")) {
    return [propio, { id: "tut-pedidos", titulo: "Pedidos de ayuda", ruta: "/tutoria/pedidos", icono: Inbox }];
  }
  return [propio];
}

/** Menú del rol: el inicio aparte y los demás módulos agrupados (los grupos vacíos no se muestran). */
export function menuPara(roles: Rol[]): { inicio: Modulo; grupos: GrupoMenu[] } {
  const modulos = modulosPara(roles);
  const porId = new Map(modulos.map((m) => [m.id, m]));
  const grupos = GRUPOS.map((g) => ({
    id: g.id,
    titulo: g.titulo,
    icono: g.icono,
    tono: g.tono,
    items: g.modulos.flatMap((id) => (porId.has(id) ? subpaginas(porId.get(id)!, roles) : [])),
  })).filter((g) => g.items.length > 0);
  return { inicio: modulos.find((m) => m.id === "inicio")!, grupos };
}

/** La opción activa es la de ruta más larga que contiene a la ruta actual. */
export function itemActivo(grupos: GrupoMenu[], ruta: string): ItemMenu | undefined {
  let mejor: ItemMenu | undefined;
  for (const g of grupos)
    for (const i of g.items)
      if ((ruta === i.ruta || ruta.startsWith(`${i.ruta}/`)) && (!mejor || i.ruta.length > mejor.ruta.length)) mejor = i;
  return mejor;
}
