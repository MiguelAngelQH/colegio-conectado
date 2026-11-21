// PDF de credenciales para entregar en papel: una tarjeta recortable por persona con su usuario (DNI)
// y su contraseña temporal. Se genera en el equipo; no se guarda en ninguna parte.
export interface Credencial {
  nombre: string;
  rol: string;
  detalle: string; // sección o estudiante al que representa
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
    doc.text(doc.splitTextToSize(`${c.rol} · ${c.detalle}`, w - 12)[0], x + 6, y + 22);

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
