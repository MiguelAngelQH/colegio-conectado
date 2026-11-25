import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, ChevronRight, ClipboardCheck, FileCheck, FileSpreadsheet, History, IdCard } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { abrirSesion, hoyLocal } from "@/datos/asistencia";
import { anioActivo, seccionesDetalle } from "@/datos/consultas";
import { descargarRegistroAsistencia } from "@/datos/formatos-colegio";
import { vivas } from "@/db/repositorio";
import { useAvisar } from "@/ui/avisos";
import { Boton, Contenido, Encabezado, Gema, Tarjeta, cx, orden } from "@/ui/componentes";
import { Campo, Selector, Vacio } from "@/ui/formulario";
import { Carnes } from "./Carnes";
import { TomaAsistencia } from "./TomaAsistencia";
import { Justificaciones } from "./Justificaciones";

export function Asistencia() {
  return (
    <Routes>
      <Route index element={<InicioAsistencia />} />
      <Route path="sesion/:id" element={<TomaAsistencia />} />
      <Route path="carnes" element={<Carnes />} />
      <Route path="justificaciones" element={<Justificaciones />} />
      <Route path="*" element={<Navigate to="/asistencia" replace />} />
    </Routes>
  );
}

const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });

function InicioAsistencia() {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const navegar = useNavigate();
  const [seccionId, setSeccionId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [abriendo, setAbriendo] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const verTodo = !!usuario?.roles.some((r) => ["director", "subdirector", "auxiliar"].includes(r));

  const datos = useLiveQuery(async () => {
    if (!usuario) return null;
    const anio = await anioActivo();
    if (!anio) return { secciones: [], asig: [], areas: new Map(), sesiones: [], justificacionesPendientes: 0 };
    const todas = await seccionesDetalle(anio.id);
    const asig = vivas(await db.tabla("docente_asignacion").where("docente_id").equals(usuario.id).toArray());
    const mias = new Set([...asig.map((a) => a.seccion_id), ...todas.filter((s) => s.tutor_id === usuario.id).map((s) => s.id)]);
    const secciones = verTodo ? todas : todas.filter((s) => mias.has(s.id));
    const areas = new Map((await db.tabla("area").toArray()).map((a) => [a.id, a]));
    const desde = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
    const sesiones = vivas(await db.tabla("asistencia_sesion").where("fecha").aboveOrEqual(desde).toArray())
      .filter((s) => secciones.some((x) => x.id === s.seccion_id) && (verTodo || s.docente_id === usuario.id))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.abierta_en ?? 0) - (a.abierta_en ?? 0));
    const conteos = new Map<string, { total: number; presentes: number; revisar: number }>();
    for (const s of sesiones) {
      const marcas = vivas(await db.tabla("asistencia").where("sesion_id").equals(s.id).toArray());
      conteos.set(s.id, {
        total: marcas.length,
        presentes: marcas.filter((m) => m.estado === "P" || m.estado === "T").length,
        revisar: marcas.filter((m) => m.por_revisar).length,
      });
    }
    const justificacionesPendientes = vivas(await db.tabla("justificacion").where("estado").equals("pendiente").toArray()).length;
    return { secciones, asig, areas, justificacionesPendientes, sesiones: sesiones.map((s) => ({ s, c: conteos.get(s.id)! })) };
  }, [usuario?.id, verTodo]);

  useEffect(() => {
    if (datos?.secciones[0] && !seccionId) setSeccionId(datos.secciones[0].id);
  }, [datos, seccionId]);

  const areasSeccion = useMemo(
    () => (datos?.asig ?? []).filter((a) => a.seccion_id === seccionId).map((a) => datos!.areas.get(a.area_id)).filter(Boolean),
    [datos, seccionId],
  );
  useEffect(() => setAreaId(""), [seccionId]);

  if (!datos) return null;
  const nombreSeccion = (id: string) => datos.secciones.find((s) => s.id === id)?.nombre ?? "Sección";

  const tomar = async () => {
    setAbriendo(true);
    try {
      const id = await abrirSesion({ seccionId, areaId: areaId || null, docenteId: usuario!.id, colegioId });
      navegar(`sesion/${id}`);
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
      setAbriendo(false);
    }
  };

  const descargarRegistro = async () => {
    setDescargando(true);
    try {
      await descargarRegistroAsistencia({ seccionId, areaId: areaId || null });
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setDescargando(false);
    }
  };

  const hoy = hoyLocal();
  return (
    <>
      <Encabezado etiqueta="Asistencia" titulo="Tomar asistencia" subtitulo="Con QR en la pizarra, escaneando carnés o con la lista. Funciona sin internet."
        accion={verTodo ? <Boton variante="vidrio" icono={IdCard} onClick={() => navegar("carnes")} className="hidden sm:inline-flex">Carnés</Boton> : undefined} />
      <Contenido ancho="max-w-3xl">
        {datos.secciones.length === 0 ? (
          <Vacio icono={ClipboardCheck} tono="tono-laguna" titulo="No tiene secciones asignadas">La dirección debe asignarle secciones en Configuración.</Vacio>
        ) : (
          <Tarjeta className="aparecer space-y-4 p-5" style={orden(1)}>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              <Campo etiqueta="Sección">
                <Selector value={seccionId} onChange={(e) => setSeccionId(e.target.value)}>
                  {datos.secciones.map((s) => <option key={s.id} value={s.id}>{s.nombreLargo} ({s.estudiantes})</option>)}
                </Selector>
              </Campo>
              <Campo etiqueta="Clase">
                <Selector value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                  <option value="">Asistencia del día</option>
                  {areasSeccion.map((a) => <option key={a!.id} value={a!.id}>{a!.nombre}</option>)}
                </Selector>
              </Campo>
            </div>
            <Boton icono={ClipboardCheck} className="w-full" onClick={tomar} cargando={abriendo} disabled={!seccionId}>Tomar asistencia de hoy</Boton>
            <Boton variante="vidrio" icono={FileSpreadsheet} className="w-full" onClick={descargarRegistro} cargando={descargando} disabled={!seccionId}>
              Descargar registro de control de asistencia (Excel)
            </Boton>
          </Tarjeta>
        )}

        {datos.justificacionesPendientes > 0 && (
          <button onClick={() => navegar("justificaciones")} className="vidrio aparecer flex w-full items-center gap-3 p-4 text-left ring-1 ring-sky-200" style={orden(2)}>
            <Gema icono={FileCheck} tono="tono-cielo" tam="sm" />
            <span className="flex-1 font-semibold">{datos.justificacionesPendientes} {datos.justificacionesPendientes === 1 ? "justificación" : "justificaciones"} de familias por revisar</span>
            <ChevronRight className="h-5 w-5 text-tinta-suave" aria-hidden />
          </button>
        )}

        {verTodo && (
          <button onClick={() => navegar("carnes")} className="vidrio aparecer flex w-full items-center gap-3 p-4 text-left sm:hidden" style={orden(2)}>
            <Gema icono={IdCard} tono="tono-ambar" tam="sm" />
            <span className="flex-1 font-semibold">Imprimir carnés con QR</span>
            <ChevronRight className="h-5 w-5 text-tinta-suave" aria-hidden />
          </button>
        )}

        {datos.sesiones.length > 0 && (
          <section className="space-y-2">
            <h2 className="etiqueta flex items-center gap-1.5 px-1"><History className="h-3.5 w-3.5" aria-hidden /> Últimas tres semanas</h2>
            <Tarjeta className="divide-y divide-white/70 overflow-hidden">
              {datos.sesiones.map(({ s, c }) => (
                <button key={s.id} onClick={() => navegar(`sesion/${s.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/40">
                  <Gema icono={CalendarDays} tono={s.fecha === hoy ? "tono-laguna" : "tono-pizarra"} tam="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {nombreSeccion(s.seccion_id)}{s.area_id && ` · ${datos.areas.get(s.area_id)?.nombre ?? ""}`}
                    </span>
                    <span className="block text-xs text-tinta-suave">
                      {s.fecha === hoy ? "Hoy" : fechaCorta(s.fecha)} · {c.presentes} presentes de {c.total} marcados
                      {c.revisar > 0 && <span className="font-semibold text-amber-700"> · {c.revisar} por revisar</span>}
                    </span>
                  </span>
                  <span className={cx("rounded-full px-2.5 py-1 text-[0.65rem] font-bold", s.estado === "confirmada" ? "bg-emerald-100/80 text-emerald-800" : "bg-sky-100/80 text-sky-800")}>
                    {s.estado === "confirmada" ? "Confirmada" : "Abierta"}
                  </span>
                </button>
              ))}
            </Tarjeta>
          </section>
        )}
      </Contenido>
    </>
  );
}
