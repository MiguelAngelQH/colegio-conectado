import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { BookOpenCheck, ClipboardList, FileSpreadsheet, Lock, MessageSquarePlus, PenLine, Save } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { nombreCompleto, seccionesDetalle, anioActivo } from "@/datos/consultas";
import { descargarRegistroAuxiliar } from "@/datos/formatos-colegio";
import { guardarCapacidad, guardarNota } from "@/datos/notas";
import { capacidadesDe } from "@/dominio/capacidades";
import { ListasCotejo } from "./ListasCotejo";
import { guardar, vivas } from "@/db/repositorio";
import type { Calificacion, Competencia, Estudiante, NivelLogro, Observacion, Periodo } from "@/db/tipos";
import { DESCRIPCION_NIVEL, NIVELES, PLANTILLAS_CONCLUSION, faltaConclusion, requiereConclusion } from "@/dominio/notas";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { NIVEL_HEX, NIVEL_TEXTO } from "@/ui/colores-niveles";
import { Aviso, Boton, Contenido, Dialogo, Tarjeta, cx, orden } from "@/ui/componentes";
import { Campo, Segmentado, Selector, Vacio } from "@/ui/formulario";

export function ChipNivel({ nivel, activo, onClick, deshabilitado, pequeno }: { nivel: NivelLogro; activo: boolean; onClick?: () => void; deshabilitado?: boolean; pequeno?: boolean }) {
  // Colores de nivel validados para daltonismo (ver ui/graficos.tsx). La letra siempre se muestra.
  const estilo = activo
    ? { background: NIVEL_HEX[nivel], color: NIVEL_TEXTO[nivel], boxShadow: `0 6px 14px -6px ${NIVEL_HEX[nivel]}` }
    : { boxShadow: `inset 0 0 0 2px ${NIVEL_HEX[nivel]}55` };
  return (
    <button type="button" onClick={onClick} disabled={deshabilitado} aria-pressed={activo} aria-label={`${nivel}: ${DESCRIPCION_NIVEL[nivel].nombre}`} style={estilo}
      className={cx("titulo-display shrink-0 rounded-xl font-bold transition active:scale-90 disabled:active:scale-100",
        pequeno ? "h-8 w-8 text-xs" : "h-11 w-11 text-sm",
        !activo && cx("bg-white/60 text-tinta", !deshabilitado && "hover:bg-white"),
        deshabilitado && !activo && "opacity-40")}>
      {nivel}
    </button>
  );
}

interface Curso { asignacionId: string; seccionId: string; areaId: string; titulo: string; subtitulo: string }

