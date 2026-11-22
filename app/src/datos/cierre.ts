// Datos del cierre del año: situación final propuesta por estudiante, resumen de asistencia y acta de
// evaluación en PDF. Todo se calcula en el equipo con lo sincronizado (funciona sin internet).
import { db } from "@/app/contexto";
import { vivas } from "@/db/repositorio";
import type { Area, Calificacion, Competencia, Estudiante, Matricula, NivelLogro, Periodo, ResumenAsistencia, SituacionFinal } from "@/db/tipos";
import { notasFinales, NOMBRE_SITUACION, situacionPropuesta, type Propuesta, type Reglas } from "@/dominio/promocion";
import { anioActivo, nombreCompleto, seccionesDetalle, type SeccionDetalle } from "./consultas";

export interface FilaCierre {
  matricula: Matricula;
  estudiante: Estudiante;
  propuesta: Propuesta;
  /** Competencias del nivel sin ninguna nota en el año (la propuesta puede no ser fiable). */
  faltantes: number;
  porArea: Record<string, NivelLogro[]>;
}

export interface DatosCierre {
  anio: NonNullable<Awaited<ReturnType<typeof anioActivo>>>;
  secciones: SeccionDetalle[];
  periodos: Periodo[];
  areas: Area[];
  competencias: Competencia[];
  calificaciones: Calificacion[];
  porSeccion: Map<string, FilaCierre[]>;
}

/** Áreas que se evaluaron en la sección: con docente asignado o con alguna nota. */
function areasEvaluadas(seccionId: string, asignaciones: { seccion_id: string; area_id: string; eliminado?: boolean }[], calificaciones: Calificacion[], competencias: Competencia[]) {
  const areaDe = new Map(competencias.map((c) => [c.id, c.area_id]));
  return new Set([
    ...asignaciones.filter((a) => !a.eliminado && a.seccion_id === seccionId).map((a) => a.area_id),
    ...calificaciones.filter((c) => c.seccion_id === seccionId && c.nivel_logro).map((c) => areaDe.get(c.competencia_id)!).filter(Boolean),
  ]);
}

export async function cargarCierre(reglas?: Reglas): Promise<DatosCierre | null> {
  const anio = await anioActivo();
  if (!anio) return null;
  const [secciones, periodos, areas, competencias, calificaciones, matriculas, asignaciones] = await Promise.all([
    seccionesDetalle(anio.id),
    db.tabla("periodo").where("anio_id").equals(anio.id).toArray(),
    db.tabla("area").toArray(),
    db.tabla("competencia").toArray(),
    db.tabla("calificacion").toArray(),
    db.tabla("matricula").toArray(),
    db.tabla("docente_asignacion").toArray(),
  ]);
  const pers = vivas(periodos);
  const idsPeriodo = new Set(pers.map((p) => p.id));
  const califs = vivas(calificaciones).filter((c) => idsPeriodo.has(c.periodo_id));
  const porSeccion = new Map<string, FilaCierre[]>();
  for (const s of secciones) {
    const mats = vivas(matriculas).filter((m) => m.seccion_id === s.id && m.anio_id === anio.id && m.estado === "matriculado");
    const ests = (await db.tabla("estudiante").bulkGet(mats.map((m) => m.estudiante_id)));
    const evaluadas = areasEvaluadas(s.id, asignaciones, califs, competencias);
    const filas: FilaCierre[] = [];
    mats.forEach((m, i) => {
      const e = ests[i];
      if (!e || e.eliminado || !s.grado) return;
      const { porArea, faltantes } = notasFinales({
        estudianteId: e.id, calificaciones: califs, competencias: vivas(competencias), areas: vivas(areas), periodos: pers, nivel: s.grado.nivel, areasEvaluadas: evaluadas,
      });
      filas.push({ matricula: m, estudiante: e, porArea, faltantes, propuesta: situacionPropuesta({ nivel: s.grado.nivel, grado: s.grado.numero, notas: porArea, reglas }) });
    });
    porSeccion.set(s.id, filas.sort((a, b) => a.estudiante.apellidos.localeCompare(b.estudiante.apellidos) || a.estudiante.nombres.localeCompare(b.estudiante.nombres)));
  }
  return { anio, secciones, periodos: pers.sort((a, b) => a.numero - b.numero), areas: vivas(areas), competencias: vivas(competencias), calificaciones: califs, porSeccion };
}

/** Resumen de asistencia de cada matrícula de la sección, para guardarlo al cerrar el año. */
export async function resumenAsistencia(seccionId: string): Promise<Map<string, ResumenAsistencia>> {
  const sesiones = vivas(await db.tabla("asistencia_sesion").where("seccion_id").equals(seccionId).toArray());
  const ids = new Set(sesiones.map((s) => s.id));
  const marcas = vivas(await db.tabla("asistencia").toArray()).filter((a) => ids.has(a.sesion_id));
  const res = new Map<string, ResumenAsistencia>();
  for (const a of marcas) {
    const r = res.get(a.estudiante_id) ?? { P: 0, T: 0, F: 0, J: 0, porcentaje: null };
    r[a.estado]++;
    res.set(a.estudiante_id, r);
  }
  for (const r of res.values()) {
    const base = r.P + r.T + r.F;
    r.porcentaje = base ? Math.round(((r.P + r.T) / base) * 100) : null;
  }
  return res;
}

// ------------------------------------------------------------------ acta de evaluación (PDF)

