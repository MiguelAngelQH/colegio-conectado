import { useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ClipboardCheck, ListChecks, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useApp } from "@/app/contexto";
import { guardarLista, listasDelCurso, marcarCriterio, pasarAlRegistro } from "@/datos/cotejo";
import { hoyLocal } from "@/datos/asistencia";
import { nombreCompleto } from "@/datos/consultas";
import type { Competencia, CriterioCotejo, Estudiante, ListaCotejo } from "@/db/tipos";
import { capacidadesDe } from "@/dominio/capacidades";
import { NIVELES } from "@/dominio/notas";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Aviso, Boton, Dialogo, Tarjeta, cx } from "@/ui/componentes";
import { Campo, Entrada, Selector, Vacio } from "@/ui/formulario";
import { ChipNivel } from "./RegistroNotas";

interface Props {
  seccionId: string; areaId: string; periodoId: string;
  estudiantes: Estudiante[]; competencias: Competencia[]; bloqueado: boolean;
}

/** Listas de cotejo por sesión de aprendizaje, como las hojas S.. del registro auxiliar del colegio. */
export function ListasCotejo(p: Props) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [editando, setEditando] = useState<ListaCotejo | "nueva" | null>(null);
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [pasando, setPasando] = useState(false);
  const listas = useLiveQuery(() => listasDelCurso(p.seccionId, p.areaId, p.periodoId), [p.seccionId, p.areaId, p.periodoId]);
  if (!listas) return null;
  const abierta = listas.find((l) => l.id === abiertaId);

  const pasar = async () => {
    setPasando(true);
    try {
      const n = await pasarAlRegistro(p, colegioId);
      avisar(textoGuardado(n ? `Se actualizaron ${n} notas del registro` : "No hay criterios calificados para pasar"));
      setConfirmar(false);
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setPasando(false);
    }
  };

  if (abierta) {
    return <CalificarLista lista={abierta} {...p} onVolver={() => setAbiertaId(null)} onEditar={() => setEditando(abierta)} editor={editando ? <EditorLista {...p} lista={editando} onCerrar={() => setEditando(null)} /> : null} />;
  }

  const llenado = (l: ListaCotejo) => {
    const total = l.criterios.length * p.estudiantes.length;
    const hechas = p.estudiantes.reduce((s, e) => s + Object.keys(l.notas[e.id] ?? {}).length, 0);
    return total ? Math.round((hechas / total) * 100) : 0;
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-1">
        <p className="min-w-0 flex-1 text-sm text-tinta-suave">
          Registre cada sesión con sus criterios de evaluación. Al final del bimestre, "Pasar al registro" calcula cada capacidad con el promedio de sus criterios.
        </p>
        {!p.bloqueado && <Boton icono={Plus} onClick={() => setEditando("nueva")}>Nueva sesión</Boton>}
        {!p.bloqueado && listas.length > 0 && <Boton variante="vidrio" icono={Upload} onClick={() => setConfirmar(true)}>Pasar al registro</Boton>}
      </div>
      {listas.length === 0 ? (
        <Vacio icono={ListChecks} tono="tono-cielo" titulo="Aún no hay sesiones en este bimestre">Cree la primera con sus criterios de evaluación.</Vacio>
      ) : (
        <Tarjeta className="divide-y divide-white/70 overflow-hidden">
          {listas.map((l) => (
            <button key={l.id} onClick={() => setAbiertaId(l.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/40">
              <span className="titulo-display flex h-10 w-12 shrink-0 items-center justify-center rounded-xl bg-white/70 text-sm font-bold ring-1 ring-white">{l.numero ? `S${l.numero}` : "S"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{l.titulo}</span>
                <span className="block text-xs text-tinta-suave">
                  {new Date(`${l.fecha}T12:00:00`).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" })} · {l.criterios.length} {l.criterios.length === 1 ? "criterio" : "criterios"}
                </span>
              </span>
              <span className={cx("rounded-full px-2.5 py-1 text-[0.65rem] font-bold", llenado(l) === 100 ? "bg-emerald-100/80 text-emerald-800" : "bg-sky-100/80 text-sky-800")}>{llenado(l)}%</span>
            </button>
          ))}
        </Tarjeta>
      )}
      {editando && <EditorLista {...p} lista={editando} onCerrar={(id) => { setEditando(null); if (id) setAbiertaId(id); }} />}
      {confirmar && (
        <Dialogo abierto titulo="Pasar al registro de notas" onCerrar={() => setConfirmar(false)}
          acciones={<><Boton variante="fantasma" onClick={() => setConfirmar(false)}>Cancelar</Boton><Boton icono={Upload} cargando={pasando} onClick={pasar}>Pasar al registro</Boton></>}>
          <p className="pt-1 text-sm text-tinta">
            Cada capacidad evaluada en estas {listas.length} sesiones recibirá el promedio de sus criterios (AD=3, A=2, B=1, C=0, redondeado), y el logro de la competencia se recalculará.
            Las capacidades sin criterios no cambian. Puede repetirlo cuantas veces quiera.
          </p>
        </Dialogo>
      )}
    </>
  );
}

function CalificarLista({ lista, estudiantes, competencias, bloqueado, onVolver, onEditar, editor }: Props & { lista: ListaCotejo; onVolver(): void; onEditar(): void; editor: ReactNode }) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [criterio, setCriterio] = useState(0);
  const c = lista.criterios[criterio];
  const comp = c ? competencias.find((x) => x.id === c.competencia_id) : undefined;
  const marcar = (e: string, nv: (typeof NIVELES)[number]) =>
    marcarCriterio(lista.id, e, criterio, nv, colegioId).catch((err) => avisar(err instanceof Error ? err.message : String(err), "error"));

  return (
    <>
      <Tarjeta className="aparecer space-y-1 p-4">
        <div className="flex items-start gap-2">
          <Boton variante="fantasma" icono={ArrowLeft} onClick={onVolver} className="!min-h-9 !px-3">Sesiones</Boton>
          <span className="flex-1" />
          {!bloqueado && <Boton variante="vidrio" icono={Pencil} onClick={onEditar} className="!min-h-9 !px-3">Editar</Boton>}
        </div>
        <p className="titulo-display text-lg font-bold">{lista.numero ? `S${lista.numero} · ` : ""}{lista.titulo}</p>
        <p className="text-xs text-tinta-suave">
          {new Date(`${lista.fecha}T12:00:00`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}
          {lista.experiencia ? ` · Experiencia: ${lista.experiencia}` : ""}{lista.evidencia ? ` · Evidencia: ${lista.evidencia}` : ""}
        </p>
      </Tarjeta>
      {lista.criterios.length === 0 ? (
        <Aviso tipo="alerta">Esta sesión no tiene criterios. Use "Editar" para agregarlos.</Aviso>
      ) : (
        <>
          <div className="-mx-4 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Criterios">
            <div className="flex w-max gap-2">
              {lista.criterios.map((_, i) => (
                <button key={i} role="tab" aria-selected={i === criterio} onClick={() => setCriterio(i)}
                  className={cx("min-h-11 rounded-full px-4 text-sm font-semibold transition", i === criterio ? "vidrio-laguna" : "vidrio !rounded-full text-tinta-suave")}>
                  Criterio {i + 1}
                </button>
              ))}
            </div>
          </div>
          <div className="px-1">
            <p className="text-sm font-semibold leading-snug">{c.texto}</p>
            <p className="text-xs text-tinta-suave">{comp?.nombre}{comp && c.capacidad ? ` · Capacidad ${c.capacidad}: ${capacidadesDe(comp)[c.capacidad - 1] ?? ""}` : ""}</p>
          </div>
          <Tarjeta className="divide-y divide-white/70 overflow-hidden">
            {estudiantes.map((e, i) => (
              <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
                <span className="w-5 shrink-0 text-right text-xs text-tinta-suave">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{nombreCompleto(e)}</span>
                <div className="flex gap-1.5">
                  {NIVELES.map((nv) => (
                    <ChipNivel key={nv} nivel={nv} pequeno activo={lista.notas[e.id]?.[String(criterio)] === nv} deshabilitado={bloqueado} onClick={() => void marcar(e.id, nv)} />
                  ))}
                </div>
              </div>
            ))}
          </Tarjeta>
        </>
      )}
      {editor}
    </>
  );
}

function EditorLista({ lista, seccionId, areaId, periodoId, competencias, onCerrar }: Props & { lista: ListaCotejo | "nueva"; onCerrar(id?: string): void }) {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const base = lista === "nueva" ? null : lista;
  const [numero, setNumero] = useState(base?.numero ? String(base.numero) : "");
  const [titulo, setTitulo] = useState(base?.titulo ?? "");
  const [fecha, setFecha] = useState(base?.fecha ?? hoyLocal());
  const [experiencia, setExperiencia] = useState(base?.experiencia ?? "");
  const [evidencia, setEvidencia] = useState(base?.evidencia ?? "");
  const [criterios, setCriterios] = useState<CriterioCotejo[]>(base?.criterios ?? [{ competencia_id: competencias[0]?.id ?? "", capacidad: 1, texto: "" }]);
  const [guardando, setGuardando] = useState(false);
  const valido = titulo.trim() && fecha && criterios.every((c) => c.texto.trim() && c.competencia_id);
  const cambiar = (i: number, cambios: Partial<CriterioCotejo>) => setCriterios(criterios.map((c, k) => (k === i ? { ...c, ...cambios } : c)));

  const guardarTodo = async () => {
    setGuardando(true);
    try {
      const id = await guardarLista({
        ...(base ? { id: base.id } : {}), seccion_id: seccionId, area_id: areaId, periodo_id: periodoId, docente_id: base?.docente_id ?? usuario!.id,
        numero: numero ? Number(numero) : null, titulo: titulo.trim(), fecha, experiencia: experiencia.trim() || null, evidencia: evidencia.trim() || null,
        criterios: criterios.map((c) => ({ ...c, texto: c.texto.trim() })),
      }, colegioId);
      avisar(textoGuardado(base ? "Sesión actualizada" : "Sesión creada"));
      onCerrar(base ? undefined : id);
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo abierto titulo={base ? "Editar sesión" : "Nueva sesión"} onCerrar={() => onCerrar()}
      acciones={<><Boton variante="fantasma" onClick={() => onCerrar()}>Cancelar</Boton><Boton icono={ClipboardCheck} cargando={guardando} disabled={!valido} onClick={guardarTodo}>Guardar</Boton></>}>
      <div className="space-y-3 pt-2 text-tinta">
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
          <Campo etiqueta="Sesión N.°"><Entrada inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="26" /></Campo>
          <Campo etiqueta="Fecha"><Entrada type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
        </div>
        <Campo etiqueta="Título de la sesión"><Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Resolviendo problemas con conjuntos" /></Campo>
        <Campo etiqueta="Experiencia de aprendizaje (opcional)"><Entrada value={experiencia} onChange={(e) => setExperiencia(e.target.value)} placeholder="8" /></Campo>
        <Campo etiqueta="Evidencia de aprendizaje (opcional)"><Entrada value={evidencia} onChange={(e) => setEvidencia(e.target.value)} placeholder="Resuelve problemas de conjuntos y diagrama de Carroll" /></Campo>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Criterios de evaluación</p>
          {criterios.map((c, i) => {
            const comp = competencias.find((x) => x.id === c.competencia_id);
            const caps = comp ? capacidadesDe(comp) : [];
            return (
              <div key={i} className="space-y-2 rounded-2xl bg-white/50 p-3 ring-1 ring-white">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-tinta-suave">{i + 1}.</span>
                  <Entrada value={c.texto} onChange={(e) => cambiar(i, { texto: e.target.value })} placeholder="Identifica los elementos de un conjunto" aria-label={`Criterio ${i + 1}`} />
                  {criterios.length > 1 && (
                    <button type="button" onClick={() => setCriterios(criterios.filter((_, k) => k !== i))} className="rounded-full p-2 text-red-700 hover:bg-white/70" aria-label={`Quitar criterio ${i + 1}`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Selector value={c.competencia_id} onChange={(e) => cambiar(i, { competencia_id: e.target.value, capacidad: 1 })} aria-label="Competencia">
                    {competencias.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                  </Selector>
                  <Selector value={c.capacidad ?? ""} onChange={(e) => cambiar(i, { capacidad: e.target.value ? Number(e.target.value) : null })} aria-label="Capacidad">
                    {caps.map((t, k) => <option key={t} value={k + 1}>{k + 1}. {t}</option>)}
                    <option value="">Sin capacidad (no pasa al registro)</option>
                  </Selector>
                </div>
              </div>
            );
          })}
          <Boton variante="vidrio" icono={Plus} onClick={() => setCriterios([...criterios, { competencia_id: criterios[criterios.length - 1]?.competencia_id ?? competencias[0]?.id ?? "", capacidad: 1, texto: "" }])}>Agregar criterio</Boton>
        </div>
      </div>
    </Dialogo>
  );
}
