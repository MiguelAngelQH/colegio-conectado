// Descargas en el formato que el colegio ya usa en Excel:
//  - Registro de control de asistencia: una hoja por mes, semanas de lunes a viernes, A/F/J.
//  - Registro auxiliar de evaluación por competencias: bimestre, registro descriptivo y mapa de calor.
// Se generan en el equipo con los datos sincronizados; no necesitan internet.
import type { Borders, Cell, Fill, Font, Workbook, Worksheet } from "exceljs";
import { db } from "@/app/contexto";
import { vivas } from "@/db/repositorio";
import type { Asistencia, AsistenciaSesion, Competencia, NivelLogro, Periodo } from "@/db/tipos";
import { anioActivo, colegioActual, estudiantesDeSeccion, nombreCompleto, NIVEL_TEXTO, seccionesDetalle } from "./consultas";

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const DIAS = ["L", "M", "M", "J", "V"];

// ------------------------------------------------------------------ utilidades de estilo

const borde: Partial<Borders> = {
  top: { style: "thin", color: { argb: "FF7F7F7F" } }, left: { style: "thin", color: { argb: "FF7F7F7F" } },
  bottom: { style: "thin", color: { argb: "FF7F7F7F" } }, right: { style: "thin", color: { argb: "FF7F7F7F" } },
};
const relleno = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const letra = (n: number) => {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

function celda(ws: Worksheet, ref: string, valor: Cell["value"], estilo: { font?: Partial<Font>; fill?: string; centro?: boolean; borde?: boolean; envolver?: boolean; vertical?: boolean } = {}) {
  const c = ws.getCell(ref);
  c.value = valor;
  if (estilo.font) c.font = { name: "Calibri", size: 10, ...estilo.font };
  if (estilo.fill) c.fill = relleno(estilo.fill);
  c.alignment = {
    horizontal: estilo.centro ? "center" : "left", vertical: "middle", wrapText: estilo.envolver ?? false,
    ...(estilo.vertical ? { textRotation: 90 } : {}),
  };
  if (estilo.borde) c.border = borde;
  return c;
}

/** Combina un rango y aplica el estilo a todas sus celdas (para que el borde se vea completo). */
function bloque(ws: Worksheet, rango: string, valor: Cell["value"], estilo: Parameters<typeof celda>[3] = {}) {
  ws.mergeCells(rango);
  const [a, b] = rango.split(":");
  const inicio = ws.getCell(a), fin = ws.getCell(b);
  for (let r = Number(inicio.row); r <= Number(fin.row); r++) {
    for (let c = Number(inicio.col); c <= Number(fin.col); c++) {
      const x = ws.getCell(r, c);
      if (estilo.borde) x.border = borde;
      if (estilo.fill) x.fill = relleno(estilo.fill);
    }
  }
  return celda(ws, a, valor, estilo);
}

async function agregarInsignia(wb: Workbook, ws: Worksheet, insignia: string | null | undefined, col: number, fila: number, tam = 70) {
  if (!insignia) return;
  const extension = insignia.startsWith("data:image/jpeg") ? "jpeg" : "png";
  const id = wb.addImage({ base64: insignia, extension });
  ws.addImage(id, { tl: { col, row: fila }, ext: { width: tam, height: tam } });
}

async function descargar(wb: Workbook, nombre: string) {
  const datos = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([datos], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre.replace(/[^\wáéíóúñÁÉÍÓÚÑ.°º -]+/g, "").replace(/\s+/g, " ").trim()}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const cicloDe = (nivel: "primaria" | "secundaria", grado: number) =>
  nivel === "primaria" ? ["III", "III", "IV", "IV", "V", "V"][grado - 1] ?? "" : grado <= 2 ? "VI" : "VII";

async function datosSeccion(seccionId: string) {
  const anio = await anioActivo();
  const seccion = anio ? (await seccionesDetalle(anio.id)).find((s) => s.id === seccionId) : undefined;
  if (!anio || !seccion) throw new Error("No se encontró la sección en el año activo.");
  const colegio = await colegioActual();
  return { anio, seccion, colegio, estudiantes: await estudiantesDeSeccion(seccionId) };
}

async function nombreDocente(seccionId: string, areaId: string | null, tutorId: string | null) {
  let id = tutorId;
  if (areaId) id = vivas(await db.tabla("docente_asignacion").where("seccion_id").equals(seccionId).toArray()).find((a) => a.area_id === areaId)?.docente_id ?? tutorId;
  const u = id ? await db.tabla("usuario").get(id) : undefined;
  return u ? `${u.nombres} ${u.apellidos}`.toUpperCase() : "";
}

// ------------------------------------------------------------------ registro de asistencia mensual

const ROJO_TITULO = "FF930403";
const CREMA = "FFFFF7EF";
const CODIGO: Record<Asistencia["estado"], "A" | "F" | "J"> = { P: "A", T: "A", F: "F", J: "J" };
const COLOR_CODIGO = { A: "FFE2EFDA", F: "FFF8CBAD", J: "FFFFF2CC" } as const;

/** Días hábiles del mes agrupados por semana (lunes a viernes). */
function semanasDelMes(anio: number, mes: number) {
  const semanas: (string | null)[][] = [];
  let actual: (string | null)[] | null = null;
  for (let d = 1; d <= new Date(anio, mes + 1, 0).getDate(); d++) {
    const f = new Date(anio, mes, d);
    const dia = f.getDay(); // 0 domingo
    if (dia === 0 || dia === 6) continue;
    if (!actual || dia === 1) {
      actual = [null, null, null, null, null];
      semanas.push(actual);
    }
    actual[dia - 1] = `${anio}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return semanas;
}

/**
 * Registro de control de asistencia de una sección (asistencia del día o de un área),
 * con una hoja por mes desde marzo hasta el mes actual (o diciembre si el año ya terminó).
 */
export async function descargarRegistroAsistencia(p: { seccionId: string; areaId: string | null; meses?: number[] }) {
  const { anio, seccion, colegio, estudiantes } = await datosSeccion(p.seccionId);
  const ExcelJS = (await import("exceljs")).default;
  const area = p.areaId ? await db.tabla("area").get(p.areaId) : undefined;
  const docente = await nombreDocente(p.seccionId, p.areaId, seccion.tutor_id);
  const periodos = vivas(await db.tabla("periodo").where("anio_id").equals(anio.id).toArray()).sort((a, b) => a.numero - b.numero);
  const sesiones = vivas(await db.tabla("asistencia_sesion").where("seccion_id").equals(p.seccionId).toArray())
    .filter((s) => (s.area_id ?? null) === (p.areaId ?? null));
  const porFecha = new Map<string, AsistenciaSesion>();
  for (const s of sesiones) if (!porFecha.has(s.fecha) || s.estado === "confirmada") porFecha.set(s.fecha, s);
  const marcas = new Map<string, Asistencia["estado"]>(); // fecha|estudiante
  for (const s of porFecha.values()) {
    for (const m of vivas(await db.tabla("asistencia").where("sesion_id").equals(s.id).toArray())) marcas.set(`${s.fecha}|${m.estudiante_id}`, m.estado);
  }

  // Desde el primer mes con asistencia registrada hasta el mes actual (o el último con datos).
  const conDatos = [...new Set([...porFecha.values()].filter((s) => s.fecha.startsWith(String(anio.anio))).map((s) => Number(s.fecha.slice(5, 7)) - 1))].sort((a, b) => a - b);
  if (!p.meses && !conDatos.length) {
    throw new Error(`Todavía no hay asistencia registrada de ${area ? area.nombre : "la asistencia del día"} en ${seccion.nombre}. Elija otra clase o tome asistencia primero.`);
  }
  const hoy = new Date();
  const ultimoMes = Math.max(conDatos[conDatos.length - 1] ?? 2, anio.anio < hoy.getFullYear() ? 11 : Math.min(11, hoy.getMonth()));
  const primerMes = conDatos[0] ?? 2;
  const meses = p.meses ?? Array.from({ length: Math.max(0, ultimoMes - primerMes + 1) }, (_, i) => i + primerMes);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Colegio Conectado";
  wb.calcProperties.fullCalcOnLoad = true;

  for (const mes of meses) {
    const semanas = semanasDelMes(anio.anio, mes);
    const nDias = semanas.length * 5;
    const c0 = 4; // columna D
    const cFin = c0 + nDias - 1;
    const cA = cFin + 1, cF = cFin + 2, cJ = cFin + 3, cT = cFin + 4, cP = cFin + 6;
    const L = letra;
    const ws = wb.addWorksheet(MESES[mes], {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
      views: [{ state: "frozen", xSplit: 3, ySplit: 9 }],
    });
    ws.getColumn(1).width = 1.5;
    ws.getColumn(2).width = 4;
    ws.getColumn(3).width = 36;
    for (let c = c0; c <= cFin; c++) ws.getColumn(c).width = 3.6;
    for (const c of [cA, cF, cJ, cT]) ws.getColumn(c).width = 8;
    ws.getColumn(cT + 1).width = 2;
    ws.getColumn(cP).width = 11;

    // Encabezado
    bloque(ws, `D1:${L(cT)}2`, `REGISTRO DE CONTROL DE ASISTENCIA - ${MESES[mes]} ${anio.anio}`, { font: { size: 18, bold: true, color: { argb: ROJO_TITULO } }, centro: true });
    // Mismos bloques que la plantilla del colegio: semana 1 | semanas 2-3 | semanas 4-5 | totales.
    const rotulos1 = ["DRE/UGEL", "INSTITUCIÓN EDUCATIVA", "NIVEL/MODALIDAD", "DOCENTE"];
    const valores1 = [[colegio?.dre, colegio?.ugel].filter(Boolean).join(" / "), colegio?.nombre ?? "", `${NIVEL_TEXTO[seccion.grado?.nivel ?? "secundaria"]} - EBR`, docente];
    const tramos = [[c0, c0 + 4], [c0 + 5, c0 + 14], [c0 + 15, cFin], [cA, cT]];
    tramos.forEach(([a, b], i) => {
      bloque(ws, `${L(a)}3:${L(b)}3`, rotulos1[i], { font: { size: 8, bold: true }, fill: CREMA, centro: true, borde: true });
      bloque(ws, `${L(a)}4:${L(b)}4`, valores1[i], { font: { size: 9 }, centro: true, borde: true, envolver: true });
    });
    const periodo = periodos.filter((x) => x.inicio.slice(5, 7) <= String(mes + 1).padStart(2, "0") && x.fin.slice(5, 7) >= String(mes + 1).padStart(2, "0")).map((x) => x.nombre).join(" / ");
    const rotulos2 = ["GRADO Y SECCIÓN", "CICLO", "ÁREA", "TURNO", "PERIODO"];
    const valores2 = [seccion.nombre, seccion.grado ? cicloDe(seccion.grado.nivel, seccion.grado.numero) : "", area?.nombre ?? "Asistencia del día", "", periodo];
    const tramos2 = [[c0, c0 + 4], [c0 + 5, c0 + 9], [c0 + 10, c0 + 19], [c0 + 20, cFin], [cA, cT]];
    tramos2.forEach(([a, b], i) => {
      bloque(ws, `${L(a)}5:${L(b)}5`, rotulos2[i], { font: { size: 8, bold: true }, fill: CREMA, centro: true, borde: true });
      bloque(ws, `${L(a)}6:${L(b)}6`, valores2[i], { font: { size: 9 }, centro: true, borde: true });
    });
    await agregarInsignia(wb, ws, colegio?.insignia, cP - 1, 0, 80);

    // Cabecera de la cuadrícula
    bloque(ws, "B7:C7", "SEMANAS", { font: { bold: true }, centro: true, borde: true, fill: "FFDDEBF7" });
    semanas.forEach((_, i) => bloque(ws, `${L(c0 + i * 5)}7:${L(c0 + i * 5 + 4)}7`, `SEMANA ${i + 1}`, { font: { bold: true, size: 9 }, centro: true, borde: true, fill: "FFDDEBF7" }));
    bloque(ws, "B8:B9", "N°", { font: { bold: true }, centro: true, borde: true, fill: "FFDDEBF7" });
    bloque(ws, "C8:C9", "APELLIDOS Y NOMBRES", { font: { bold: true }, centro: true, borde: true, fill: "FFDDEBF7" });
    semanas.forEach((s, i) => s.forEach((f, d) => {
      const c = c0 + i * 5 + d;
      celda(ws, `${L(c)}8`, DIAS[d], { font: { bold: true, size: 9 }, centro: true, borde: true, fill: f ? "FFDDEBF7" : "FFEDEDED" });
      celda(ws, `${L(c)}9`, f ? Number(f.slice(8)) : "", { font: { size: 8 }, centro: true, borde: true, fill: f ? "FFFFFFFF" : "FFEDEDED" });
    }));
    [["ASISTIÓ", cA], ["FALTÓ", cF], ["JUSTIFICÓ", cJ], ["TOTAL", cT]].forEach(([t, c]) =>
      bloque(ws, `${L(c as number)}7:${L(c as number)}9`, t, { font: { bold: true, size: 8 }, centro: true, borde: true, fill: "FFFCE4D6" }));
    bloque(ws, `${L(cP)}7:${L(cP)}9`, "% DE ASISTENCIA", { font: { bold: true, size: 8 }, centro: true, borde: true, fill: "FFFCE4D6", envolver: true });

    // Estudiantes
    const filas = Math.max(estudiantes.length, 1);
    estudiantes.forEach((e, i) => {
      const r = 10 + i;
      celda(ws, `B${r}`, i + 1, { centro: true, borde: true, font: { size: 9 } });
      celda(ws, `C${r}`, nombreCompleto(e).toUpperCase(), { borde: true, font: { size: 9 } });
      semanas.forEach((s, w) => s.forEach((f, d) => {
        const c = c0 + w * 5 + d;
        const est = f ? marcas.get(`${f}|${e.id}`) : undefined;
        const cod = est ? CODIGO[est] : "";
        celda(ws, `${L(c)}${r}`, cod, { centro: true, borde: true, font: { size: 9, bold: cod === "F" }, fill: !f ? "FFEDEDED" : cod ? COLOR_CODIGO[cod] : undefined });
      }));
      const rango = `${L(c0)}${r}:${L(cFin)}${r}`;
      const cuenta = (x: string) => [...marcas.entries()].filter(([k, v]) => k.endsWith(`|${e.id}`) && k.slice(5, 7) === String(mes + 1).padStart(2, "0") && CODIGO[v] === x).length;
      const [a, f, j] = [cuenta("A"), cuenta("F"), cuenta("J")];
      celda(ws, `${L(cA)}${r}`, { formula: `COUNTIF(${rango},"A")`, result: a }, { centro: true, borde: true, font: { size: 9 } });
      celda(ws, `${L(cF)}${r}`, { formula: `COUNTIF(${rango},"F")`, result: f }, { centro: true, borde: true, font: { size: 9 } });
      celda(ws, `${L(cJ)}${r}`, { formula: `COUNTIF(${rango},"J")`, result: j }, { centro: true, borde: true, font: { size: 9 } });
      celda(ws, `${L(cT)}${r}`, { formula: `SUM(${L(cA)}${r}:${L(cJ)}${r})`, result: a + f + j }, { centro: true, borde: true, font: { size: 9, bold: true } });
      const pc = celda(ws, `${L(cP)}${r}`, { formula: `IFERROR(${L(cA)}${r}/${L(cT)}${r},"")`, result: a + f + j ? a / (a + f + j) : "" }, { centro: true, borde: true, font: { size: 9 } });
      pc.numFmt = "0%";
    });

    // Leyenda y totales por día
    const r0 = 10 + filas + 1;
    celda(ws, `C${r0}`, "LEYENDA", { font: { bold: true }, borde: true, fill: "FFDDEBF7" });
    const ley: [string, string][] = [["A = ASISTENTES", "A"], ["F = FALTAS", "F"], ["J = FALTAS JUSTIFICADAS", "J"]];
    ley.forEach(([t, cod], i) => {
      const r = r0 + 1 + i;
      celda(ws, `C${r}`, t, { borde: true, font: { size: 9 }, fill: COLOR_CODIGO[cod as "A"] });
      for (let c = c0; c <= cFin; c++) {
        celda(ws, `${L(c)}${r}`, { formula: `COUNTIF(${L(c)}10:${L(c)}${9 + filas},"${cod}")` }, { centro: true, borde: true, font: { size: 8 } });
      }
    });
    const rT = r0 + 4;
    celda(ws, `C${rT}`, "TOTAL", { font: { bold: true }, borde: true });
    for (let c = c0; c <= cFin; c++) celda(ws, `${L(c)}${rT}`, { formula: `SUM(${L(c)}${r0 + 1}:${L(c)}${r0 + 3})` }, { centro: true, borde: true, font: { size: 8, bold: true } });
    celda(ws, `${L(cA)}${r0}`, "TOTAL DEL MES", { font: { bold: true, size: 8 } });
    [cA, cF, cJ, cT].forEach((c, i) => celda(ws, `${L(c)}${r0 + 1}`, { formula: `SUM(${L(c)}10:${L(c)}${9 + filas})` }, { centro: true, borde: true, font: { bold: true, size: 9 }, fill: i < 3 ? COLOR_CODIGO[["A", "F", "J"][i] as "A"] : undefined }));
    const pg = celda(ws, `${L(cP)}${r0 + 1}`, { formula: `IFERROR(${L(cA)}${r0 + 1}/${L(cT)}${r0 + 1},"")` }, { centro: true, borde: true, font: { bold: true, size: 9 } });
    pg.numFmt = "0%";
    celda(ws, `C${rT + 2}`, "Las tardanzas se registran como asistencia (A). Generado por Colegio Conectado.", { font: { size: 8, italic: true, color: { argb: "FF7F7F7F" } } });
  }
  if (!meses.length) throw new Error("Todavía no hay meses de clase para este año.");
  // Al abrir el archivo se ve el último mes, no el primero.
  wb.views = [{ x: 0, y: 0, width: 12000, height: 9000, firstSheet: 0, activeTab: meses.length - 1, visibility: "visible" }];
  await descargar(wb, `Registro de asistencia ${seccion.nombre} ${area?.nombre ?? "diaria"} ${anio.anio}`);
}

// ------------------------------------------------------------------ registro auxiliar de evaluación

const VALOR: Record<NivelLogro, number> = { AD: 3, A: 2, B: 1, C: 0 };
const DE_VALOR: NivelLogro[] = ["C", "B", "A", "AD"];
/** Misma regla que el registro auxiliar del colegio: AD=3, A=2, B=1, C=0, promedio redondeado. */
export function logroPromedio(niveles: (NivelLogro | null | undefined)[]): NivelLogro | null {
  const v = niveles.filter((n): n is NivelLogro => !!n).map((n) => VALOR[n]);
  if (!v.length) return null;
  const prom = v.reduce((a, b) => a + b, 0) / v.length;
  return DE_VALOR[Math.min(3, Math.max(0, Math.round(prom)))];
}

// Colores del mapa de calor del colegio: AD azul, A verde, B amarillo, C rojo.
const COLOR_NIVEL: Record<NivelLogro, { fondo: string; suave: string; texto: string }> = {
  AD: { fondo: "FF0070C0", suave: "FFDDEBF7", texto: "FFFFFFFF" },
  A: { fondo: "FF00B050", suave: "FFE2EFDA", texto: "FFFFFFFF" },
  B: { fondo: "FFFFFF00", suave: "FFFFF2CC", texto: "FF000000" },
  C: { fondo: "FFFF0000", suave: "FFF8CBAD", texto: "FFFFFFFF" },
};
const NOMBRE_NIVEL: Record<NivelLogro, string> = { C: "En inicio", B: "En proceso", A: "Logro esperado", AD: "Logro destacado" };

export async function descargarRegistroAuxiliar(p: { seccionId: string; areaId: string; periodoId: string }) {
  const { anio, seccion, colegio, estudiantes } = await datosSeccion(p.seccionId);
  const ExcelJS = (await import("exceljs")).default;
  const area = await db.tabla("area").get(p.areaId);
  const periodo = (await db.tabla("periodo").get(p.periodoId)) as Periodo | undefined;
  if (!area || !periodo) throw new Error("Falta el área o el periodo.");
  const ordenar = (x: Competencia[]) => vivas(x).sort((a, b) => a.orden - b.orden);
  const competencias = ordenar(await db.tabla("competencia").where("area_id").equals(p.areaId).toArray());
  const trv = (await db.tabla("area").toArray()).find((a) => a.codigo === "TRV" && a.nivel === area.nivel && !a.eliminado);
  const transversales = trv ? ordenar(await db.tabla("competencia").where("area_id").equals(trv.id).toArray()) : [];
  const califs = vivas(await db.tabla("calificacion").where("[seccion_id+periodo_id]").equals([p.seccionId, p.periodoId]).toArray());
  const nota = (e: string, c: string) => califs.find((x) => x.estudiante_id === e && x.competencia_id === c);
  const docente = await nombreDocente(p.seccionId, p.areaId, seccion.tutor_id);
  const romano = periodo.nombre.split(" ")[0];

  const wb = new ExcelJS.Workbook();
  wb.creator = "Colegio Conectado";
  const L = letra;
  const nC = competencias.length, nT = transversales.length;
  const cLogro = 4 + nC; // después de las competencias del área
  const cT0 = cLogro + 1;
  const cFin = cT0 + Math.max(nT, 1) - 1;

  // --- Hoja del bimestre
  const ws = wb.addWorksheet(`${periodo.nombre.split(" ")[1] ?? "Periodo"} ${romano}`, {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: "frozen", xSplit: 3, ySplit: 8 }],
  });
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 34;
  ws.getColumn(3).width = 1;
  for (let c = 4; c <= cFin; c++) ws.getColumn(c).width = 13;
  bloque(ws, `D1:${L(cFin)}2`, `REGISTRO AUXILIAR DE EVALUACIÓN POR COMPETENCIAS ${anio.anio}`, { font: { size: 16, bold: true, color: { argb: "FF1F3864" } }, centro: true });
  await agregarInsignia(wb, ws, colegio?.insignia, 0, 0, 60);
  const datos4: [string, string][] = [["I.E", colegio?.nombre ?? ""], ["NIVEL", NIVEL_TEXTO[area.nivel]], ["ÁREA", area.nombre], ["GRADO", seccion.nombre], [periodo.nombre.split(" ")[1]?.toUpperCase() ?? "PERIODO", romano], ["DOCENTE", docente]];
  let cx = 1;
  const fila4 = ws.getRow(4);
  fila4.height = 30;
  for (const [rot, val] of datos4) {
    const ancho = rot === "I.E" || rot === "DOCENTE" ? 3 : 2;
    celda(ws, `${L(cx)}4`, rot, { font: { bold: true, size: 9 }, fill: "FFD9E1F2", borde: true, centro: true });
    bloque(ws, `${L(cx + 1)}4:${L(cx + ancho - 1)}4`, val, { font: { size: 9 }, borde: true, centro: true, envolver: true });
    cx += ancho;
  }
  bloque(ws, "A6:A8", "N°", { font: { bold: true }, centro: true, borde: true, fill: "FFD9E1F2" });
  bloque(ws, "B6:C8", "APELLIDOS Y NOMBRES", { font: { bold: true }, centro: true, borde: true, fill: "FFD9E1F2" });
  if (nC) bloque(ws, `D6:${L(3 + nC)}6`, "COMPETENCIAS DE ÁREA", { font: { bold: true }, centro: true, borde: true, fill: "FFFCE4D6" });
  bloque(ws, `${L(cLogro)}6:${L(cLogro)}8`, "LOGRO BIMESTRAL", { font: { bold: true, size: 9 }, centro: true, borde: true, fill: "FFFFE699", envolver: true });
  bloque(ws, `${L(cT0)}6:${L(cFin)}6`, "COMPETENCIAS TRANSVERSALES", { font: { bold: true }, centro: true, borde: true, fill: "FFE2EFDA" });
  ws.getRow(7).height = 75;
  competencias.forEach((c, i) => {
    celda(ws, `${L(4 + i)}7`, c.nombre.toUpperCase(), { font: { bold: true, size: 8 }, centro: true, borde: true, envolver: true, fill: "FFFCE4D6" });
    celda(ws, `${L(4 + i)}8`, "LOGRO", { font: { bold: true, size: 8 }, centro: true, borde: true, fill: "FFFCE4D6" });
  });
  transversales.forEach((c, i) => {
    celda(ws, `${L(cT0 + i)}7`, c.nombre.toUpperCase(), { font: { bold: true, size: 8 }, centro: true, borde: true, envolver: true, fill: "FFE2EFDA" });
    celda(ws, `${L(cT0 + i)}8`, "LOGRO", { font: { bold: true, size: 8 }, centro: true, borde: true, fill: "FFE2EFDA" });
  });
  const pintar = (ref: string, n: NivelLogro | null | undefined, fuerte = false) => {
    const c = celda(ws, ref, n ?? "", { centro: true, borde: true, font: { bold: true, size: 10, color: { argb: n && fuerte ? COLOR_NIVEL[n].texto : "FF000000" } }, fill: n ? (fuerte ? COLOR_NIVEL[n].fondo : COLOR_NIVEL[n].suave) : undefined });
    return c;
  };
  const logros: NivelLogro[][] = competencias.map(() => []);
  const bimestrales: NivelLogro[] = [];
  estudiantes.forEach((e, i) => {
    const r = 9 + i;
    celda(ws, `A${r}`, i + 1, { centro: true, borde: true, font: { size: 9 } });
    bloque(ws, `B${r}:C${r}`, nombreCompleto(e).toUpperCase(), { borde: true, font: { size: 9 } });
    const niveles = competencias.map((c, k) => {
      const n = nota(e.id, c.id)?.nivel_logro ?? null;
      if (n) logros[k].push(n);
      pintar(`${L(4 + k)}${r}`, n);
      return n;
    });
    const b = logroPromedio(niveles);
    if (b) bimestrales.push(b);
    pintar(`${L(cLogro)}${r}`, b, true);
    transversales.forEach((c, k) => pintar(`${L(cT0 + k)}${r}`, nota(e.id, c.id)?.nivel_logro ?? null));
  });

  // Resumen por niveles (cantidad y porcentaje)
  let r = 9 + estudiantes.length + 2;
  celda(ws, `B${r}`, "Niveles", { font: { bold: true }, borde: true, fill: "FFD9E1F2" });
  competencias.forEach((_, k) => celda(ws, `${L(4 + k)}${r}`, `C${k + 1}  cant. / %`, { font: { bold: true, size: 8 }, centro: true, borde: true, fill: "FFD9E1F2" }));
  celda(ws, `${L(cLogro)}${r}`, "BIMESTRAL", { font: { bold: true, size: 8 }, centro: true, borde: true, fill: "FFD9E1F2" });
  for (const n of ["C", "B", "A", "AD"] as NivelLogro[]) {
    r++;
    celda(ws, `B${r}`, `${NOMBRE_NIVEL[n]} (${n})`, { borde: true, font: { size: 9, bold: true, color: { argb: COLOR_NIVEL[n].texto } }, fill: COLOR_NIVEL[n].fondo });
    const texto = (lista: NivelLogro[]) => {
      const cant = lista.filter((x) => x === n).length;
      return `${cant}  (${lista.length ? Math.round((cant / lista.length) * 100) : 0}%)`;
    };
    logros.forEach((lista, k) => celda(ws, `${L(4 + k)}${r}`, texto(lista), { centro: true, borde: true, font: { size: 9 } }));
    celda(ws, `${L(cLogro)}${r}`, texto(bimestrales), { centro: true, borde: true, font: { size: 9, bold: true } });
  }
  r++;
  celda(ws, `B${r}`, "Total", { font: { bold: true }, borde: true });
  logros.forEach((lista, k) => celda(ws, `${L(4 + k)}${r}`, lista.length, { centro: true, borde: true, font: { bold: true } }));
  celda(ws, `${L(cLogro)}${r}`, bimestrales.length, { centro: true, borde: true, font: { bold: true } });
  celda(ws, `B${r + 2}`, "Logro bimestral: promedio de las competencias del área con AD=3, A=2, B=1, C=0, redondeado.", { font: { size: 8, italic: true, color: { argb: "FF7F7F7F" } } });

  // --- Registro descriptivo
  const wd = wb.addWorksheet("Reg Descriptivo", { pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  wd.getColumn(1).width = 4;
  wd.getColumn(2).width = 32;
  competencias.forEach((_, k) => { wd.getColumn(3 + k * 2).width = 9; wd.getColumn(4 + k * 2).width = 38; });
  const cD = 2 + nC * 2;
  bloque(wd, `C1:${L(Math.max(cD, 4))}1`, `REGISTRO AUXILIAR DE EVALUACIÓN - DESCRIPTIVO ${anio.anio}`, { font: { size: 15, bold: true, color: { argb: "FF1F3864" } }, centro: true });
  await agregarInsignia(wb, wd, colegio?.insignia, 0, 0, 55);
  const meta: [string, string, string, string][] = [["Nivel:", NIVEL_TEXTO[area.nivel], "Grado:", seccion.nombre], ["Área:", area.nombre, "Sección:", seccion.letra], ["Docente:", docente, "Periodo:", periodo.nombre]];
  meta.forEach(([a, b, c, d], i) => {
    celda(wd, `B${3 + i}`, a, { font: { bold: true } });
    celda(wd, `C${3 + i}`, b);
    celda(wd, `E${3 + i}`, c, { font: { bold: true } });
    celda(wd, `F${3 + i}`, d);
  });
  bloque(wd, "A7:A8", "N°", { font: { bold: true }, centro: true, borde: true, fill: "FFD9E1F2" });
  bloque(wd, "B7:B8", "APELLIDOS Y NOMBRES", { font: { bold: true }, centro: true, borde: true, fill: "FFD9E1F2" });
  wd.getRow(7).height = 32;
  competencias.forEach((c, k) => {
    bloque(wd, `${L(3 + k * 2)}7:${L(4 + k * 2)}7`, c.nombre, { font: { bold: true, size: 9 }, centro: true, borde: true, envolver: true, fill: "FFFCE4D6" });
    celda(wd, `${L(3 + k * 2)}8`, "Nivel de logro", { font: { bold: true, size: 8 }, centro: true, borde: true, envolver: true, fill: "FFFCE4D6" });
    celda(wd, `${L(4 + k * 2)}8`, "Conclusión descriptiva", { font: { bold: true, size: 8 }, centro: true, borde: true, fill: "FFFCE4D6" });
  });
  estudiantes.forEach((e, i) => {
    const fila = 9 + i;
    celda(wd, `A${fila}`, i + 1, { centro: true, borde: true, font: { size: 9 } });
    celda(wd, `B${fila}`, nombreCompleto(e).toUpperCase(), { borde: true, font: { size: 9 } });
    competencias.forEach((c, k) => {
      const x = nota(e.id, c.id);
      const n = x?.nivel_logro ?? null;
      celda(wd, `${L(3 + k * 2)}${fila}`, n ?? "", { centro: true, borde: true, font: { bold: true }, fill: n ? COLOR_NIVEL[n].suave : undefined });
      celda(wd, `${L(4 + k * 2)}${fila}`, x?.conclusion ?? "", { borde: true, envolver: true, font: { size: 8 } });
    });
  });
  const rf = 9 + estudiantes.length + 2;
  celda(wd, `C${rf}`, `${colegio?.distrito ?? ""}, ${new Date().toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" })}`);
  celda(wd, `B${rf + 4}`, "______________________________", { centro: true });
  celda(wd, `B${rf + 5}`, "Docente", { centro: true, font: { bold: true } });
  celda(wd, `${L(Math.max(cD - 1, 5))}${rf + 4}`, "______________________________", { centro: true });
  celda(wd, `${L(Math.max(cD - 1, 5))}${rf + 5}`, "Dirección", { centro: true, font: { bold: true } });

  // --- Mapa de calor
  const wm = wb.addWorksheet("Mapa de Calor", { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  wm.getColumn(1).width = 4;
  wm.getColumn(2).width = 34;
  competencias.forEach((_, k) => (wm.getColumn(3 + k).width = 18));
  wm.getColumn(3 + nC).width = 18;
  bloque(wm, `A2:${L(3 + nC)}2`, `MAPA DE CALOR DEL ${romano} ${periodo.nombre.split(" ")[1]?.toUpperCase() ?? ""} - ${area.nombre.toUpperCase()}`, { font: { size: 14, bold: true, color: { argb: "FF1F3864" } }, centro: true });
  celda(wm, "A4", "I.E", { font: { bold: true } }); celda(wm, "B4", colegio?.nombre ?? "");
  celda(wm, "C4", "DOCENTE", { font: { bold: true } }); celda(wm, "D4", docente);
  celda(wm, "A5", "NIVEL", { font: { bold: true } }); celda(wm, "B5", NIVEL_TEXTO[area.nivel]);
  celda(wm, "C5", "GRADO", { font: { bold: true } }); celda(wm, "D5", seccion.nombre);
  wm.getRow(8).height = 60;
  celda(wm, "A8", "N°", { font: { bold: true }, centro: true, borde: true, fill: "FFD9E1F2" });
  celda(wm, "B8", "APELLIDOS Y NOMBRES", { font: { bold: true }, centro: true, borde: true, fill: "FFD9E1F2" });
  competencias.forEach((c, k) => celda(wm, `${L(3 + k)}8`, c.nombre, { font: { bold: true, size: 8 }, centro: true, borde: true, envolver: true, fill: "FFD9E1F2" }));
  celda(wm, `${L(3 + nC)}8`, "LOGRO BIMESTRAL", { font: { bold: true, size: 8 }, centro: true, borde: true, envolver: true, fill: "FFFFE699" });
  estudiantes.forEach((e, i) => {
    const fila = 9 + i;
    celda(wm, `A${fila}`, i + 1, { centro: true, borde: true, font: { size: 9 } });
    celda(wm, `B${fila}`, nombreCompleto(e).toUpperCase(), { borde: true, font: { size: 9 } });
    const niveles = competencias.map((c, k) => {
      const n = nota(e.id, c.id)?.nivel_logro ?? null;
      celda(wm, `${L(3 + k)}${fila}`, n ? NOMBRE_NIVEL[n] : "", { centro: true, borde: true, font: { size: 9, bold: true, color: { argb: n ? COLOR_NIVEL[n].texto : "FF000000" } }, fill: n ? COLOR_NIVEL[n].fondo : undefined });
      return n;
    });
    const b = logroPromedio(niveles);
    celda(wm, `${L(3 + nC)}${fila}`, b ? NOMBRE_NIVEL[b] : "", { centro: true, borde: true, font: { size: 9, bold: true, color: { argb: b ? COLOR_NIVEL[b].texto : "FF000000" } }, fill: b ? COLOR_NIVEL[b].fondo : undefined });
  });
  const rl = 9 + estudiantes.length + 2;
  celda(wm, `B${rl}`, "Leyenda", { font: { bold: true } });
  (["AD", "A", "B", "C"] as NivelLogro[]).forEach((n, i) =>
    celda(wm, `B${rl + 1 + i}`, `${n} - ${NOMBRE_NIVEL[n]}`, { borde: true, font: { bold: true, size: 9, color: { argb: COLOR_NIVEL[n].texto } }, fill: COLOR_NIVEL[n].fondo }));

  await descargar(wb, `Registro auxiliar ${area.nombre} ${seccion.nombre} ${periodo.nombre}`);
}