const TEAL: [number, number, number] = [11, 110, 106];
const COLOR: Record<string, [number, number, number]> = { AD: [29, 79, 145], A: [91, 155, 213], B: [240, 149, 106], C: [184, 50, 42] };
const TEXTO: Record<string, [number, number, number]> = { AD: [255, 255, 255], A: [11, 46, 51], B: [11, 46, 51], C: [255, 255, 255] };

/** Acta de evaluación de una o varias secciones: nivel final por competencia y situación final. */
export async function descargarActas(d: DatosCierre, seccionIds: string[], nombreArchivo: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const colegio = (await db.tabla("colegio").toArray())[0];
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const ancho = doc.internal.pageSize.getWidth();

  seccionIds.forEach((sid, idx) => {
    const s = d.secciones.find((x) => x.id === sid);
    if (!s?.grado) return;
    if (idx > 0) doc.addPage();
    const filas = d.porSeccion.get(sid) ?? [];
    const areasConNotas = d.areas
      .filter((a) => a.nivel === s.grado!.nivel && a.codigo !== "TRV" && filas.some((f) => f.porArea[a.id]))
      .sort((a, b) => a.orden - b.orden);
    const comps = areasConNotas.map((a) => ({ area: a, comps: d.competencias.filter((c) => c.area_id === a.id).sort((x, y) => x.orden - y.orden) }));

    doc.setFillColor(...TEAL);
    doc.rect(0, 0, ancho, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`ACTA DE EVALUACIÓN ${d.anio.anio}`, 12, 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`${colegio?.nombre ?? ""} · Código modular ${colegio?.codigo_modular ?? "-"} · ${colegio?.ugel ?? ""} · ${s.nombreLargo} · Tutor(a): ${s.tutor ? `${s.tutor.nombres} ${s.tutor.apellidos}` : "-"}`, 12, 15);

    const cab1 = [
      { content: "N°", rowSpan: 2 }, { content: "Apellidos y nombres", rowSpan: 2 },
      ...comps.map((x) => ({ content: x.area.codigo, colSpan: x.comps.length, styles: { halign: "center" as const } })),
      { content: "Situación final", rowSpan: 2 },
    ];
    const cab2 = comps.flatMap((x) => x.comps.map((_, i) => `C${i + 1}`));
    const cuerpo = filas.map((f, i) => {
      const finalDe = (compId: string) => {
        const notas = d.calificaciones.filter((c) => c.estudiante_id === f.estudiante.id && c.competencia_id === compId && c.nivel_logro);
        const numero = new Map(d.periodos.map((p) => [p.id, p.numero]));
        return notas.sort((a, b) => (numero.get(b.periodo_id) ?? 0) - (numero.get(a.periodo_id) ?? 0))[0]?.nivel_logro ?? "";
      };
      const sit = (f.matricula.situacion_final ?? f.propuesta.situacion) as SituacionFinal;
      return [String(i + 1), nombreCompleto(f.estudiante).toUpperCase(), ...comps.flatMap((x) => x.comps.map((c) => finalDe(c.id))),
        `${sit}${f.matricula.situacion_final ? "" : " (propuesta)"}`];
    });

    autoTable(doc, {
      startY: 25, head: [cab1, cab2] as never, body: cuerpo, theme: "grid",
      styles: { fontSize: 6.5, cellPadding: 0.9, halign: "center", lineColor: [200, 214, 216], lineWidth: 0.15, textColor: [11, 46, 51] },
      headStyles: { fillColor: TEAL, textColor: 255, fontStyle: "bold", fontSize: 6.5 },
      columnStyles: { 0: { cellWidth: 7 }, 1: { cellWidth: 58, halign: "left" }, [cab2.length + 2]: { cellWidth: 26, fontStyle: "bold" } },
      didParseCell: (c) => {
        const v = String(c.cell.raw ?? "");
        if (c.section === "body" && COLOR[v]) {
          c.cell.styles.fillColor = COLOR[v];
          c.cell.styles.textColor = TEXTO[v];
          c.cell.styles.fontStyle = "bold";
        }
      },
    });

    let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
    doc.setFontSize(7);
    doc.setTextColor(63, 95, 99);
    const leyenda = comps.map((x) => `${x.area.codigo}: ${x.area.nombre}`).join(" · ");
    doc.text(doc.splitTextToSize(`${leyenda}. C1, C2...: competencias del área en el orden del CNEB. Nivel final: el del último periodo evaluado. ${Object.entries(NOMBRE_SITUACION).map(([k, v]) => `${k}: ${v}`).join(" · ")}.`, ancho - 24), 12, y);
    y += 16;
    if (y > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = 30;
    }
    doc.setDrawColor(120, 140, 145);
    doc.setTextColor(11, 46, 51);
    [[ancho * 0.3, "Tutor(a)"], [ancho * 0.7, "Director(a)"]].forEach(([x, cargo]) => {
      doc.line((x as number) - 35, y, (x as number) + 35, y);
      doc.text(String(cargo), x as number, y + 4, { align: "center" });
    });
  });

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setTextColor(120, 140, 145);
    doc.text(`Generado con Colegio Conectado el ${new Date().toLocaleString("es-PE")}. Documento de apoyo: la situación oficial es la registrada en el SIAGIE. Página ${i} de ${total}`, 12, doc.internal.pageSize.getHeight() - 5);
  }
  doc.save(nombreArchivo);
}
