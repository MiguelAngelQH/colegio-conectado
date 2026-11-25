// Tareas: el docente las deja por curso con fecha de entrega; el estudiante y la familia las ven
// (y reciben el aviso), y el estudiante las marca como hechas en su equipo.
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BookCheck, CircleCheck, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { hoyLocal } from "@/datos/asistencia";
import { anioActivo, matriculaActual, seccionesDetalle } from "@/datos/consultas";
import { useHijos } from "@/datos/familia";
import { nuevoId } from "@/db/local";
import { guardar, vivas } from "@/db/repositorio";
import type { Tarea } from "@/db/tipos";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Boton, Contenido, Dialogo, Encabezado, Tarjeta, cx } from "@/ui/componentes";
import { Campo, Entrada, Selector, Vacio } from "@/ui/formulario";

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
  const claveHechas = `cc.tareasHechas.${usuario?.id}`;
  const [hechas, setHechas] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem(claveHechas) ?? "[]")));
  const alternar = (id: string) => {
    const n = new Set(hechas);
    if (n.has(id)) n.delete(id); else n.add(id);
    setHechas(n);
    localStorage.setItem(claveHechas, JSON.stringify([...n]));
  };

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
    return { cursos, tareas, areas, seccionFamilia };
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
    const hecha = hechas.has(t.id);
    return (
      <div className="flex items-start gap-3 px-4 py-3">
        {familia ? (
          <button onClick={() => alternar(t.id)} aria-pressed={hecha} aria-label={hecha ? "Marcar como pendiente" : "Marcar como hecha"}
            className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-2 transition", hecha ? "bg-emerald-500 text-white ring-emerald-500" : "ring-tinta-suave/40")}>
            {hecha && <CircleCheck className="h-5 w-5" aria-hidden />}
          </button>
        ) : <BookCheck className="mt-1 h-5 w-5 shrink-0 text-sky-700" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className={cx("font-semibold", hecha && "text-tinta-suave line-through")}>{t.titulo}</p>
          <p className="text-xs text-tinta-suave">
            {familia ? `${datos.areas.get(t.area_id) ?? "Clase"} · ` : ""}Entrega: <strong className={cx(t.entrega === hoy && "text-amber-700")}>{t.entrega === hoy ? "hoy" : fecha(t.entrega)}</strong>
          </p>
          {t.descripcion && <p className="mt-1 whitespace-pre-line text-sm">{t.descripcion}</p>}
        </div>
        {!familia && (gestion || t.docente_id === usuario?.id) && (
          <Boton variante="fantasma" icono={Pencil} className="!min-h-9 !px-3" onClick={() => setEditando(t)}>Editar</Boton>
        )}
      </div>
    );
  };

  return (
    <>
      <Encabezado etiqueta="Clases" titulo="Tareas" subtitulo={!familia ? "Deje tareas a sus secciones: la familia recibe el aviso." : esApoderado ? `Lo que dejaron los docentes de ${hijo?.nombres.split(" ")[0] ?? "su hijo(a)"} y cuándo entregarlo.` : "Lo que dejaron tus docentes y cuándo hay que entregarlo."}
        accion={!familia && curso ? <Boton icono={Plus} onClick={() => setEditando("nueva")}>Nueva tarea</Boton> : undefined} />
      <Contenido ancho="max-w-3xl">
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
                <Tarjeta className="divide-y divide-white/70">{pendientes.map((t) => <Item key={t.id} t={t} />)}</Tarjeta>
              </section>
            )}
            {pasadas.length > 0 && (
              <section className="space-y-2">
                <h2 className="etiqueta px-1">Anteriores</h2>
                <Tarjeta className="divide-y divide-white/70 opacity-80">{pasadas.slice(0, 30).map((t) => <Item key={t.id} t={t} />)}</Tarjeta>
              </section>
            )}
          </>
        )}
      </Contenido>
      {editando && curso && <EditorTarea tarea={editando} curso={curso} onCerrar={() => setEditando(null)} />}
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
