// Tareas: el docente las deja por curso con fecha de entrega; el estudiante y la familia las ven
// (y reciben el aviso), y el estudiante las marca como hechas en su equipo.
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BookCheck, CircleCheck, Inbox, Pencil, Plus, RotateCcw, Save, Send, Trash2, Upload } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { hoyLocal } from "@/datos/asistencia";
import { anioActivo, matriculaActual, seccionesDetalle } from "@/datos/consultas";
import { useHijos } from "@/datos/familia";
import { nuevoId } from "@/db/local";
import { guardar, vivas } from "@/db/repositorio";
import type { Estudiante, Tarea, TareaEntrega } from "@/db/tipos";
import { idDeterministico } from "@/dominio/notas";
import { Evidencias } from "@/ui/Evidencias";
import { ahoraServidor } from "@/sync/reloj";
import { estudiantesDeSeccion, nombreCompleto } from "@/datos/consultas";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Boton, Contenido, Dialogo, Encabezado, Tarjeta, cx } from "@/ui/componentes";
import { Campo, Entrada, Selector, Vacio } from "@/ui/formulario";

const ESTADO_ENTREGA: Record<TareaEntrega["estado"], { texto: string; clase: string }> = {
  entregada: { texto: "Entregada", clase: "bg-sky-100/80 text-sky-800" },
  revisada: { texto: "Revisada", clase: "bg-emerald-100/80 text-emerald-800" },
  devuelta: { texto: "Devuelta para corregir", clase: "bg-amber-100/80 text-amber-800" },
};

const fecha = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

interface Curso { id: string; seccionId: string; areaId: string; titulo: string }

