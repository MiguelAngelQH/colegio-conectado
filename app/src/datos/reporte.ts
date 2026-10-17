// Reporte de indicadores en PDF para la dirección y la UGEL. Se genera en el equipo, sin internet.
import type { Panel } from "@/dominio/panel";
import { DESCRIPCION_NIVEL, NIVELES } from "@/dominio/notas";
import { nombreCompleto } from "./consultas";

const TEAL: [number, number, number] = [11, 110, 106];

export async function descargarReporte(p: {
  panel: Panel; colegio: string; ugel: string; alcance: string; periodo: string;
  avanceDocentes: { etiqueta: string; valor: number; detalle?: string }[];
}) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const fin = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const titulo = (texto: string, y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...TEAL);
    doc.text(texto, 14, y);
    doc.setTextColor(11, 46, 51);
    return y + 2;
  };
  const tabla = { theme: "grid" as const, styles: { fontSize: 8, cellPadding: 1.6, lineColor: [200, 214, 216] as [number, number, number], lineWidth: 0.2, textColor: [11, 46, 51] as [number, number, number] },
    headStyles: { fillColor: TEAL, textColor: 255, fontStyle: "bold" as const } };

  doc.setFillColor(...TEAL);
  doc.rect(0, 0, ancho, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("REPORTE DE INDICADORES", 14, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${p.colegio}  |  ${p.ugel}  |  ${p.alcance}  |  Notas: ${p.periodo}`, 14, 18);

  const { panel } = p;
  let y = titulo("Indicadores principales", 33);
  autoTable(doc, {
    ...tabla, startY: y,
    head: [["Indicador", "Valor"]],
    body: [
      ["Estudiantes matriculados", String(panel.matriculados)],
      ["Asistencia de los últimos 30 días", panel.asistencia30 === null ? "Sin registros" : `${panel.asistencia30}%`],
      [`Notas registradas (${p.periodo})`, panel.avanceNotas === null ? "-" : `${panel.avanceNotas}%`],
      ["Estudiantes con alertas", String(panel.enRiesgo.length)],
      ["Incidencias abiertas", `${panel.incidenciasAbiertas}${panel.sisevePendientes ? ` (${panel.sisevePendientes} sin reporte en SíseVe)` : ""}`],
      ["Justificaciones por revisar", String(panel.justificacionesPendientes)],
    ],
    columnStyles: { 0: { cellWidth: 110 } },
  });

  if (panel.distribucion.length) {
    y = titulo(`Logros por área (${p.periodo})`, fin() + 9);
    autoTable(doc, {
      ...tabla, startY: y,
      head: [["Área", ...NIVELES.map((n) => `${n} ${DESCRIPCION_NIVEL[n].nombre}`), "Notas"]],
      body: panel.distribucion.map((d) => [d.area, ...NIVELES.map((n) => `${d.conteo[n]} (${d.total ? Math.round((d.conteo[n] / d.total) * 100) : 0}%)`), String(d.total)]),
    });
  }

  y = titulo("Asistencia por semana", fin() + 9);
  autoTable(doc, {
    ...tabla, startY: y,
    head: [["Semana del", "Asistencia", "Registros"]],
    body: panel.semanas.map((s) => [new Date(`${s.semana}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long" }), s.porcentaje === null ? "-" : `${s.porcentaje}%`, String(s.registros)]),
  });

  if (p.avanceDocentes.length) {
    y = titulo(`Avance del registro de notas por docente (${p.periodo})`, fin() + 9);
    autoTable(doc, { ...tabla, startY: y, head: [["Docente", "Avance", "Detalle"]], body: p.avanceDocentes.map((d) => [d.etiqueta, `${d.valor}%`, d.detalle ?? ""]) });
  }

  if (panel.enRiesgo.length) {
    y = titulo("Estudiantes que necesitan atención", fin() + 9);
    autoTable(doc, {
      ...tabla, startY: y,
      head: [["Estudiante", "Sección", "Alertas"]],
      body: panel.enRiesgo.map((r) => [nombreCompleto(r.estudiante), r.seccion, r.alertas.join("; ")]),
      columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 28 } },
    });
  }

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120, 140, 145);
    const alto = doc.internal.pageSize.getHeight();
    doc.text("Contiene datos personales de menores de edad: uso reservado (Ley N.° 29733).", 14, alto - 10);
    doc.text(`Generado con Colegio Conectado el ${new Date().toLocaleString("es-PE")}  |  Página ${i} de ${total}`, 14, alto - 6);
  }
  doc.save(`reporte_indicadores_${new Date().toISOString().slice(0, 10)}.pdf`);
}
