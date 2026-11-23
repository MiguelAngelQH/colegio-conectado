// PDF de credenciales para entregar en papel: una tarjeta recortable por persona con su usuario (DNI)
// y su contraseña temporal. Se genera en el equipo; no se guarda en ninguna parte.
export interface Credencial {
  nombre: string;
  rol: string;
  detalle: string; // sección o estudiante al que representa
  seccion?: string;
  dni: string;
  clave: string;
}

export async function descargarCredenciales(p: { colegio: string; titulo: string; credenciales: Credencial[]; direccionWeb: string }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const margen = 10, hueco = 6, cols = 2, filas = 5;
  const w = (ancho - 2 * margen - hueco) / cols;
  const h = (alto - 2 * margen - 8 - (filas - 1) * hueco) / filas;

  p.credenciales.forEach((c, i) => {
    const enPagina = i % (cols * filas);
    if (i > 0 && enPagina === 0) doc.addPage();
    if (enPagina === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(110, 130, 135);
      doc.text(`${p.colegio} · ${p.titulo} · Recorte por la línea punteada y entregue cada tarjeta a su titular.`, margen, margen + 2);
    }
    const x = margen + (enPagina % cols) * (w + hueco);
    const y = margen + 8 + Math.floor(enPagina / cols) * (h + hueco);

    doc.setDrawColor(150, 170, 175);
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.roundedRect(x, y, w, h, 3, 3, "S");
    doc.setLineDashPattern([], 0);

    doc.setFillColor(11, 110, 106);
    doc.roundedRect(x + 4, y + 4, w - 8, 7, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("COLEGIO CONECTADO · ACCESO", x + 6.5, y + 8.8);

    doc.setTextColor(11, 46, 51);
    doc.setFontSize(10.5);
    doc.text(doc.splitTextToSize(c.nombre, w - 12)[0], x + 6, y + 17.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(63, 95, 99);
    const detalle = c.detalle === c.rol || c.detalle === "Estudiante" ? c.seccion ?? "" : c.seccion ? `${c.detalle} · ${c.seccion}` : c.detalle;
    doc.text(doc.splitTextToSize(`${c.rol} · ${detalle}`, w - 12)[0], x + 6, y + 22);

    doc.setTextColor(11, 46, 51);
    doc.setFontSize(8);
    doc.text("Usuario (DNI)", x + 6, y + 29);
    doc.text("Contraseña temporal", x + w / 2, y + 29);
    doc.setFont("courier", "bold");
    doc.setFontSize(13);
    doc.text(c.dni, x + 6, y + 35);
    doc.text(c.clave, x + w / 2, y + 35);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(63, 95, 99);
    doc.text(doc.splitTextToSize(`Ingrese en ${p.direccionWeb}. La primera vez deberá elegir una contraseña propia. No comparta esta tarjeta.`, w - 12), x + 6, y + h - 7);
  });

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 140, 145);
    doc.text(`Contiene contraseñas: entregue a cada titular y destruya las sobrantes. Página ${i} de ${total}`, margen, alto - 4);
  }
  doc.save(`credenciales_${p.titulo.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]+/g, "_")}.pdf`);
}

/** Lista en Excel con todos los usuarios y contraseñas temporales (para la dirección). */
export async function descargarCredencialesExcel(p: { colegio: string; titulo: string; credenciales: Credencial[]; direccionWeb: string }) {
  const XLSX = await import("xlsx");
  const filas = p.credenciales.map((c, i) => ({
    "N°": i + 1, Sección: c.seccion ?? "", Rol: c.rol, "Apellidos y nombres": c.nombre, Detalle: c.detalle,
    "Usuario (DNI)": c.dni, "Contraseña temporal": c.clave,
  }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja["!cols"] = [{ wch: 5 }, { wch: 28 }, { wch: 14 }, { wch: 36 }, { wch: 34 }, { wch: 14 }, { wch: 20 }];
  // Las celdas de DNI y contraseña como texto: Excel no debe quitar ceros ni cambiar el formato.
  filas.forEach((_, i) => {
    for (const col of ["F", "G"]) {
      const celda = hoja[`${col}${i + 2}`];
      if (celda) { celda.t = "s"; celda.z = "@"; }
    }
  });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Cuentas");
  const info = XLSX.utils.aoa_to_sheet([
    [p.colegio], [p.titulo], [`Generado el ${new Date().toLocaleString("es-PE")}`], [],
    [`Cada persona ingresa en ${p.direccionWeb} con su DNI y la contraseña temporal.`],
    ["La primera vez la app le da la bienvenida y le pide crear su propia contraseña."],
    ["Este archivo contiene contraseñas: guárdelo en un lugar seguro y elimínelo cuando ya las haya entregado."],
  ]);
  info["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(libro, info, "Instrucciones");
  XLSX.writeFile(libro, `credenciales_${p.titulo.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]+/g, "_")}.xlsx`);
}
