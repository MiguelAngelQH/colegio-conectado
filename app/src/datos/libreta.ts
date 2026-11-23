// Informe de progreso (libreta) en PDF, generado en el propio equipo: funciona sin internet.
// jsPDF se carga solo al generar.
import { db } from "@/app/contexto";
import { vivas } from "@/db/repositorio";
import type { Estudiante, Usuario } from "@/db/tipos";
import { DESCRIPCION_NIVEL, NIVELES, armarLibreta } from "@/dominio/notas";
import { NOMBRE_SITUACION } from "@/dominio/promocion";
import { dibujarInsignia } from "./insignia";
import { anioActivo, nombreCompleto, seccionesDetalle } from "./consultas";

const TEAL: [number, number, number] = [11, 110, 106];
// Misma paleta que la app (validada para daltonismo): relleno de la celda + texto legible.
const COLOR_NIVEL: Record<string, { fondo: [number, number, number]; texto: [number, number, number] }> = {
  AD: { fondo: [29, 79, 145], texto: [255, 255, 255] },
  A: { fondo: [91, 155, 213], texto: [11, 46, 51] },
  B: { fondo: [240, 149, 106], texto: [11, 46, 51] },
  C: { fondo: [184, 50, 42], texto: [255, 255, 255] },
};

/** Genera un PDF con la libreta de cada estudiante indicado (una o más páginas por estudiante). */
export async function descargarLibretas(estudianteIds: string[], nombreArchivo: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const anio = await anioActivo();
  if (!anio) throw new Error("No hay año escolar activo");
  const [colegios, secciones, areas, competencias, periodos, calificaciones, matriculas, usuarios] = await Promise.all([
    db.tabla("colegio").toArray(),
    seccionesDetalle(anio.id),
    db.tabla("area").toArray(),
    db.tabla("competencia").toArray(),
    db.tabla("periodo").where("anio_id").equals(anio.id).toArray(),
    db.tabla("calificacion").toArray(),
    db.tabla("matricula").toArray(),
    db.tabla("usuario").toArray(),
  ]);
  const colegio = colegios[0];
  const director = usuarios.find((u) => u.roles.includes("director") && u.activo && !u.eliminado) as Usuario | undefined;
  const pers = vivas(periodos).sort((a, b) => a.numero - b.numero);
  const estudiantes = (await db.tabla("estudiante").bulkGet(estudianteIds)).filter((e): e is Estudiante => !!e);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();

  estudiantes.forEach((est, idx) => {
    if (idx > 0) doc.addPage();
    const mat = matriculas.find((m) => m.estudiante_id === est.id && m.anio_id === anio.id && !m.eliminado);
    const sec = secciones.find((s) => s.id === mat?.seccion_id);
    const nivel = sec?.grado?.nivel;

    // Encabezado
    doc.setFillColor(...TEAL);
    doc.rect(0, 0, ancho, 24, "F");
    dibujarInsignia(doc, colegio?.insignia, 8, 3, 18);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`INFORME DE PROGRESO DEL APRENDIZAJE DEL ESTUDIANTE - ${anio.anio}`, ancho / 2, 10, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${colegio?.nombre ?? ""}  |  Código modular ${colegio?.codigo_modular ?? "-"}  |  ${colegio?.ugel ?? ""}`, ancho / 2, 17, { align: "center" });

    doc.setTextColor(11, 46, 51);
    autoTable(doc, {
      startY: 29,
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 1.2 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 38 }, 2: { fontStyle: "bold", cellWidth: 30 } },
      body: [
        ["Estudiante", nombreCompleto(est).toUpperCase(), "DNI", est.dni ?? "-"],
        ["Grado y sección", sec ? sec.nombre : "-", "Nivel", nivel === "primaria" ? "Primaria" : nivel === "secundaria" ? "Secundaria" : "-"],
        ["Tutor(a)", sec?.tutor ? `${sec.tutor.nombres} ${sec.tutor.apellidos}` : "-", "Código", est.codigo_carne],
      ],
    });

    const filas = armarLibreta({
      estudianteId: est.id,
      areas: areas.filter((a) => a.nivel === nivel && !a.eliminado),
      competencias, periodos: pers, calificaciones,
    });

    const cuerpo: (string | { content: string; rowSpan?: number; styles?: object })[][] = [];
    for (const f of filas) {
      f.competencias.forEach((c, i) => {
        const fila: (string | { content: string; rowSpan?: number; styles?: object })[] = [];
        if (i === 0) fila.push({ content: f.area.nombre, rowSpan: f.competencias.length, styles: { fontStyle: "bold", valign: "middle" } });
        fila.push(c.competencia.nombre);
        c.niveles.forEach((n) => fila.push(n ?? ""));
        // Nivel final del año: el del último periodo calificado (RVM 094-2020).
        fila.push([...c.niveles].reverse().find(Boolean) ?? "");
        fila.push(c.conclusion ?? "");
        cuerpo.push(fila);
      });
    }

    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4,
      head: [["Área", "Competencias", ...pers.map((p) => p.nombre.split(" ")[0]), "Final", "Conclusión descriptiva"]],
      body: cuerpo.length ? cuerpo : [[{ content: "Aún no hay calificaciones registradas.", styles: { halign: "center" } } as never]],
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 1.6, lineColor: [200, 214, 216], lineWidth: 0.2, textColor: [11, 46, 51] },
      headStyles: { fillColor: TEAL, textColor: 255, fontStyle: "bold", halign: "center" },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 62 },
        ...Object.fromEntries([...pers, null].map((_, i) => [i + 2, { cellWidth: i === pers.length ? 11 : 9, halign: "center", fontStyle: "bold" }])),
      },
      didParseCell: (d) => {
        const v = String(d.cell.raw ?? "");
        if (d.section === "body" && d.column.index >= 2 && d.column.index <= 2 + pers.length && COLOR_NIVEL[v]) {
          d.cell.styles.fillColor = COLOR_NIVEL[v].fondo;
          d.cell.styles.textColor = COLOR_NIVEL[v].texto;
        }
      },
    });

    let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
    // Al cerrar el año: asistencia del año y situación final confirmada por la dirección.
    const resumen = mat?.asistencia_resumen;
    if (mat?.situacion_final || resumen) {
      autoTable(doc, {
        startY: y, theme: "plain", styles: { fontSize: 8.5, cellPadding: 1.2 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 38 }, 2: { fontStyle: "bold", cellWidth: 30 } },
        body: [[
          "Situación final", mat?.situacion_final ? `${mat.situacion_final} - ${NOMBRE_SITUACION[mat.situacion_final]}` : "-",
          "Asistencia", resumen ? `${resumen.porcentaje ?? "-"}% · ${resumen.F} faltas · ${resumen.T} tardanzas · ${resumen.J} justificadas` : "-",
        ]],
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    }
    autoTable(doc, {
      startY: y,
      head: [["Escala de calificación", ""]],
      body: NIVELES.map((n) => [`${n} - ${DESCRIPCION_NIVEL[n].nombre}`, DESCRIPCION_NIVEL[n].texto]),
      theme: "plain",
      styles: { fontSize: 7, cellPadding: 1 },
      headStyles: { fontStyle: "bold", textColor: TEAL },
      columnStyles: { 0: { cellWidth: 40, fontStyle: "bold" } },
    });

    // Firmas (si no entran en la página, van a la siguiente).
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
    if (y > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 40;
    }
    doc.setDrawColor(120, 140, 145);
    doc.setFontSize(8);
    [[ancho * 0.28, sec?.tutor ? `${sec.tutor.nombres} ${sec.tutor.apellidos}` : "Tutor(a)", "Tutor(a)"],
     [ancho * 0.72, director ? `${director.nombres} ${director.apellidos}` : "Director(a)", "Director(a)"]].forEach(([x, nombre, cargo]) => {
      doc.line((x as number) - 30, y, (x as number) + 30, y);
      doc.text(String(nombre), x as number, y + 4, { align: "center" });
      doc.setTextColor(90, 110, 115);
      doc.text(String(cargo), x as number, y + 8, { align: "center" });
      doc.setTextColor(11, 46, 51);
    });
  });

  // Pie de página en todas las hojas.
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120, 140, 145);
    doc.text(`Generado con Colegio Conectado el ${new Date().toLocaleDateString("es-PE")}  |  Página ${i} de ${total}`, ancho / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" });
  }
  doc.save(nombreArchivo);
}
