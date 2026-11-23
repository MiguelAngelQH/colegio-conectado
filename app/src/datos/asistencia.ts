import { db } from "@/app/contexto";
import { nuevoId } from "@/db/local";
import { guardar, guardarLote, vivas, type Escritura } from "@/db/repositorio";
import type { Asistencia, AsistenciaSesion, EstadoAsistencia } from "@/db/tipos";
import { idDeterministico } from "@/dominio/notas";
import { idEquipo, nuevoSecreto } from "@/dominio/qr";
import { nombreSeccion } from "./consultas";
import { ahoraServidor } from "@/sync/reloj";

export const NOMBRE_ESTADO: Record<EstadoAsistencia, string> = { P: "Presente", T: "Tardanza", F: "Falta", J: "Justificada" };

/** Fecha local (Perú) en formato aaaa-mm-dd. */
export function hoyLocal(): string {
  const d = new Date(ahoraServidor());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Una marca por estudiante y sesión: el id es el mismo en cualquier equipo. */
export const idAsistencia = (sesionId: string, estudianteId: string) => idDeterministico("asistencia", sesionId, estudianteId);

/**
 * Abre la sesión de asistencia de hoy (o reutiliza la que ya existe para la misma sección y área).
 * Siempre crea el secreto del QR: así se puede cambiar de modo en cualquier momento.
 */
export async function abrirSesion(p: { seccionId: string; areaId: string | null; docenteId: string; colegioId: string | null }): Promise<string> {
  const fecha = hoyLocal();
  const existentes = vivas(await db.tabla("asistencia_sesion").where("[seccion_id+fecha]").equals([p.seccionId, fecha]).toArray());
  const misma = existentes.find((s) => s.area_id === p.areaId && s.docente_id === p.docenteId);
  if (misma) return misma.id;

  const id = nuevoId();
  const escrituras: Escritura[] = [
    { tabla: "asistencia_sesion", datos: { id, seccion_id: p.seccionId, area_id: p.areaId, docente_id: p.docenteId, fecha, modo: "manual", abierta_en: ahoraServidor(), estado: "abierta" } satisfies Partial<AsistenciaSesion> },
    { tabla: "asistencia_secreto", datos: { id, sesion_id: id, docente_id: p.docenteId, secreto: nuevoSecreto() } },
  ];
  await guardarLote(db, escrituras, p.colegioId);
  return id;
}

/** Marca (o corrige) la asistencia de un estudiante desde el equipo del docente o auxiliar. */
export async function marcar(sesionId: string, estudianteId: string, estado: EstadoAsistencia, origen: Asistencia["origen"], colegioId: string | null) {
  const existente = await db.tabla("asistencia").where("[sesion_id+estudiante_id]").equals([sesionId, estudianteId]).first();
  const id = existente?.id ?? (await idAsistencia(sesionId, estudianteId));
  return guardar(db, "asistencia", existente
    ? { id, estado, por_revisar: false, ...(existente.origen === "qr" && origen === "manual" ? {} : { origen }) }
    : { id, sesion_id: sesionId, estudiante_id: estudianteId, estado, origen, marcado_en: new Date(ahoraServidor()).toISOString(), token_qr: null, por_revisar: false },
  colegioId);
}

/** Confirma la lista: quienes no tienen marca quedan con falta. */
export async function confirmarSesion(sesionId: string, sinMarca: string[], colegioId: string | null) {
  const marcado = new Date(ahoraServidor()).toISOString();
  const escrituras: Escritura[] = await Promise.all(sinMarca.map(async (estudianteId) => ({
    tabla: "asistencia" as const,
    datos: { id: await idAsistencia(sesionId, estudianteId), sesion_id: sesionId, estudiante_id: estudianteId, estado: "F" as const, origen: "manual" as const, marcado_en: marcado, token_qr: null, por_revisar: false },
  })));
  escrituras.push({ tabla: "asistencia_sesion", datos: { id: sesionId, estado: "confirmada" } });
  await guardarLote(db, escrituras, colegioId);
}

/**
 * Marca del estudiante con el QR del docente. Funciona sin conexión: queda guardada y el
 * servidor la valida al sincronizar (firma, hora, matrícula y equipo).
 */
export async function marcarConQr(p: { token: string; sesionId: string; estudianteId: string; colegioId: string | null }): Promise<"nueva" | "repetida"> {
  const id = await idAsistencia(p.sesionId, p.estudianteId);
  if (await db.tabla("asistencia").get(id)) return "repetida";
  await guardar(db, "asistencia", {
    id, sesion_id: p.sesionId, estudiante_id: p.estudianteId, estado: "P", origen: "qr",
    marcado_en: new Date(ahoraServidor()).toISOString(), token_qr: p.token, por_revisar: false, dispositivo_id: idEquipo(),
  }, p.colegioId);
  return "nueva";
}

export interface DetalleSesion { fecha: string; clase: string; seccion: string | null; docente: string | null }

/** Para mostrar cada marca con su clase, sección y docente (lo que el estudiante tenga sincronizado). */
export async function detallesDeSesiones(ids: string[]): Promise<Map<string, DetalleSesion>> {
  const sesiones = (await db.tabla("asistencia_sesion").bulkGet([...new Set(ids)])).filter((s): s is AsistenciaSesion => !!s);
  const areas = new Map((await db.tabla("area").toArray()).map((a) => [a.id, a.nombre]));
  const secciones = new Map((await db.tabla("seccion").bulkGet([...new Set(sesiones.map((s) => s.seccion_id))])).filter((x) => !!x).map((x) => [x!.id, x!]));
  const grados = new Map((await db.tabla("grado").toArray()).map((g) => [g.id, g]));
  const docentes = new Map((await db.tabla("usuario").bulkGet([...new Set(sesiones.map((s) => s.docente_id))])).filter((u) => !!u).map((u) => [u!.id, u!]));
  return new Map(sesiones.map((s) => {
    const sec = secciones.get(s.seccion_id);
    const doc = docentes.get(s.docente_id);
    return [s.id, {
      fecha: s.fecha,
      clase: s.area_id ? areas.get(s.area_id) ?? "Clase" : "Asistencia del día",
      seccion: sec ? nombreSeccion(grados.get(sec.grado_id), sec) : null,
      docente: doc ? `${doc.nombres.split(" ")[0]} ${doc.apellidos.split(" ")[0]}` : null,
    }];
  }));
}
