// Exportaciones de la dirección: Excel para el SIAGIE y respaldo completo del colegio.
import { db } from "@/app/contexto";
import { vivas } from "@/db/repositorio";
import { TABLAS, type Estudiante } from "@/db/tipos";
import { armarHoja, type HojaSiagie } from "@/dominio/siagie";
import { anioActivo, seccionesDetalle } from "./consultas";

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Arma las hojas (sin escribir el archivo): sirve para revisar antes de descargar. */
export async function hojasSiagie(periodoId: string, seccionIds: string[]): Promise<HojaSiagie[]> {
  const anio = await anioActivo();
  if (!anio) throw new Error("No hay año escolar activo");
  const [secciones, periodo, colegio, areas, competencias, matriculas, calificaciones, asignaciones] = await Promise.all([
    seccionesDetalle(anio.id), db.tabla("periodo").get(periodoId), db.tabla("colegio").toArray().then((c) => c[0]),
    db.tabla("area").toArray(), db.tabla("competencia").toArray(), db.tabla("matricula").toArray(),
    db.tabla("calificacion").toArray(), db.tabla("docente_asignacion").toArray(),
  ]);
  const usados = new Set<string>();
  const hojas: HojaSiagie[] = [];
  for (const s of secciones.filter((x) => seccionIds.includes(x.id))) {
    const ids = matriculas.filter((m) => m.seccion_id === s.id && m.anio_id === anio.id && !m.eliminado && m.estado === "matriculado").map((m) => m.estudiante_id);
    const estudiantes = (await db.tabla("estudiante").bulkGet(ids)).filter((e): e is Estudiante => !!e && !e.eliminado);
    // Áreas: las que tienen docente asignado en la sección o ya tienen notas en el periodo.
    const conNotas = new Set(calificaciones.filter((c) => c.seccion_id === s.id && c.periodo_id === periodoId && c.nivel_logro).map((c) => competencias.find((k) => k.id === c.competencia_id)?.area_id));
    const conDocente = new Set(vivas(asignaciones).filter((a) => a.seccion_id === s.id).map((a) => a.area_id));
    const areasSeccion = areas.filter((a) => a.nivel === s.grado?.nivel && !a.eliminado && (conNotas.has(a.id) || conDocente.has(a.id))).sort((a, b) => a.orden - b.orden);
    for (const area of areasSeccion) {
      hojas.push(armarHoja({
        colegio: colegio?.nombre ?? "", codigoModular: colegio?.codigo_modular ?? "", nivel: s.grado?.nivel === "primaria" ? "Primaria" : "Secundaria",
        grado: s.grado?.nombre ?? "", seccion: s.letra, periodo: periodo?.nombre ?? "", area, competencias, estudiantes,
        calificaciones: calificaciones.filter((c) => c.seccion_id === s.id), periodoId, usados,
        etiqueta: `${s.grado?.numero ?? ""}${s.letra} ${s.grado?.nivel === "primaria" ? "P" : "S"}`,
      }));
    }
  }
  return hojas;
}

export async function descargarSiagie(hojas: HojaSiagie[], nombre: string) {
  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();
  for (const h of hojas) {
    const hoja = XLSX.utils.aoa_to_sheet(h.filas);
    hoja["!cols"] = [{ wch: 5 }, { wch: 11 }, { wch: 36 }, ...Array(Math.max(0, (h.filas[6]?.length ?? 3) - 3)).fill({ wch: 14 })];
    XLSX.utils.book_append_sheet(libro, hoja, h.nombre);
  }
  XLSX.writeFile(libro, nombre);
}

/**
 * Respaldo completo: un JSON con todas las tablas que este equipo tiene (para archivo y auditoría)
 * y un Excel legible con estudiantes, notas y asistencia.
 */
export async function descargarRespaldo() {
  const fecha = new Date().toISOString().slice(0, 10);
  const datos: Record<string, unknown[]> = {};
  for (const t of TABLAS) {
    // El secreto del QR no se respalda: no sirve fuera de su sesión y no debe circular.
    if (t === "asistencia_secreto") continue;
    datos[t] = await db.tabla(t).toArray();
  }
  const json = JSON.stringify({ formato: "colegio-conectado-respaldo", version: 1, generado: new Date().toISOString(), datos }, null, 1);
  descargar(new Blob([json], { type: "application/json" }), `respaldo_colegio_${fecha}.json`);

  const XLSX = await import("xlsx");
  const anio = await anioActivo();
  const secciones = anio ? await seccionesDetalle(anio.id) : [];
  const nombreSec = new Map(secciones.map((s) => [s.id, s.nombreLargo]));
  const ests = new Map(vivas(await db.tabla("estudiante").toArray()).map((e) => [e.id, e]));
  const nombreEst = (id: string) => { const e = ests.get(id); return e ? `${e.apellidos}, ${e.nombres}` : ""; };
  const mats = vivas(await db.tabla("matricula").toArray()).filter((m) => m.anio_id === anio?.id);
  const comps = new Map((await db.tabla("competencia").toArray()).map((c) => [c.id, c]));
  const areas = new Map((await db.tabla("area").toArray()).map((a) => [a.id, a.nombre]));
  const periodos = new Map((await db.tabla("periodo").toArray()).map((p) => [p.id, p.nombre]));
  const sesiones = new Map((await db.tabla("asistencia_sesion").toArray()).map((s) => [s.id, s]));

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(mats.map((m) => {
    const e = ests.get(m.estudiante_id);
    return { Sección: nombreSec.get(m.seccion_id) ?? "", Apellidos: e?.apellidos ?? "", Nombres: e?.nombres ?? "", DNI: e?.dni ?? "", Carné: e?.codigo_carne ?? "", Estado: m.estado };
  })), "Estudiantes");
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(vivas(await db.tabla("calificacion").toArray()).filter((c) => c.nivel_logro).map((c) => {
    const k = comps.get(c.competencia_id);
    return { Periodo: periodos.get(c.periodo_id) ?? "", Sección: nombreSec.get(c.seccion_id) ?? "", Estudiante: nombreEst(c.estudiante_id),
      Área: k ? areas.get(k.area_id) ?? "" : "", Competencia: k?.nombre ?? "", Nivel: c.nivel_logro, Conclusión: c.conclusion ?? "" };
  })), "Notas");
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(vivas(await db.tabla("asistencia").toArray()).map((a) => {
    const s = sesiones.get(a.sesion_id);
    return { Fecha: s?.fecha ?? "", Sección: s ? nombreSec.get(s.seccion_id) ?? "" : "", Estudiante: nombreEst(a.estudiante_id), Estado: a.estado, Origen: a.origen };
  })), "Asistencia");
  XLSX.writeFile(libro, `respaldo_colegio_${fecha}.xlsx`);
}
