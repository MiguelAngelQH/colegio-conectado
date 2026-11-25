import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/app/contexto";
import { vivas } from "@/db/repositorio";
import type { Usuario } from "@/db/tipos";
import { sugerenciasDelDia, type EntradaAsistente, type Sugerencia } from "@/dominio/asistente";
import { calcularAvance } from "@/dominio/notas";
import { periodoVigente } from "@/dominio/periodos";
import { anioActivo, matriculaActual, seccionesDetalle } from "./consultas";
import { hijosDe } from "./familia";

const fechaISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const tiene = (u: Usuario, ...roles: string[]) => u.roles.some((r) => roles.includes(r));

/** Reúne lo necesario del equipo (sin conexión) y arma las sugerencias del día para el usuario. */
export async function sugerenciasPara(usuario: Usuario, ahora = new Date()): Promise<Sugerencia[]> {
  const anio = await anioActivo();
  if (!anio) return [];
  const hoy = fechaISO(ahora);
  const haceDosSemanas = fechaISO(new Date(ahora.getTime() - 14 * 86400000));
  const esDocente = tiene(usuario, "docente", "tutor");
  const esDirectivo = tiene(usuario, "director", "subdirector");
  const esPersonal = esDocente || esDirectivo || tiene(usuario, "auxiliar");
  const esFamilia = !esPersonal && tiene(usuario, "estudiante", "apoderado");

  const [secciones, areas, periodos, usuarios] = await Promise.all([
    seccionesDetalle(anio.id),
    db.tabla("area").toArray(),
    db.tabla("periodo").where("anio_id").equals(anio.id).toArray(),
    db.tabla("usuario").toArray(),
  ]);
  const seccion = new Map(secciones.map((s) => [s.id, s]));
  const area = new Map(areas.map((a) => [a.id, a]));
  const persona = new Map(usuarios.map((u) => [u.id, u]));
  const p = periodoVigente(vivas(periodos), hoy);

  const entrada: EntradaAsistente = {
    ahora, clases: [], dicta: esDocente, sesionesHoy: [], periodo: p ? { nombre: p.nombre, fin: p.fin } : undefined,
    notasFaltantes: [], entregasPorRevisar: 0, justificacionesPendientes: 0, mensajesSinLeer: { cantidad: 0, de: null },
    faltasRecientes: [], tareas: [], eventos: [], avanceBajo: [],
  };

  const hijos = esFamilia ? await hijosDe(usuario) : [];
  const seccionesFamilia = new Map<string, string>(); // estudiante -> sección
  for (const h of hijos) {
    const m = await matriculaActual(h.id);
    if (m) seccionesFamilia.set(h.id, m.seccion_id);
  }

  // Horario: el del docente o, si hay un solo hijo, el de su sección.
  const horario = vivas(await db.tabla("horario_clase").toArray()).filter((c) =>
    esDocente ? c.docente_id === usuario.id : esFamilia && seccionesFamilia.size === 1 && c.seccion_id === [...seccionesFamilia.values()][0]);
  entrada.clases = horario.filter((c) => seccion.has(c.seccion_id)).map((c) => ({
    seccionId: c.seccion_id, areaId: c.area_id, dia: c.dia, inicio: c.inicio, fin: c.fin,
    area: (c.area_id && area.get(c.area_id)?.nombre) || c.detalle || "Clase",
    seccion: seccion.get(c.seccion_id)!.nombre,
  }));

  if (esDocente) {
    entrada.sesionesHoy = vivas(await db.tabla("asistencia_sesion").where("fecha").equals(hoy).toArray())
      .filter((s) => s.docente_id === usuario.id).map((s) => ({ seccionId: s.seccion_id, areaId: s.area_id }));
    const tareas = vivas(await db.tabla("tarea").where("docente_id").equals(usuario.id).toArray());
    entrada.entregasPorRevisar = vivas(await db.tabla("tarea_entrega").where("tarea_id").anyOf(tareas.map((t) => t.id)).toArray())
      .filter((x) => x.estado === "entregada").length;
  }

  // Avance de notas del periodo vigente (propio del docente, o de todos para la dirección).
  if (p && (esDocente || esDirectivo)) {
    const [asignaciones, matriculas, competencias, calificaciones] = await Promise.all([
      db.tabla("docente_asignacion").toArray(),
      db.tabla("matricula").toArray(),
      db.tabla("competencia").toArray(),
      db.tabla("calificacion").filter((c) => c.periodo_id === p.id).toArray(),
    ]);
    const delAnio = vivas(asignaciones).filter((a) => seccion.has(a.seccion_id));
    const avance = calcularAvance({ periodoId: p.id, asignaciones: delAnio, matriculas: vivas(matriculas), competencias: vivas(competencias), calificaciones });
    if (esDocente) {
      entrada.notasFaltantes = avance.filter((a) => a.asignacion.docente_id === usuario.id).map((a) => ({
        curso: `${area.get(a.asignacion.area_id)?.nombre ?? "Área"} ${seccion.get(a.asignacion.seccion_id)?.nombre ?? ""}`.trim(),
        faltan: a.esperadas - a.registradas,
      }));
    }
    if (esDirectivo) {
      const porDocente = new Map<string, { esperadas: number; registradas: number }>();
      for (const a of avance) {
        const t = porDocente.get(a.asignacion.docente_id) ?? { esperadas: 0, registradas: 0 };
        t.esperadas += a.esperadas;
        t.registradas += a.registradas;
        porDocente.set(a.asignacion.docente_id, t);
      }
      entrada.avanceBajo = [...porDocente].filter(([, t]) => t.esperadas > 0 && t.registradas / t.esperadas < 0.5).map(([id, t]) => {
        const u = persona.get(id);
        return { docente: u ? `${u.nombres.split(" ")[0]} ${u.apellidos.split(" ")[0]}` : "Un docente", porcentaje: Math.round((t.registradas / t.esperadas) * 100) };
      });
    }
  }

  if (esPersonal) {
    entrada.justificacionesPendientes = vivas(await db.tabla("justificacion").where("estado").equals("pendiente").toArray()).length;
  }

  // Mensajes sin leer dirigidos al usuario.
  const hijosIds = new Set(hijos.map((h) => h.id));
  const sinLeer = vivas(await db.tabla("mensaje").toArray()).filter((m) =>
    !m.leido_en && m.autor_id !== usuario.id && (m.personal_id === usuario.id || (tiene(usuario, "apoderado") && hijosIds.has(m.estudiante_id))));
  if (sinLeer.length) {
    const ultimo = [...sinLeer].sort((a, b) => b.enviado_en.localeCompare(a.enviado_en))[0];
    entrada.mensajesSinLeer = { cantidad: sinLeer.length, de: persona.get(ultimo.autor_id)?.nombres.split(" ")[0] ?? null };
  }

  // Faltas de las dos últimas semanas: estudiantes de la tutoría, o los hijos.
  const vigilados = esFamilia
    ? hijos.map((h) => ({ id: h.id, nombre: h.nombres.split(" ")[0], ruta: "/mi-asistencia" }))
    : tiene(usuario, "tutor")
      ? await (async () => {
          const mias = secciones.filter((s) => s.tutor_id === usuario.id).map((s) => s.id);
          const mats = vivas(await db.tabla("matricula").where("seccion_id").anyOf(mias).toArray()).filter((m) => m.estado === "matriculado");
          const ests = vivas((await db.tabla("estudiante").bulkGet(mats.map((m) => m.estudiante_id))).filter((e): e is NonNullable<typeof e> => !!e));
          return ests.map((e) => ({ id: e.id, nombre: `${e.nombres.split(" ")[0]} ${e.apellidos.split(" ")[0]}`, ruta: `/tutoria/estudiante/${e.id}` }));
        })()
      : [];
  if (vigilados.length) {
    const marcas = vivas(await db.tabla("asistencia").where("estudiante_id").anyOf(vigilados.map((v) => v.id)).toArray()).filter((m) => m.estado === "F");
    const sesiones = new Map(vivas((await db.tabla("asistencia_sesion").bulkGet([...new Set(marcas.map((m) => m.sesion_id))])).filter((s): s is NonNullable<typeof s> => !!s)).map((s) => [s.id, s]));
    for (const v of vigilados) {
      // Se cuentan días con falta (un día con varias clases cuenta una vez).
      const dias = new Set(marcas.filter((m) => m.estudiante_id === v.id).map((m) => sesiones.get(m.sesion_id)?.fecha).filter((f): f is string => !!f && f >= haceDosSemanas && f <= hoy));
      if (dias.size) entrada.faltasRecientes.push({ estudianteId: v.id, nombre: v.nombre, faltas: dias.size, ruta: v.ruta });
    }
  }

  // Tareas de la familia todavía sin entregar, o devueltas para corregir.
  if (esFamilia && seccionesFamilia.size) {
    const tareas = vivas(await db.tabla("tarea").where("seccion_id").anyOf([...new Set(seccionesFamilia.values())]).toArray())
      .filter((t) => t.entrega >= fechaISO(new Date(ahora.getTime() - 7 * 86400000)));
    const entregas = vivas(await db.tabla("tarea_entrega").where("tarea_id").anyOf(tareas.map((t) => t.id)).toArray());
    for (const t of tareas)
      for (const h of hijos.filter((x) => seccionesFamilia.get(x.id) === t.seccion_id)) {
        const e = entregas.find((x) => x.tarea_id === t.id && x.estudiante_id === h.id);
        if (e && e.estado !== "devuelta") continue;
        entrada.tareas.push({
          id: `${t.id}-${h.id}`, titulo: t.titulo, area: area.get(t.area_id)?.nombre ?? "Tarea", entrega: t.entrega,
          estado: e ? "devuelta" : "pendiente", quien: tiene(usuario, "apoderado") ? h.nombres.split(" ")[0] : null,
        });
      }
  }

  // Eventos de hoy y mañana que el usuario puede ver.
  const manana = fechaISO(new Date(ahora.getTime() + 86400000));
  const misSecciones = new Set([...seccionesFamilia.values(), ...horario.map((c) => c.seccion_id)]);
  entrada.eventos = vivas(await db.tabla("evento").where("fecha").between(hoy, manana, true, true).toArray())
    .filter((ev) => !ev.seccion_id || esDirectivo || misSecciones.has(ev.seccion_id))
    .map((ev) => ({ titulo: ev.titulo, fecha: ev.fecha }));

  return sugerenciasDelDia(entrada);
}

/** Sugerencias del día; se recalculan con cada cambio de datos y cada minuto (la clase "de ahora" cambia con la hora). */
export function useSugerencias(usuario: Usuario | null): Sugerencia[] | undefined {
  const [minuto, setMinuto] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    const t = setInterval(() => setMinuto(Math.floor(Date.now() / 60000)), 30_000);
    return () => clearInterval(t);
  }, []);
  return useLiveQuery(async () => (usuario ? sugerenciasPara(usuario) : []), [usuario?.id, minuto]);
}