export function Tareas() {
  const { usuario } = useApp();
  const { hijo } = useHijos(usuario);
  const docente = !!usuario?.roles.some((r) => r === "docente" || r === "tutor");
  const gestion = !!usuario?.roles.some((r) => r === "director" || r === "subdirector");
  const familia = !docente && !gestion;
  const esApoderado = !!usuario?.roles.includes("apoderado");
  const [cursoId, setCursoId] = useState("");
  const [editando, setEditando] = useState<Tarea | "nueva" | null>(null);
  const [entregando, setEntregando] = useState<Tarea | null>(null);
  const [revisando, setRevisando] = useState<Tarea | null>(null);

  const datos = useLiveQuery(async () => {
    if (!usuario) return null;
    const anio = await anioActivo();
    const secciones = anio ? await seccionesDetalle(anio.id) : [];
    const areas = new Map((await db.tabla("area").toArray()).map((a) => [a.id, a.nombre]));
    const asig = vivas(await db.tabla("docente_asignacion").toArray()).filter((a) => gestion || a.docente_id === usuario.id);
    const cursos: Curso[] = asig.map((a) => ({ id: a.id, seccionId: a.seccion_id, areaId: a.area_id, titulo: `${areas.get(a.area_id) ?? "Área"} · ${secciones.find((s) => s.id === a.seccion_id)?.nombre ?? ""}` }))
      .filter((c) => secciones.some((s) => s.id === c.seccionId));
    let seccionFamilia: string | null = null;
    if (familia && hijo) seccionFamilia = (await matriculaActual(hijo.id))?.seccion_id ?? null;
    const tareas = vivas(await db.tabla("tarea").toArray()).sort((a, b) => b.entrega.localeCompare(a.entrega));
    const entregas = vivas(await db.tabla("tarea_entrega").toArray());
    return { cursos, tareas, areas, seccionFamilia, entregas };
  }, [usuario?.id, hijo?.id, gestion, familia]);

  useEffect(() => {
    if (datos?.cursos[0] && !cursoId) setCursoId(datos.cursos[0].id);
  }, [datos, cursoId]);

  if (!datos) return null;
  const curso = datos.cursos.find((c) => c.id === cursoId);
  const lista = familia
    ? datos.tareas.filter((t) => t.seccion_id === datos.seccionFamilia)
    : datos.tareas.filter((t) => curso && t.seccion_id === curso.seccionId && t.area_id === curso.areaId);
  const hoy = hoyLocal();
  const pendientes = lista.filter((t) => t.entrega >= hoy).sort((a, b) => a.entrega.localeCompare(b.entrega));
  const pasadas = lista.filter((t) => t.entrega < hoy);

  const Item = ({ t }: { t: Tarea }) => {
    const mia = familia && hijo ? datos.entregas.find((x) => x.tarea_id === t.id && x.estudiante_id === hijo.id) : undefined;
    const hecha = mia?.estado === "revisada";
    const recibidas = datos.entregas.filter((x) => x.tarea_id === t.id).length;
    return (
      <div className="flex items-start gap-3 px-4 py-3">
        {familia
          ? <CircleCheck className={cx("mt-1 h-5 w-5 shrink-0", mia ? "text-emerald-600" : "text-tinta-suave/40")} aria-hidden />
          : <BookCheck className="mt-1 h-5 w-5 shrink-0 text-sky-700" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className={cx("font-semibold", hecha && "text-tinta-suave")}>{t.titulo}</p>
          <p className="text-xs text-tinta-suave">
            {familia ? `${datos.areas.get(t.area_id) ?? "Clase"} · ` : ""}Entrega: <strong className={cx(t.entrega === hoy && "text-amber-700")}>{t.entrega === hoy ? "hoy" : fecha(t.entrega)}</strong>
          </p>
          {t.descripcion && <p className="mt-1 whitespace-pre-line text-sm">{t.descripcion}</p>}
          {familia && mia && (
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span className={cx("rounded-full px-2 py-0.5 font-bold", ESTADO_ENTREGA[mia.estado].clase)}>{ESTADO_ENTREGA[mia.estado].texto}</span>
              {mia.revision && <span className="text-tinta-suave">Docente: {mia.revision}</span>}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {familia && hijo && (!mia || mia.estado === "devuelta") && (
            <Boton variante={mia ? "vidrio" : "primario"} icono={Upload} className="!min-h-9 !px-3" onClick={() => setEntregando(t)}>{mia ? "Corregir" : "Entregar"}</Boton>
          )}
          {familia && mia && mia.estado === "entregada" && (
            <Boton variante="fantasma" className="!min-h-9 !px-3" onClick={() => setEntregando(t)}>Ver entrega</Boton>
          )}
          {!familia && (
            <Boton variante="vidrio" icono={Inbox} className="!min-h-9 !px-3" onClick={() => setRevisando(t)}>{recibidas === 1 ? "1 entrega" : `${recibidas} entregas`}</Boton>
          )}
          {!familia && (gestion || t.docente_id === usuario?.id) && (
            <Boton variante="fantasma" icono={Pencil} className="!min-h-9 !px-3" onClick={() => setEditando(t)}>Editar</Boton>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <Encabezado etiqueta="Clases" titulo="Tareas" subtitulo={!familia ? "Deje tareas a sus secciones: la familia recibe el aviso." : esApoderado ? `Lo que dejaron los docentes de ${hijo?.nombres.split(" ")[0] ?? "su hijo(a)"} y cuándo entregarlo.` : "Lo que dejaron tus docentes y cuándo hay que entregarlo."}
        accion={!familia && curso ? <Boton icono={Plus} onClick={() => setEditando("nueva")}>Nueva tarea</Boton> : undefined} />
      <Contenido>
        {!familia && (
          datos.cursos.length === 0
            ? <Vacio icono={BookCheck} titulo="No tiene cursos asignados">La dirección debe asignarle áreas y secciones.</Vacio>
            : (
              <Tarjeta className="aparecer p-4">
                <Campo etiqueta="Curso">
                  <Selector value={cursoId} onChange={(e) => setCursoId(e.target.value)}>
                    {datos.cursos.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                  </Selector>
                </Campo>
              </Tarjeta>
            )
        )}
        {lista.length === 0 ? (
          <Vacio icono={BookCheck} tono="tono-cielo" titulo={familia ? "No hay tareas por ahora" : "Este curso aún no tiene tareas"} />
        ) : (
          <>
            {pendientes.length > 0 && (
              <section className="space-y-2">
                <h2 className="etiqueta px-1">Por entregar</h2>
                <Tarjeta className="divide-y divide-sup/70">{pendientes.map((t) => <Item key={t.id} t={t} />)}</Tarjeta>
              </section>
            )}
            {pasadas.length > 0 && (
              <section className="space-y-2">
                <h2 className="etiqueta px-1">Anteriores</h2>
                <Tarjeta className="divide-y divide-sup/70 opacity-80">{pasadas.slice(0, 30).map((t) => <Item key={t.id} t={t} />)}</Tarjeta>
              </section>
            )}
          </>
        )}
      </Contenido>
      {editando && curso && <EditorTarea tarea={editando} curso={curso} onCerrar={() => setEditando(null)} />}
      {entregando && hijo && <DialogoEntrega tarea={entregando} estudianteId={hijo.id} entrega={datos.entregas.find((x) => x.tarea_id === entregando.id && x.estudiante_id === hijo.id)} onCerrar={() => setEntregando(null)} />}
      {revisando && <DialogoEntregas tarea={revisando} entregas={datos.entregas.filter((x) => x.tarea_id === revisando.id)} onCerrar={() => setRevisando(null)} />}
    </>
  );
}

function EditorTarea({ tarea, curso, onCerrar }: { tarea: Tarea | "nueva"; curso: Curso; onCerrar(): void }) {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const base = tarea === "nueva" ? null : tarea;
  const [titulo, setTitulo] = useState(base?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(base?.descripcion ?? "");
  const [entrega, setEntrega] = useState(base?.entrega ?? hoyLocal());
  const [guardando, setGuardando] = useState(false);

  const guardarTarea = async (eliminar = false) => {
    setGuardando(true);
    try {
      await guardar(db, "tarea", eliminar && base ? { id: base.id, eliminado: true } : {
        id: base?.id ?? nuevoId(), seccion_id: curso.seccionId, area_id: curso.areaId, docente_id: base?.docente_id ?? usuario!.id,
        titulo: titulo.trim(), descripcion: descripcion.trim() || null, entrega,
      }, colegioId);
      avisar(textoGuardado(eliminar ? "Tarea eliminada" : base ? "Tarea actualizada" : "Tarea publicada"));
      onCerrar();
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo abierto titulo={base ? "Editar tarea" : `Nueva tarea · ${curso.titulo}`} onCerrar={onCerrar}
      acciones={<>
        {base && <Boton variante="fantasma" icono={Trash2} onClick={() => void guardarTarea(true)}>Eliminar</Boton>}
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        <Boton icono={Save} cargando={guardando} disabled={!titulo.trim() || !entrega} onClick={() => void guardarTarea()}>{base ? "Guardar" : "Publicar"}</Boton>
      </>}>
      <div className="space-y-3 pt-2 text-tinta">
        <Campo etiqueta="Título"><Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Resolver la ficha 12 de fracciones" autoFocus /></Campo>
        <Campo etiqueta="Fecha de entrega"><Entrada type="date" value={entrega} onChange={(e) => setEntrega(e.target.value)} /></Campo>
        <Campo etiqueta="Indicaciones (opcional)">
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={4} className="campo resize-y" placeholder="Qué deben hacer, materiales, cómo entregarlo" />
        </Campo>
      </div>
    </Dialogo>
  );
}

/** La familia entrega la tarea: comentario y fotos o archivos (se pueden agregar después de enviar). */
function DialogoEntrega({ tarea, estudianteId, entrega, onCerrar }: { tarea: Tarea; estudianteId: string; entrega: TareaEntrega | undefined; onCerrar(): void }) {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const [comentario, setComentario] = useState(entrega?.comentario ?? "");
  const [enviada, setEnviada] = useState<string | null>(entrega && entrega.estado !== "devuelta" ? entrega.id : null);
  const [guardando, setGuardando] = useState(false);

  const enviar = async () => {
    setGuardando(true);
    try {
      const id = entrega?.id ?? (await idDeterministico("entrega", tarea.id, estudianteId));
      await guardar(db, "tarea_entrega", entrega
        ? { id, comentario: comentario.trim() || null, estado: "entregada", entregado_en: new Date(ahoraServidor()).toISOString() }
        : { id, tarea_id: tarea.id, estudiante_id: estudianteId, autor_id: usuario!.id, comentario: comentario.trim() || null,
            entregado_en: new Date(ahoraServidor()).toISOString(), estado: "entregada", revision: null, revisado_por: null }, colegioId);
      setEnviada(id);
      avisar(textoGuardado("Tarea entregada"));
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo abierto titulo={enviada ? "Tarea entregada" : `Entregar: ${tarea.titulo}`} onCerrar={onCerrar}
      acciones={enviada ? <Boton onClick={onCerrar}>Listo</Boton> : <>
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        <Boton icono={Send} cargando={guardando} onClick={enviar}>Entregar</Boton>
      </>}>
      <div className="space-y-3 pt-2 text-tinta">
        {entrega?.estado === "devuelta" && entrega.revision && <p className="rounded-2xl bg-amber-50/80 p-3 text-sm ring-1 ring-amber-200">El docente pidió corregir: {entrega.revision}</p>}
        {enviada ? (
          <>
            <p className="text-sm text-tinta-suave">Agregue fotos de su cuaderno o archivos del trabajo. Si no hay señal, se envían cuando vuelva la conexión.</p>
            <Evidencias entidad="tarea_entrega" entidadId={enviada} estudianteId={estudianteId} />
          </>
        ) : (
          <Campo etiqueta="Comentario para el docente (opcional)">
            <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} className="campo resize-y" placeholder="Por ejemplo: resolví las preguntas 1 a 5" />
          </Campo>
        )}
      </div>
    </Dialogo>
  );
}

/** El docente ve quién entregó y revisa cada entrega. */
function DialogoEntregas({ tarea, entregas, onCerrar }: { tarea: Tarea; entregas: TareaEntrega[]; onCerrar(): void }) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [viendo, setViendo] = useState<TareaEntrega | null>(null);
  const [revision, setRevision] = useState("");
  const estudiantes = useLiveQuery(() => estudiantesDeSeccion(tarea.seccion_id), [tarea.seccion_id]) ?? [];
  const porEst = new Map(entregas.map((x) => [x.estudiante_id, x]));

  const revisar = async (estado: "revisada" | "devuelta") => {
    if (!viendo) return;
    try {
      await guardar(db, "tarea_entrega", { id: viendo.id, estado, revision: revision.trim() || null }, colegioId);
      avisar(textoGuardado(estado === "revisada" ? "Entrega revisada" : "Entrega devuelta para corregir"));
      setViendo(null);
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    }
  };

  if (viendo) {
    const est = estudiantes.find((e) => e.id === viendo.estudiante_id);
    return (
      <Dialogo tam="grande" abierto titulo={est ? nombreCompleto(est) : "Entrega"} onCerrar={() => setViendo(null)}
        acciones={<>
          <Boton variante="fantasma" onClick={() => setViendo(null)}>Volver</Boton>
          <Boton variante="vidrio" icono={RotateCcw} onClick={() => void revisar("devuelta")}>Devolver para corregir</Boton>
          <Boton icono={CircleCheck} onClick={() => void revisar("revisada")}>Marcar revisada</Boton>
        </>}>
        <div className="space-y-3 pt-2 text-tinta">
          <p className="text-xs text-tinta-suave">Entregada el {new Date(viendo.entregado_en).toLocaleString("es-PE", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
          {viendo.comentario && <p className="rounded-2xl bg-sup/60 p-3 text-sm ring-1 ring-sup">{viendo.comentario}</p>}
          <Evidencias entidad="tarea_entrega" entidadId={viendo.id} estudianteId={viendo.estudiante_id} editable={false} />
          <Campo etiqueta="Devolución para el estudiante (opcional)">
            <textarea value={revision} onChange={(e) => setRevision(e.target.value)} rows={2} className="campo resize-y" placeholder="Muy bien resuelto; revisa el ejercicio 3" />
          </Campo>
        </div>
      </Dialogo>
    );
  }

  return (
    <Dialogo tam="grande" abierto titulo={`Entregas: ${tarea.titulo}`} onCerrar={onCerrar} acciones={<Boton onClick={onCerrar}>Cerrar</Boton>}>
      <div className="pt-2 text-tinta">
        <p className="mb-2 text-sm text-tinta-suave">{entregas.length} de {estudiantes.length} entregaron.</p>
        <div className="max-h-96 divide-y divide-sup/70 overflow-y-auto rounded-2xl bg-sup/40">
          {estudiantes.map((e: Estudiante) => {
            const x = porEst.get(e.id);
            return (
              <button key={e.id} disabled={!x} onClick={() => { if (x) { setViendo(x); setRevision(x.revision ?? ""); } }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm enabled:hover:bg-sup/60">
                <span className="font-semibold">{nombreCompleto(e)}</span>
                <span className={cx("rounded-full px-2 py-0.5 text-[0.65rem] font-bold", x ? ESTADO_ENTREGA[x.estado].clase : "bg-slate-100/80 text-slate-600")}>
                  {x ? ESTADO_ENTREGA[x.estado].texto : "Sin entregar"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Dialogo>
  );
}
