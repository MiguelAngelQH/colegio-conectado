import { useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/app/contexto";
import { vivas } from "@/db/repositorio";
import type { Estudiante, Usuario } from "@/db/tipos";
import { calcularAvisos, type Aviso } from "@/dominio/avisos";
import { puedeVer } from "@/dominio/solicitudes";

/** Estudiantes que el usuario ve como "suyos": él mismo (estudiante) o sus hijos (apoderado). */
export async function hijosDe(usuario: Usuario): Promise<Estudiante[]> {
  const propios = vivas(await db.tabla("estudiante").where("usuario_id").equals(usuario.id).toArray());
  const apoderados = vivas(await db.tabla("apoderado").where("usuario_id").equals(usuario.id).toArray());
  const vinculos = vivas((await Promise.all(apoderados.map((a) => db.tabla("estudiante_apoderado").where("apoderado_id").equals(a.id).toArray()))).flat());
  const hijos = vivas((await db.tabla("estudiante").bulkGet(vinculos.map((v) => v.estudiante_id))).filter((e): e is Estudiante => !!e));
  const todos = [...propios, ...hijos];
  return todos.filter((e, i) => todos.findIndex((x) => x.id === e.id) === i).sort((a, b) => a.nombres.localeCompare(b.nombres));
}

// ------------------------------------------------------------------ hijo elegido (apoderados con varios hijos)

const CLAVE = "cc.hijo";
const oyentes = new Set<() => void>();
let elegido: string | null = (() => {
  try { return localStorage.getItem(CLAVE); } catch { return null; }
})();

export function elegirHijo(id: string) {
  elegido = id;
  try { localStorage.setItem(CLAVE, id); } catch { /* sin almacenamiento */ }
  oyentes.forEach((o) => o());
}

/** Hijos del usuario y el que está elegido (el primero si no hay elección válida). */
export function useHijos(usuario: Usuario | null) {
  const actual = useSyncExternalStore((o) => { oyentes.add(o); return () => oyentes.delete(o); }, () => elegido);
  const hijos = useLiveQuery(async () => (usuario ? hijosDe(usuario) : []), [usuario?.id]);
  const hijo = hijos?.find((h) => h.id === actual) ?? hijos?.[0];
  return { hijos, hijo };
}

// ------------------------------------------------------------------ avisos

const claveVistos = (usuarioId: string) => `avisos_vistos_${usuarioId}`;

export async function marcarAvisosVistos(usuarioId: string) {
  await db.guardarMeta(claveVistos(usuarioId), new Date().toISOString());
}

/** Avisos del usuario (familia o personal), recalculados cada vez que cambian los datos locales. */
export function useAvisos(usuario: Usuario | null): { avisos: Aviso[]; nuevos: number } | undefined {
  return useLiveQuery(async () => {
    if (!usuario) return { avisos: [], nuevos: 0 };
    const esFamilia = usuario.roles.some((r) => r === "estudiante" || r === "apoderado");
    const esPersonal = usuario.roles.some((r) => ["director", "subdirector", "docente", "tutor", "auxiliar"].includes(r));
    const hijos = esFamilia ? await hijosDe(usuario) : [];
    const ids = new Set(hijos.map((h) => h.id));
    const nombres = new Map(hijos.map((h) => [h.id, h.nombres]));

    const [asistencias, califs, observaciones, justificaciones, comunicados, lecturas] = await Promise.all([
      esFamilia ? db.tabla("asistencia").where("estudiante_id").anyOf([...ids]).toArray() : [],
      esFamilia ? db.tabla("calificacion").where("estudiante_id").anyOf([...ids]).toArray() : [],
      esFamilia ? db.tabla("observacion").where("estudiante_id").anyOf([...ids]).toArray() : [],
      db.tabla("justificacion").toArray(),
      db.tabla("comunicado").toArray(),
      db.tabla("comunicado_lectura").where("usuario_id").equals(usuario.id).toArray(),
    ]);
    const sesiones = new Map((await db.tabla("asistencia_sesion").bulkGet([...new Set(asistencias.map((a) => a.sesion_id))])).filter(Boolean).map((s) => [s!.id, s!]));
    const areas = new Map((await db.tabla("area").toArray()).map((a) => [a.id, a]));
    const comps = new Map((await db.tabla("competencia").toArray()).map((c) => [c.id, c]));
    const solicitudes = (await db.tabla("solicitud_tutoria").toArray()).filter((x) => puedeVer(x, usuario));
    let nombresPersonal = new Map<string, string>();
    if (esPersonal) {
      const ests = await db.tabla("estudiante").bulkGet([...new Set([...justificaciones, ...solicitudes].map((j) => j.estudiante_id))]);
      nombresPersonal = new Map(ests.filter(Boolean).map((e) => [e!.id, `${e!.nombres} ${e!.apellidos.split(" ")[0]}`]));
    }

    const avisos = calcularAvisos({
      usuarioId: usuario.id, esFamilia, esPersonal,
      vistosHasta: await db.leerMeta<string | null>(claveVistos(usuario.id), null),
      nombreEstudiante: (id) => nombres.get(id) ?? nombresPersonal.get(id) ?? "Estudiante",
      faltas: asistencias.map((a) => {
        const s = sesiones.get(a.sesion_id);
        return { a, fecha: s?.fecha ?? (a.marcado_en ?? "").slice(0, 10), clase: s?.area_id ? areas.get(s.area_id)?.nombre ?? null : null };
      }),
      notas: califs.map((c) => {
        const k = comps.get(c.competencia_id);
        return { c, competencia: k?.nombre ?? "", area: k ? areas.get(k.area_id)?.nombre ?? "" : "" };
      }),
      comunicados: vivas(comunicados),
      leidos: new Set(lecturas.map((l) => l.comunicado_id)),
      observaciones,
      justificaciones: esFamilia ? justificaciones.filter((j) => ids.has(j.estudiante_id)) : justificaciones,
      monitoreo: await db.tabla("observacion_monitoreo").toArray(),
      esDireccion: usuario.roles.some((r) => r === "director" || r === "subdirector"),
      esUgel: usuario.roles.includes("ugel"),
      solicitudes,
      tareas: esFamilia ? await tareasDeFamilia(hijos.map((h) => h.id), areas) : [],
    });
    return { avisos, nuevos: avisos.filter((a) => a.nuevo).length };
  }, [usuario?.id]);
}

/** Tareas de las secciones donde están matriculados los hijos (o el propio estudiante). */
async function tareasDeFamilia(estudianteIds: string[], areas: Map<string, { nombre: string }>) {
  const mats = vivas(await db.tabla("matricula").where("estudiante_id").anyOf(estudianteIds).toArray()).filter((m) => m.estado === "matriculado");
  const secciones = [...new Set(mats.map((m) => m.seccion_id))];
  const tareas = vivas(await db.tabla("tarea").where("seccion_id").anyOf(secciones).toArray());
  return tareas.map((t) => ({ t, area: areas.get(t.area_id)?.nombre ?? "Clase" }));
}
