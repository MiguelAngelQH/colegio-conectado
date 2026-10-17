// Carnés con QR en PDF (tamaño tarjeta de crédito, 10 por hoja A4). Se generan en el equipo.
import { db } from "@/app/contexto";
import type { Estudiante } from "@/db/tipos";
import { textoCarne } from "@/dominio/qr";
import { anioActivo, seccionesDetalle } from "./consultas";

const ANCHO = 85.6;
const ALTO = 54;
const TEAL: [number, number, number] = [11, 110, 106];

export async function descargarCarnes(seccionIds: string[], nombreArchivo: string) {
  const [{ jsPDF }, QR] = await Promise.all([import("jspdf"), import("qrcode")]);
  const anio = await anioActivo();
  if (!anio) throw new Error("No hay año escolar activo");
  const secciones = (await seccionesDetalle(anio.id)).filter((s) => seccionIds.includes(s.id));
  const colegio = (await db.tabla("colegio").toArray())[0];
  const matriculas = (await db.tabla("matricula").toArray()).filter((m) => seccionIds.includes(m.seccion_id) && m.anio_id === anio.id && !m.eliminado && m.estado === "matriculado");
  const estudiantes = (await db.tabla("estudiante").bulkGet(matriculas.map((m) => m.estudiante_id)))
    .map((e, i) => ({ e, seccion: secciones.find((s) => s.id === matriculas[i].seccion_id) }))
    .filter((x): x is { e: Estudiante; seccion: (typeof secciones)[number] } => !!x.e && !!x.seccion)
    .sort((a, b) => a.seccion.nombreLargo.localeCompare(b.seccion.nombreLargo) || a.e.apellidos.localeCompare(b.e.apellidos));
  if (!estudiantes.length) throw new Error("No hay estudiantes matriculados en la selección");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margenX = (210 - ANCHO * 2 - 6) / 2;
  const margenY = (297 - ALTO * 5 - 4 * 4) / 2;

  for (let i = 0; i < estudiantes.length; i++) {
    const pos = i % 10;
    if (i > 0 && pos === 0) doc.addPage();
    const x = margenX + (pos % 2) * (ANCHO + 6);
    const y = margenY + Math.floor(pos / 2) * (ALTO + 4);
    const { e, seccion } = estudiantes[i];

    // Línea de corte y fondo
    doc.setDrawColor(200, 214, 216);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, ANCHO, ALTO, 3, 3, "S");
    doc.setFillColor(...TEAL);
    doc.roundedRect(x, y, ANCHO, 12, 3, 3, "F");
    doc.rect(x, y + 6, ANCHO, 6, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(doc.splitTextToSize(colegio?.nombre ?? "Institución educativa", ANCHO - 8)[0], x + 4, y + 5.2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.text(`CARNÉ DE ESTUDIANTE ${anio.anio}`, x + 4, y + 9.5);

    doc.setTextColor(11, 46, 51);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(e.apellidos.toUpperCase(), 46), x + 4, y + 19);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(e.nombres, 46), x + 4, y + 27);
    doc.setFontSize(7);
    doc.setTextColor(63, 95, 99);
    doc.text(seccion.nombreLargo, x + 4, y + 38);
    if (e.dni) doc.text(`DNI ${e.dni}`, x + 4, y + 42.5);
    doc.setFont("courier", "bold");
    doc.setFontSize(8);
    doc.setTextColor(11, 46, 51);
    doc.text(e.codigo_carne, x + 4, y + 49);

    // QR dibujado como vectores: nítido al imprimir y el PDF pesa decenas de KB en lugar de megas.
    const modulos = QR.create(textoCarne(e.codigo_carne), { errorCorrectionLevel: "M" }).modules;
    const lado = 28;
    const celda = lado / modulos.size;
    const qx = x + ANCHO - 32;
    const qy = y + 16;
    doc.setFillColor(11, 46, 51);
    for (let fila = 0; fila < modulos.size; fila++) {
      for (let col = 0; col < modulos.size; col++) {
        if (modulos.get(fila, col)) doc.rect(qx + col * celda, qy + fila * celda, celda + 0.02, celda + 0.02, "F");
      }
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(63, 95, 99);
    doc.text("Asistencia", x + ANCHO - 18, y + 48.5, { align: "center" });
  }
  doc.save(nombreArchivo);
}