export function RegistroNotas() {
  const { usuario } = useApp();
  const [cursoId, setCursoId] = useState("");
  const [periodoId, setPeriodoId] = useState("");
  const [competenciaId, setCompetenciaId] = useState("");
  const [vista, setVista] = useState<"lista" | "matriz" | "sesiones">("lista");
  // Como el registro auxiliar del colegio: por defecto se califica cada capacidad.
  const [modo, setModoEstado] = useState<"capacidad" | "directo">(() => (localStorage.getItem("cc.modoNotas") === "directo" ? "directo" : "capacidad"));
  const setModo = (m: "capacidad" | "directo") => { setModoEstado(m); localStorage.setItem("cc.modoNotas", m); };
  const [descargando, setDescargando] = useState(false);
  const avisarDescarga = useAvisar();

  const base = useLiveQuery(async () => {
    if (!usuario) return null;
    const anio = await anioActivo();
    if (!anio) return { cursos: [], periodos: [] as Periodo[] };
    const secciones = await seccionesDetalle(anio.id);
    const asig = vivas(await db.tabla("docente_asignacion").where("docente_id").equals(usuario.id).toArray());
    const areas = await db.tabla("area").bulkGet(asig.map((a) => a.area_id));
    const cursos: Curso[] = asig
      .map((a, i) => {
        const s = secciones.find((x) => x.id === a.seccion_id);
        return s && areas[i] ? { asignacionId: a.id, seccionId: s.id, areaId: a.area_id, titulo: areas[i]!.nombre, subtitulo: s.nombreLargo } : null;
      })
      .filter((c): c is Curso => !!c)
      .sort((a, b) => a.subtitulo.localeCompare(b.subtitulo) || a.titulo.localeCompare(b.titulo));
    const periodos = vivas(await db.tabla("periodo").where("anio_id").equals(anio.id).toArray()).sort((a, b) => a.numero - b.numero);
    return { cursos, periodos };
  }, [usuario?.id]);

  // Valores por defecto: el primer curso y el periodo en curso (o el último abierto).
  useEffect(() => {
    if (!base) return;
    if (!cursoId && base.cursos[0]) setCursoId(base.cursos[0].asignacionId);
    if (!periodoId && base.periodos.length) {
      const hoy = new Date().toISOString().slice(0, 10);
      const enCurso = base.periodos.find((p) => p.inicio <= hoy && hoy <= p.fin && p.estado === "abierto");
      const abierto = [...base.periodos].reverse().find((p) => p.estado === "abierto" && p.inicio <= hoy);
      setPeriodoId((enCurso ?? abierto ?? base.periodos.find((p) => p.estado === "abierto") ?? base.periodos[0]).id);
    }
  }, [base, cursoId, periodoId]);

  const curso = base?.cursos.find((c) => c.asignacionId === cursoId);
  const periodo = base?.periodos.find((p) => p.id === periodoId);

  const datos = useLiveQuery(async () => {
    if (!curso || !periodoId) return null;
    const competencias = vivas(await db.tabla("competencia").where("area_id").equals(curso.areaId).toArray()).sort((a, b) => a.orden - b.orden);
    const mats = vivas(await db.tabla("matricula").where("seccion_id").equals(curso.seccionId).toArray()).filter((m) => m.estado === "matriculado");
    const estudiantes = vivas((await db.tabla("estudiante").bulkGet(mats.map((m) => m.estudiante_id))).filter((e): e is Estudiante => !!e))
      .sort((a, b) => a.apellidos.localeCompare(b.apellidos));
    // Solo las notas de las competencias de esta área (la sección tiene notas de varias áreas).
    const deArea = new Set(competencias.map((c) => c.id));
    const califs = vivas(await db.tabla("calificacion").where("[seccion_id+periodo_id]").equals([curso.seccionId, periodoId]).toArray())
      .filter((c) => deArea.has(c.competencia_id));
    return { competencias, estudiantes, califs };
  }, [curso?.asignacionId, periodoId]);

  useEffect(() => {
    if (datos?.competencias.length && !datos.competencias.some((c) => c.id === competenciaId)) setCompetenciaId(datos.competencias[0].id);
  }, [datos, competenciaId]);

  if (!base) return null;
  if (!base.cursos.length) {
    return (
      <Contenido ancho="max-w-3xl">
        <Vacio icono={ClipboardList} tono="tono-cielo" titulo="Aún no tiene áreas asignadas">
          La dirección debe asignarle sus áreas y secciones en Configuración, paso 3.
        </Vacio>
      </Contenido>
    );
  }

  const cerrado = periodo?.estado === "cerrado";
  const competencia = datos?.competencias.find((c) => c.id === competenciaId);
  const nota = (e: string, c: string) => datos?.califs.find((x) => x.estudiante_id === e && x.competencia_id === c);
  const total = (datos?.estudiantes.length ?? 0) * (datos?.competencias.length ?? 0);
  const hechas = datos?.califs.filter((c) => c.nivel_logro && datos.estudiantes.some((e) => e.id === c.estudiante_id)).length ?? 0;
  const pendientesConclusion = datos?.califs.filter(faltaConclusion).length ?? 0;

  return (
    <Contenido ancho="max-w-5xl">
      <Tarjeta className="aparecer grid grid-cols-[minmax(0,1fr)] gap-3 p-4 sm:grid-cols-[1.4fr_1fr]" style={orden(1)}>
        <Campo etiqueta="Curso">
          <Selector value={cursoId} onChange={(ev) => setCursoId(ev.target.value)}>
            {base.cursos.map((c) => <option key={c.asignacionId} value={c.asignacionId}>{c.titulo} · {c.subtitulo}</option>)}
          </Selector>
        </Campo>
        <div>
          <span className="mb-1.5 block text-sm font-semibold">Periodo</span>
          <Segmentado etiqueta="Periodo" valor={periodoId} onCambio={setPeriodoId}
            opciones={base.periodos.map((p) => ({ valor: p.id, texto: p.nombre.split(" ")[0] }))} />
        </div>
        <Boton variante="vidrio" icono={FileSpreadsheet} className="sm:col-span-2" cargando={descargando} disabled={!curso || !periodoId}
          onClick={async () => {
            setDescargando(true);
            try {
              await descargarRegistroAuxiliar({ seccionId: curso!.seccionId, areaId: curso!.areaId, periodoId });
            } catch (err) {
              avisarDescarga(err instanceof Error ? err.message : String(err), "error");
            } finally {
              setDescargando(false);
            }
          }}>
          Descargar registro auxiliar, descriptivo y mapa de calor (Excel)
        </Boton>
      </Tarjeta>

      {cerrado && (
        <Aviso tipo="alerta" icono={Lock} titulo={`${periodo?.nombre} cerrado`}>
          Puede consultar las notas, pero no modificarlas. Si necesita corregir algo, pida al director que reabra el periodo.
        </Aviso>
      )}

      {datos && (
        <Tarjeta className="aparecer p-4" style={orden(2)}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold">{hechas} de {total} notas</span>
            {pendientesConclusion > 0 && <span className="font-semibold text-amber-700">{pendientesConclusion === 1 ? "1 conclusión pendiente" : `${pendientesConclusion} conclusiones pendientes`}</span>}
            <span className="ml-auto">
              <Segmentado etiqueta="Vista" valor={vista} onCambio={setVista} opciones={[{ valor: "lista", texto: "Por competencia" }, { valor: "sesiones", texto: "Sesiones" }, { valor: "matriz", texto: "Resumen" }]} />
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/60">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-sky-500 transition-all" style={{ width: `${total ? (hechas / total) * 100 : 0}%` }} />
          </div>
        </Tarjeta>
      )}

      {datos && datos.estudiantes.length === 0 && (
        <Vacio icono={BookOpenCheck} titulo="La sección no tiene estudiantes">La dirección debe matricularlos en Configuración.</Vacio>
      )}

      {datos && datos.estudiantes.length > 0 && vista === "lista" && (
        <>
          <div className="-mx-4 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Competencias">
            <div className="flex w-max gap-2">
              {datos.competencias.map((c, i) => {
                const n = datos.califs.filter((x) => x.competencia_id === c.id && x.nivel_logro).length;
                return (
                  <button key={c.id} role="tab" aria-selected={c.id === competenciaId} onClick={() => setCompetenciaId(c.id)}
                    className={cx("flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition",
                      c.id === competenciaId ? "vidrio-laguna" : "vidrio !rounded-full text-tinta-suave")}>
                    C{i + 1}
                    <span className={cx("rounded-full px-1.5 text-[0.65rem]", c.id === competenciaId ? "bg-white/25" : "bg-white/70")}>{n}/{datos.estudiantes.length}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {competencia && (
            <div className="flex flex-wrap items-start justify-between gap-2 px-1">
              <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">{competencia.nombre}</p>
              {capacidadesDe(competencia).length > 0 && (
                <Segmentado etiqueta="Forma de calificar" valor={modo} onCambio={setModo}
                  opciones={[{ valor: "capacidad", texto: "Por capacidad" }, { valor: "directo", texto: "Directo" }]} />
              )}
            </div>
          )}
          {competencia && modo === "capacidad" && capacidadesDe(competencia).length > 0 && (
            <ol className="space-y-0.5 px-1 text-xs text-tinta-suave">
              {capacidadesDe(competencia).map((c, i) => <li key={c}><strong className="text-tinta">{i + 1}.</strong> {c}</li>)}
              <li className="pt-1 italic">El logro de la competencia se calcula solo: AD=3, A=2, B=1, C=0, promedio redondeado.</li>
            </ol>
          )}

          <Tarjeta className="divide-y divide-white/70 overflow-hidden">
            {competencia && datos.estudiantes.map((e, i) => (
              <FilaEstudiante key={`${e.id}-${competencia.id}`} n={i + 1} estudiante={e} competencia={competencia} nota={nota(e.id, competencia.id)}
                periodoId={periodoId} seccionId={curso!.seccionId} bloqueado={cerrado} porCapacidad={modo === "capacidad"} />
            ))}
          </Tarjeta>
        </>
      )}

      {datos && datos.estudiantes.length > 0 && vista === "sesiones" && (
        <ListasCotejo seccionId={curso!.seccionId} areaId={curso!.areaId} periodoId={periodoId}
          estudiantes={datos.estudiantes} competencias={datos.competencias} bloqueado={cerrado} />
      )}

      {datos && datos.estudiantes.length > 0 && vista === "matriz" && (
        <Matriz estudiantes={datos.estudiantes} competencias={datos.competencias} nota={nota}
          onElegir={(c) => { setCompetenciaId(c); setVista("lista"); }} />
      )}
    </Contenido>
  );
}

function FilaEstudiante({ n, estudiante, competencia, nota, periodoId, seccionId, bloqueado, porCapacidad }: {
  n: number; estudiante: Estudiante; competencia: Competencia; nota: Calificacion | undefined;
  periodoId: string; seccionId: string; bloqueado: boolean; porCapacidad: boolean;
}) {
  const capacidades = porCapacidad ? capacidadesDe(competencia) : [];
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [texto, setTexto] = useState(nota?.conclusion ?? "");
  const [observando, setObservando] = useState(false);
  const enfocado = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout>>();

  // Si la conclusión cambia desde otro lado (sincronización), se actualiza salvo que se esté escribiendo.
  useEffect(() => {
    if (!enfocado.current) setTexto(nota?.conclusion ?? "");
  }, [nota?.conclusion]);
  useEffect(() => () => clearTimeout(temporizador.current), []);

  const params = { estudianteId: estudiante.id, competenciaId: competencia.id, periodoId, seccionId };
  const elegir = async (nivel: NivelLogro) => {
    try {
      await guardarNota({ ...params, cambios: { nivel_logro: nota?.nivel_logro === nivel ? null : nivel } }, colegioId);
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    }
  };
  const elegirCapacidad = async (capacidad: number, nivel: NivelLogro) => {
    try {
      await guardarCapacidad({ ...params, capacidad, nivel }, colegioId);
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    }
  };
  const guardarConclusion = (valor: string) => {
    clearTimeout(temporizador.current);
    if ((nota?.conclusion ?? "") === valor) return;
    void guardarNota({ ...params, cambios: { conclusion: valor.trim() ? valor : null } }, colegioId);
  };
  const escribir = (valor: string) => {
    setTexto(valor);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => guardarConclusion(valor), 900);
  };

  const pide = requiereConclusion(nota?.nivel_logro);
  const falta = nota ? faltaConclusion({ nivel_logro: nota.nivel_logro, conclusion: texto }) : false;

  return (
    <div className={cx("px-3 py-3 sm:px-4", falta && "bg-amber-50/50")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-5 shrink-0 text-right text-xs text-tinta-suave">{n}</span>
        <div className="min-w-0 flex-1">
          <Link to={`/estudiantes/${estudiante.id}`} className="block truncate text-sm font-semibold hover:underline" title="Ver historial del estudiante">{nombreCompleto(estudiante)}</Link>
          {falta && <p className="text-[0.7rem] font-semibold text-amber-700">Falta la conclusión descriptiva</p>}
        </div>
        <button onClick={() => setObservando(true)} className="rounded-full p-2 text-tinta-suave hover:bg-white/60" aria-label={`Observación sobre ${estudiante.nombres}`}>
          <MessageSquarePlus className="h-4 w-4" aria-hidden />
        </button>
        {capacidades.length > 0 ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-tinta-suave">
            Logro
            {nota?.nivel_logro ? <ChipNivel nivel={nota.nivel_logro} activo pequeno deshabilitado /> : <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/50">-</span>}
          </span>
        ) : (
          /* En celular los botones bajan a su propia línea para no cortar el nombre. */
          <div className="flex w-full gap-2 pl-8 sm:w-auto sm:gap-1.5 sm:pl-0">
            {NIVELES.map((nv) => (
              <ChipNivel key={nv} nivel={nv} activo={nota?.nivel_logro === nv} deshabilitado={bloqueado} onClick={() => void elegir(nv)} />
            ))}
          </div>
        )}
      </div>
      {capacidades.length > 0 && (
        <div className="mt-2 grid gap-x-4 gap-y-1.5 pl-7 sm:grid-cols-2 sm:pl-8">
          {capacidades.map((c, k) => (
            <div key={c} className="flex items-center gap-1.5" title={c}>
              <span className="w-5 text-xs font-bold text-tinta-suave">{k + 1}.</span>
              {NIVELES.map((nv) => (
                <ChipNivel key={nv} nivel={nv} pequeno activo={nota?.capacidades?.[String(k + 1)] === nv} deshabilitado={bloqueado}
                  onClick={() => void elegirCapacidad(k + 1, nv)} />
              ))}
            </div>
          ))}
        </div>
      )}
      {pide && (
        <div className="mt-2 pl-7 sm:pl-8">
          <textarea value={texto} disabled={bloqueado} rows={2} placeholder="Conclusión descriptiva: qué logra y qué necesita mejorar"
            onFocus={() => (enfocado.current = true)}
            onBlur={(ev) => { enfocado.current = false; guardarConclusion(ev.target.value); }}
            onChange={(ev) => escribir(ev.target.value)}
            className="campo resize-y !py-2 text-sm" aria-label={`Conclusión descriptiva de ${estudiante.nombres}`} />
          {!bloqueado && !texto.trim() && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PLANTILLAS_CONCLUSION[nota!.nivel_logro as "B" | "C"].map((p) => (
                <button key={p} type="button" onClick={() => escribir(p)}
                  className="flex items-center gap-1 rounded-full bg-white/60 px-2.5 py-1 text-left text-[0.7rem] font-semibold text-tinta-suave ring-1 ring-white hover:bg-white">
                  <PenLine className="h-3 w-3" aria-hidden /> {p.trim()}...
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {observando && <DialogoObservacion estudiante={estudiante} onCerrar={() => setObservando(false)} />}
    </div>
  );
}

function Matriz({ estudiantes, competencias, nota, onElegir }: {
  estudiantes: Estudiante[]; competencias: Competencia[]; nota: (e: string, c: string) => Calificacion | undefined; onElegir(c: string): void;
}) {
  const conteo = useMemo(() => competencias.map((c) => NIVELES.map((nv) => estudiantes.filter((e) => nota(e.id, c.id)?.nivel_logro === nv).length)), [competencias, estudiantes, nota]);
  return (
    <Tarjeta className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-tinta-suave">
            <th className="px-4 py-3">Estudiante</th>
            {competencias.map((c, i) => (
              <th key={c.id} className="px-2 py-3 text-center">
                <button onClick={() => onElegir(c.id)} title={c.nombre} className="rounded-full px-2 py-1 hover:bg-white/60">C{i + 1}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/70">
          {estudiantes.map((e) => (
            <tr key={e.id}>
              <td className="max-w-[14rem] truncate px-4 py-2 font-semibold">{nombreCompleto(e)}</td>
              {competencias.map((c) => {
                const n = nota(e.id, c.id);
                return (
                  <td key={c.id} className="px-2 py-1.5 text-center">
                    {n?.nivel_logro ? (
                      <span className="relative inline-flex">
                        <ChipNivel nivel={n.nivel_logro} activo pequeno deshabilitado />
                        {faltaConclusion(n) && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" aria-label="Falta conclusión" />}
                      </span>
                    ) : <span className="text-tinta-suave/50">-</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-xs text-tinta-suave">
            <td className="px-4 py-3 font-semibold">Distribución</td>
            {conteo.map((fila, i) => (
              <td key={competencias[i].id} className="px-2 py-3 text-center leading-tight">
                {NIVELES.map((nv, j) => <span key={nv} className="block">{nv}: {fila[j]}</span>)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </Tarjeta>
  );
}

const TIPOS_OBSERVACION: { valor: Observacion["tipo"]; texto: string }[] = [
  { valor: "academica", texto: "Académica" },
  { valor: "conducta", texto: "Conducta" },
  { valor: "felicitacion", texto: "Felicitación" },
];

export function DialogoObservacion({ estudiante, onCerrar }: { estudiante: Estudiante; onCerrar(): void }) {
  const { colegioId, usuario } = useApp();
  const avisar = useAvisar();
  const [tipo, setTipo] = useState<Observacion["tipo"]>("academica");
  const [texto, setTexto] = useState("");
  const registrar = async () => {
    await guardar(db, "observacion", {
      estudiante_id: estudiante.id, autor_id: usuario!.id, tipo, texto: texto.trim(), fecha: new Date().toISOString().slice(0, 10),
    }, colegioId);
    avisar(textoGuardado("Observación registrada"));
    onCerrar();
  };
  return (
    <Dialogo abierto titulo={`Observación: ${estudiante.nombres}`} onCerrar={onCerrar}
      acciones={<><Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton><Boton icono={Save} onClick={registrar} disabled={!texto.trim()}>Registrar</Boton></>}>
      <div className="space-y-3 pt-2 text-tinta">
        <Segmentado etiqueta="Tipo" valor={tipo} onCambio={setTipo} opciones={TIPOS_OBSERVACION} />
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} className="campo" placeholder="Describa lo observado" aria-label="Texto de la observación" autoFocus />
        <p className="text-xs">La verán el tutor, la dirección y la familia del estudiante.</p>
      </div>
    </Dialogo>
  );
}
