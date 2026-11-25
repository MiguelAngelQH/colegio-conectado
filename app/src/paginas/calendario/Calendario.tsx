// Calendario escolar: vista del mes con feriados, evaluaciones, reuniones y actividades.
// La dirección publica para todo el colegio o una sección; el docente, para sus secciones.
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { hoyLocal } from "@/datos/asistencia";
import { anioActivo, matriculaActual, seccionesDetalle } from "@/datos/consultas";
import { useHijos } from "@/datos/familia";
import { nuevoId } from "@/db/local";
import { guardar, vivas } from "@/db/repositorio";
import type { Evento, TipoEvento } from "@/db/tipos";
import { TIPO_EVENTO, cuadriculaMes, feriados, ocurreEn } from "@/dominio/calendario";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Boton, Contenido, Dialogo, Encabezado, Tarjeta, cx } from "@/ui/componentes";
import { Campo, Entrada, Segmentado, Selector } from "@/ui/formulario";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const COLOR: Record<TipoEvento | "feriado", string> = {
  examen: "bg-sky-500", reunion: "bg-violet-500", actividad: "bg-emerald-500", sin_clases: "bg-amber-500", otro: "bg-slate-400", feriado: "bg-red-500",
};

export function Calendario() {
  const { usuario } = useApp();
  const { hijo } = useHijos(usuario);
  const gestion = !!usuario?.roles.some((r) => r === "director" || r === "subdirector");
  const docente = !!usuario?.roles.some((r) => r === "docente" || r === "tutor");
  const hoy = hoyLocal();
  const [mes, setMes] = useState(() => ({ anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) - 1 }));
  const [dia, setDia] = useState(hoy);
  const [editando, setEditando] = useState<Evento | "nuevo" | null>(null);

  const datos = useLiveQuery(async () => {
    if (!usuario) return null;
    const anio = await anioActivo();
    const todas = anio ? await seccionesDetalle(anio.id) : [];
    const asig = vivas(await db.tabla("docente_asignacion").where("docente_id").equals(usuario.id).toArray());
    const mias = gestion ? todas : todas.filter((s) => s.tutor_id === usuario.id || asig.some((a) => a.seccion_id === s.id));
    let familia: string | null = null;
    if (!gestion && !docente && hijo) familia = (await matriculaActual(hijo.id))?.seccion_id ?? null;
    const eventos = vivas(await db.tabla("evento").toArray())
      .filter((e) => !e.seccion_id || gestion || docente || usuario.roles.includes("auxiliar") || e.seccion_id === familia);
    return { eventos, mias, todas };
  }, [usuario?.id, hijo?.id, gestion, docente]);

  const fer = useMemo(() => feriados(mes.anio), [mes.anio]);
  if (!datos) return null;
  const celdas = cuadriculaMes(mes.anio, mes.mes);
  const delDia = (d: string) => datos.eventos.filter((e) => ocurreEn(e, d));
  const seccionNombre = (id: string | null) => (id ? datos.todas.find((s) => s.id === id)?.nombre ?? "Sección" : "Todo el colegio");
  const puedeCrear = gestion || (docente && datos.mias.length > 0);
  const proximos = datos.eventos.filter((e) => (e.fecha_fin ?? e.fecha) >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 8);
  const mover = (n: number) => setMes(({ anio, mes: m }) => {
    const d = new Date(anio, m + n, 1);
    return { anio: d.getFullYear(), mes: d.getMonth() };
  });
  const puedeEditar = (e: Evento) => gestion || e.autor_id === usuario?.id;

  const ListaEventos = ({ lista }: { lista: Evento[] }) => (
    <div className="divide-y divide-sup/70">
      {lista.map((e) => (
        <div key={e.id} className="flex items-start gap-3 px-4 py-3">
          <span className={cx("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", COLOR[e.tipo])} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{e.titulo}</p>
            <p className="text-xs text-tinta-suave">
              {TIPO_EVENTO[e.tipo]} · {new Date(`${e.fecha}T12:00:00`).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" })}
              {e.fecha_fin && e.fecha_fin !== e.fecha ? ` al ${new Date(`${e.fecha_fin}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}` : ""}
              {e.hora ? ` · ${e.hora}` : ""} · {seccionNombre(e.seccion_id)}
            </p>
            {e.descripcion && <p className="mt-1 text-sm">{e.descripcion}</p>}
          </div>
          {puedeEditar(e) && <Boton variante="fantasma" icono={Pencil} className="!min-h-9 !px-3" onClick={() => setEditando(e)}>Editar</Boton>}
        </div>
      ))}
    </div>
  );

  return (
    <>
      <Encabezado etiqueta="Colegio" titulo="Calendario escolar" subtitulo="Evaluaciones, reuniones, actividades y feriados."
        accion={puedeCrear ? <Boton icono={Plus} onClick={() => setEditando("nuevo")}>Nuevo evento</Boton> : undefined} />
      <Contenido ancho="max-w-4xl">
        <Tarjeta className="aparecer p-3 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <button onClick={() => mover(-1)} className="rounded-full p-2 hover:bg-sup/60" aria-label="Mes anterior"><ChevronLeft className="h-5 w-5" aria-hidden /></button>
            <h2 className="titulo-display flex-1 text-center text-xl font-bold">{MESES[mes.mes]} {mes.anio}</h2>
            <button onClick={() => mover(1)} className="rounded-full p-2 hover:bg-sup/60" aria-label="Mes siguiente"><ChevronRight className="h-5 w-5" aria-hidden /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-bold uppercase tracking-wider text-tinta-suave">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <span key={d} className="py-1">{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celdas.map((d, i) => {
              if (!d) return <span key={i} />;
              const evs = delDia(d);
              const feriado = fer.get(d);
              return (
                <button key={d} onClick={() => setDia(d)} aria-label={`${Number(d.slice(8))}${feriado ? `, ${feriado}` : ""}${evs.length ? `, ${evs.length} eventos` : ""}`}
                  className={cx("flex min-h-14 flex-col items-center gap-1 rounded-xl p-1 text-sm transition sm:min-h-16",
                    d === dia ? "bg-blue-600 text-white" : d === hoy ? "bg-sup/80 ring-2 ring-blue-500" : "bg-sup/40 hover:bg-sup/70",
                    feriado && d !== dia && "text-red-700")}>
                  <span className="font-bold">{Number(d.slice(8))}</span>
                  <span className="flex flex-wrap justify-center gap-0.5">
                    {feriado && <span className={cx("h-1.5 w-1.5 rounded-full", d === dia ? "bg-sup" : COLOR.feriado)} />}
                    {evs.slice(0, 3).map((e) => <span key={e.id} className={cx("h-1.5 w-1.5 rounded-full", d === dia ? "bg-sup" : COLOR[e.tipo])} />)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-tinta-suave">
            {(Object.keys(TIPO_EVENTO) as TipoEvento[]).map((t) => <span key={t} className="flex items-center gap-1"><span className={cx("h-2 w-2 rounded-full", COLOR[t])} /> {TIPO_EVENTO[t]}</span>)}
            <span className="flex items-center gap-1"><span className={cx("h-2 w-2 rounded-full", COLOR.feriado)} /> Feriado</span>
          </div>
        </Tarjeta>

        <section className="space-y-2">
          <h2 className="etiqueta px-1">{new Date(`${dia}T12:00:00`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}</h2>
          <Tarjeta className="overflow-hidden">
            {fer.get(dia) && <p className="px-4 pt-3 text-sm font-semibold text-red-700">Feriado nacional: {fer.get(dia)}</p>}
            {delDia(dia).length ? <ListaEventos lista={delDia(dia)} /> : !fer.get(dia) && <p className="px-4 py-4 text-sm text-tinta-suave">No hay eventos este día.</p>}
            {fer.get(dia) && !delDia(dia).length && <div className="pb-3" />}
          </Tarjeta>
        </section>

        {proximos.length > 0 && (
          <section className="space-y-2">
            <h2 className="etiqueta px-1">Próximos eventos</h2>
            <Tarjeta className="overflow-hidden"><ListaEventos lista={proximos} /></Tarjeta>
          </section>
        )}
      </Contenido>
      {editando && <EditorEvento evento={editando} fechaInicial={dia} gestion={gestion} secciones={datos.mias.map((s) => ({ id: s.id, nombre: s.nombreLargo }))} onCerrar={() => setEditando(null)} />}
    </>
  );
}

function EditorEvento({ evento, fechaInicial, gestion, secciones, onCerrar }: {
  evento: Evento | "nuevo"; fechaInicial: string; gestion: boolean; secciones: { id: string; nombre: string }[]; onCerrar(): void;
}) {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const base = evento === "nuevo" ? null : evento;
  const [titulo, setTitulo] = useState(base?.titulo ?? "");
  const [tipo, setTipo] = useState<TipoEvento>(base?.tipo ?? "actividad");
  const [fecha, setFecha] = useState(base?.fecha ?? fechaInicial);
  const [fechaFin, setFechaFin] = useState(base?.fecha_fin ?? "");
  const [hora, setHora] = useState(base?.hora ?? "");
  const [seccion, setSeccion] = useState(base ? base.seccion_id ?? "" : gestion ? "" : secciones[0]?.id ?? "");
  const [descripcion, setDescripcion] = useState(base?.descripcion ?? "");
  const [guardando, setGuardando] = useState(false);
  const valido = titulo.trim() && fecha && (!fechaFin || fechaFin >= fecha) && (gestion || seccion);

  const guardarEvento = async (eliminar = false) => {
    setGuardando(true);
    try {
      await guardar(db, "evento", eliminar && base ? { id: base.id, eliminado: true } : {
        id: base?.id ?? nuevoId(), autor_id: base?.autor_id ?? usuario!.id, seccion_id: seccion || null, tipo, titulo: titulo.trim(),
        descripcion: descripcion.trim() || null, fecha, fecha_fin: fechaFin && fechaFin !== fecha ? fechaFin : null, hora: hora || null,
      }, colegioId);
      avisar(textoGuardado(eliminar ? "Evento eliminado" : base ? "Evento actualizado" : "Evento publicado"));
      onCerrar();
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo abierto titulo={base ? "Editar evento" : "Nuevo evento"} onCerrar={onCerrar}
      acciones={<>
        {base && <Boton variante="fantasma" icono={Trash2} onClick={() => void guardarEvento(true)}>Eliminar</Boton>}
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        <Boton icono={Save} cargando={guardando} disabled={!valido} onClick={() => void guardarEvento()}>{base ? "Guardar" : "Publicar"}</Boton>
      </>}>
      <div className="space-y-3 pt-2 text-tinta">
        <Campo etiqueta="Título"><Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Reunión de padres del IV bimestre" autoFocus /></Campo>
        <div>
          <span className="mb-1.5 block text-sm font-semibold">Tipo</span>
          <Segmentado etiqueta="Tipo" valor={tipo} onCambio={setTipo} opciones={(Object.keys(TIPO_EVENTO) as TipoEvento[]).map((t) => ({ valor: t, texto: TIPO_EVENTO[t] }))} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Fecha"><Entrada type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
          <Campo etiqueta="Hasta (opcional)" error={fechaFin && fechaFin < fecha ? "Antes del inicio" : null}><Entrada type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} /></Campo>
          <Campo etiqueta="Hora (opcional)"><Entrada type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></Campo>
        </div>
        <Campo etiqueta="Para">
          <Selector value={seccion} onChange={(e) => setSeccion(e.target.value)}>
            {gestion && <option value="">Todo el colegio</option>}
            {secciones.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </Selector>
        </Campo>
        <Campo etiqueta="Detalle (opcional)">
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} className="campo resize-y" placeholder="Lugar, qué traer, temas de la evaluación..." />
        </Campo>
      </div>
    </Dialogo>
  );
}
