// Insignia del colegio: se reduce en el equipo a 256 px como máximo y se guarda como PNG (o JPEG si
// queda muy pesada) en la fila del colegio. Así viaja con la sincronización y sirve sin conexión.
const MAXIMO_LADO = 256;
const MAXIMO_CARACTERES = 380_000; // la base acepta hasta 400 000

function cargarImagen(archivo: File): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No se pudo leer la imagen. Pruebe con un archivo PNG o JPG.")); };
    img.src = url;
  });
}

export async function procesarInsignia(archivo: File): Promise<string> {
  if (!archivo.type.startsWith("image/")) throw new Error("Elija una imagen (PNG o JPG).");
  if (archivo.size > 8 * 1024 * 1024) throw new Error("La imagen es muy grande (máximo 8 MB).");
  const img = await cargarImagen(archivo);
  const escala = Math.min(1, MAXIMO_LADO / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * escala));
  const h = Math.max(1, Math.round(img.height * escala));
  const lienzo = document.createElement("canvas");
  lienzo.width = w;
  lienzo.height = h;
  const ctx = lienzo.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  const png = lienzo.toDataURL("image/png");
  if (png.length <= MAXIMO_CARACTERES) return png;
  // Fotos con mucho detalle: JPEG sobre fondo blanco (el JPEG no tiene transparencia).
  const fondo = document.createElement("canvas");
  fondo.width = w;
  fondo.height = h;
  const f = fondo.getContext("2d")!;
  f.fillStyle = "#ffffff";
  f.fillRect(0, 0, w, h);
  f.drawImage(lienzo, 0, 0);
  const jpg = fondo.toDataURL("image/jpeg", 0.85);
  if (jpg.length > MAXIMO_CARACTERES) throw new Error("La imagen tiene demasiado detalle. Pruebe con una versión más simple de la insignia.");
  return jpg;
}

/** Formato para jsPDF.addImage a partir del data URL. */
export const formatoInsignia = (dataUrl: string) => (dataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG");
