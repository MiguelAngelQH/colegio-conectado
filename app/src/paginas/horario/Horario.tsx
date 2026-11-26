// Horario de clases: la dirección lo arma por sección; el docente ve "Mi horario" con todas sus
// clases; el estudiante y la familia ven el de su sección. Funciona sin conexión.
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarClock, Info, Pencil, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { DIAS, HORA_PEDAGOGICA, RECREO, minutos, validarHorario, type AreaHorario, type ClaseOtraSeccion, type FilaHorario } from "@/dominio/horario";
import { db, useApp } from "@/app/contexto";
import { anioActivo, matriculaActual, seccionesDetalle, type SeccionDetalle } from "@/datos/consultas";
import { useHijos } from "@/datos/familia";
import { guardarLote, vivas, type Escritura } from "@/db/repositorio";
import type { HorarioClase } from "@/db/tipos";
import { idDeterministico } from "@/dominio/notas";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Boton, Contenido, Dialogo, Encabezado, Tarjeta, cx } from "@/ui/componentes";
import { Campo, Entrada, Selector, Vacio } from "@/ui/formulario";


export function Horario() {
  const { usuario } = useApp();
  const { hijo } = useHijos(usuario);
  const gestion = !!usuario?.roles.some((r) => r === "director" || r === "subdirector");
  // "Mi horario" es para quien dicta clases; la dirección y el auxiliar ven todas las secciones.
  const personal = !!usuario?.roles.some((r) => r === "docente" || r === "tutor");
  const veTodo = gestion || !!usuario?.roles.includes("auxiliar");
  const [vista, setVista] = useState("");
  const [editando, setEditando] = useState(false);

  const datos = useLiveQuery(async () => {
    if (!usuario) return null;
    const anio = await anioActivo();
    const todas = anio ? await seccionesDetalle(anio.id) : [];
    const asig = vivas(await db.tabla("docente_asignacion").toArray());
    let secciones: SeccionDetalle[] = todas;
    if (!veTodo && personal) {
      const mias = new Set([...asig.filter((a) => a.docente_id === usuario.id).map((a) => a.seccion_id), ...todas.filter((s) => s.tutor_id === usuario.id).map((s) => s.id)]);
      secciones = todas.filter((s) => mias.has(s.id));
    } else if (!veTodo) {
      const m = hijo ? await matriculaActual(hijo.id) : undefined;
      secciones = todas.filter((s) => s.id === m?.seccion_id);
    }
    const bloques = vivas(await db.tabla("horario_clase").toArray()).filter((b) => todas.some((s) => s.id === b.seccion_id));
    const areas = new Map((await db.tabla("area").toArray()).map((a) => [a.id, a.nombre]));
    const docentes = new Map((await db.tabla("usuario").toArray()).map((u) => [u.id, `${u.nombres.split(" ")[0]} ${u.apellidos.split(" ")[0]}`]));
    return { secciones, todas, asig, bloques, areas, docentes };
  }, [usuario?.id, hijo?.id, veTodo, personal]);

  useEffect(() => {
    if (datos && !vista) setVista(personal && !veTodo ? "yo" : datos.secciones[0]?.id ?? "");
  }, [datos, vista, personal, veTodo]);

  const mostrar = useMemo(() => {
    if (!datos) return [];
    if (vista === "yo") return datos.bloques.filter((b) => b.docente_id === usuario?.id);
    return datos.bloques.filter((b) => b.seccion_id === vista);
  }, [datos, vista, usuario?.id]);

  if (!datos) return null;
  const franjas = [...new Map(mostrar.map((b) => [`${b.inicio}-${b.fin}`, { inicio: b.inicio, fin: b.fin }])).values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const nombreSeccion = (id: string) => datos.todas.find((s) => s.id === id)?.nombre ?? "";
  const hoy = new Date().getDay(); // 1 = lunes

  return (
    <>
      <Encabezado etiqueta="Clases" titulo="Horario" subtitulo={vista === "yo" ? "Todas sus clases de la semana." : "Horario semanal de la sección."}
        accion={gestion && vista && vista !== "yo" ? <Boton variante="vidrio" icono={Pencil} onClick={() => setEditando(true)}>Editar horario</Boton> : undefined} />
      <Contenido ancho="max-w-5xl">
        {(datos.secciones.length > 1 || personal) && (
          <Tarjeta className="aparecer p-4">
            <Campo etiqueta="Ver">
              <Selector value={vista} onChange={(e) => setVista(e.target.value)}>
                {personal && <option value="yo">Mi horario</option>}
                {datos.secciones.map((s) => <option key={s.id} value={s.id}>{s.nombreLargo}</option>)}
              </Selector>
            </Campo>
          </Tarjeta>
        )}
        {franjas.length === 0 ? (
          <Vacio icono={CalendarClock} tono="tono-cielo" titulo="Todavía no hay horario registrado">
            {gestion ? "Use \"Editar horario\" para armarlo por bloques." : "La dirección del colegio lo publicará aquí."}
          </Vacio>
        ) : (
          <Tarjeta className="aparecer overflow-x-auto">
            <table className="w-full min-w-[40rem] border-separate border-spacing-1.5 p-2 text-sm">
              <thead>
                <tr>
                  <th className="w-20 text-left text-xs uppercase tracking-wider text-tinta-suave">Hora</th>
                  {DIAS.map((d, i) => (
                    <th key={d} className={cx("rounded-xl py-1.5 text-xs uppercase tracking-wider", hoy === i + 1 ? "bg-blue-600 text-white" : "text-tinta-suave")}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {franjas.map((f) => (
                  <tr key={`${f.inicio}-${f.fin}`}>
                    <td className="whitespace-nowrap text-xs font-semibold text-tinta-suave">{f.inicio}<br />{f.fin}</td>
                    {DIAS.map((_, i) => {
                      const b = mostrar.find((x) => x.dia === i + 1 && x.inicio === f.inicio && x.fin === f.fin);
                      if (!b) return <td key={i} className="rounded-xl bg-sup/25" />;
                      const recreo = !b.area_id;
                      return (
                        <td key={i} className={cx("rounded-xl px-2 py-2 align-top ring-1", recreo ? "bg-amber-50/70 ring-amber-100" : "bg-sup/70 ring-sup")}>
                          <p className="font-semibold leading-tight">{recreo ? b.detalle ?? "Recreo" : datos.areas.get(b.area_id!) ?? "Clase"}</p>
                          {!recreo && (
                            <p className="text-[0.7rem] text-tinta-suave">
                              {vista === "yo" ? nombreSeccion(b.seccion_id) : b.docente_id ? `Prof. ${datos.docentes.get(b.docente_id) ?? ""}` : ""}
                            </p>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Tarjeta>
        )}
      </Contenido>
      {editando && vista && vista !== "yo" && (
        <EditorHorario seccionId={vista} bloques={datos.bloques.filter((b) => b.seccion_id === vista)}
          areas={datos.asig.filter((a) => a.seccion_id === vista).map((a) => ({ id: a.area_id, nombre: datos.areas.get(a.area_id) ?? "Área", docenteId: a.docente_id, docente: datos.docentes.get(a.docente_id) ?? "El docente" }))}
          otras={datos.bloques.filter((b) => b.seccion_id !== vista && b.docente_id).map((b) => ({ docenteId: b.docente_id!, dia: b.dia, inicio: b.inicio, fin: b.fin, seccion: nombreSeccion(b.seccion_id) }))}
          onCerrar={() => setEditando(false)} />
      )}
    </>
  );
}

function EditorHorario({ seccionId, bloques, areas, otras, onCerrar }: {
  seccionId: string; bloques: HorarioClase[]; areas: AreaHorario[]; otras: ClaseOtraSeccion[]; onCerrar(): void;
}) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const inicial = (): FilaHorario[] => {
    const franjas = [...new Map(bloques.map((b) => [`${b.inicio}-${b.fin}`, { inicio: b.inicio, fin: b.fin }])).values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
    if (!franjas.length) return [{ inicio: "08:00", fin: "08:45", dias: ["", "", "", "", ""] }];
    return franjas.map((f) => ({
      ...f,
      dias: [1, 2, 3, 4, 5].map((d) => {
        const b = bloques.find((x) => x.dia === d && x.inicio === f.inicio && x.fin === f.fin);
        return b ? b.area_id ?? RECREO : "";
      }),
    }));
  };
  const [filas, setFilas] = useState<FilaHorario[]>(inicial);
  const [guardando, setGuardando] = useState(false);
  const revision = useMemo(() => validarHorario(filas, areas, otras), [filas, areas, otras]);
  const cantidadErrores = revision.errores.reduce((t, e) => t + e.length, 0) + revision.choques.flat().filter(Boolean).length;

  const cambiar = (i: number, c: Partial<FilaHorario>) => setFilas(filas.map((f, k) => (k === i ? { ...f, ...c } : f)));
  const siguiente = (): FilaHorario => {
    const ult = filas[filas.length - 1];
    const inicio = ult?.fin && /^\d{2}:\d{2}$/.test(ult.fin) ? ult.fin : "08:00";
    const fin = minutos(inicio) + HORA_PEDAGOGICA;
    return { inicio, fin: `${String(Math.floor(fin / 60) % 24).padStart(2, "0")}:${String(fin % 60).padStart(2, "0")}`, dias: ["", "", "", "", ""] };
  };
  // Al terminar de escribir una hora, los bloques se ordenan solos.
  const ordenar = () => setFilas((fs) => [...fs].sort((a, b) => a.inicio.localeCompare(b.inicio)));

  const guardarTodo = async () => {
    if (!revision.valido) return;
    setGuardando(true);
    try {
      const escrituras: Escritura[] = [];
      const usados = new Set<string>();
      for (const f of filas) {
        for (let d = 0; d < 5; d++) {
          const v = f.dias[d];
          if (!v) continue;
          const id = await idDeterministico("horario", seccionId, String(d + 1), f.inicio);
          usados.add(id);
          const area = areas.find((a) => a.id === v);
          escrituras.push({ tabla: "horario_clase", datos: {
            id, seccion_id: seccionId, dia: d + 1, inicio: f.inicio, fin: f.fin, eliminado: false,
            area_id: v === RECREO ? null : v, docente_id: area?.docenteId ?? null, detalle: v === RECREO ? "Recreo" : null,
          } });
        }
      }
      for (const b of bloques) if (!usados.has(b.id)) escrituras.push({ tabla: "horario_clase", datos: { id: b.id, eliminado: true } });
      await guardarLote(db, escrituras, colegioId);
      avisar(textoGuardado("Horario guardado"));
      onCerrar();
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGuardando(false);
    }
  };

  const celda = (f: FilaHorario, i: number, d: number, conDia: boolean) => {
    const choque = revision.choques[i]?.[d];
    const v = f.dias[d];
    return (
      <div key={d} className="min-w-0">
        <Selector value={v} aria-label={`${DIAS[d]} ${f.inicio}`} aria-invalid={!!choque} title={choque ?? undefined}
          onChange={(e) => cambiar(i, { dias: f.dias.map((x, j) => (j === d ? e.target.value : x)) })}
          claseCampo={cx("!py-2.5 !pl-3 !pr-8 !text-sm", choque && "!border-red-400 !ring-2 !ring-red-300/60", v === RECREO && "!bg-amber-50/80", !v && "text-tinta-suave")}>
          <option value="">{conDia ? `${DIAS[d]}: libre` : "Libre"}</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{conDia ? `${DIAS[d]}: ${a.nombre}` : a.nombre}</option>)}
          <option value={RECREO}>{conDia ? `${DIAS[d]}: Recreo` : "Recreo"}</option>
        </Selector>
        {choque && <p className="mt-1 flex items-start gap-1 text-[0.7rem] leading-snug text-red-700"><TriangleAlert className="mt-px h-3 w-3 shrink-0" aria-hidden />{choque}</p>}
      </div>
    );
  };

  return (
    <Dialogo abierto titulo="Editar horario" onCerrar={onCerrar} ancho="max-w-6xl"
      acciones={
        <>
          {!revision.valido && (
            <p className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-red-700">
              <TriangleAlert className="h-4 w-4" aria-hidden /> Corrija {cantidadErrores} {cantidadErrores === 1 ? "problema" : "problemas"} para guardar
            </p>
          )}
          <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
          <Boton icono={Save} cargando={guardando} disabled={!revision.valido} onClick={guardarTodo}>Guardar</Boton>
        </>
      }>
      <div className="space-y-4 pt-2 text-tinta">
        {areas.length === 0 && (
          <p className="rounded-2xl bg-amber-50/80 p-3 text-sm text-amber-800 ring-1 ring-amber-200/70">
            Esta sección aún no tiene docentes asignados por área. Asígnelos en Configuración, Personal.
          </p>
        )}

        {/* Horas por semana de cada área: se actualizan mientras se arma el horario. */}
        {areas.length > 0 && (
          <div>
            <p className="etiqueta mb-1.5">Horas pedagógicas por semana ({HORA_PEDAGOGICA} min)</p>
            <div className="flex flex-wrap gap-1.5">
              {revision.horas.map((h) => (
                <span key={h.area.id} title={`Prof. ${h.area.docente}`}
                  className={cx("rounded-full px-2.5 py-1 text-xs font-semibold ring-1", h.horas ? "bg-blue-50 text-blue-800 ring-blue-200" : "bg-tinta/[.04] text-tinta-suave ring-tinta/10")}>
                  {h.area.nombre}: {h.horas}
                </span>
              ))}
            </div>
          </div>
        )}

        {revision.avisos.length > 0 && (
          <ul className="space-y-1 rounded-2xl bg-amber-50/80 p-3 text-xs text-amber-900 ring-1 ring-amber-200/70">
            {revision.avisos.map((a) => <li key={a} className="flex items-start gap-1.5"><Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />{a}</li>)}
          </ul>
        )}

        {/* PC: tabla con los días como columnas. */}
        <div className="hidden lg:block">
          <div className="grid grid-cols-[13rem_repeat(5,minmax(0,1fr))_2.5rem] gap-2 px-2 pb-1">
            <p className="etiqueta">Hora</p>
            {DIAS.map((d) => <p key={d} className="etiqueta">{d}</p>)}
            <span />
          </div>
          <div className="space-y-2">
            {filas.map((f, i) => (
              <div key={i} className={cx("rounded-2xl p-2 ring-1", revision.errores[i].length ? "bg-red-50/60 ring-red-200" : "bg-sup/50 ring-sup")}>
                <div className="grid grid-cols-[13rem_repeat(5,minmax(0,1fr))_2.5rem] items-start gap-2">
                  <div className="flex items-center gap-1">
                    <Entrada type="time" value={f.inicio} onChange={(e) => cambiar(i, { inicio: e.target.value })} onBlur={ordenar} aria-label="Inicio" className="!px-2 !py-2.5 !text-sm" />
                    <Entrada type="time" value={f.fin} onChange={(e) => cambiar(i, { fin: e.target.value })} aria-label="Fin" className="!px-2 !py-2.5 !text-sm" />
                  </div>
                  {DIAS.map((_, d) => celda(f, i, d, false))}
                  <QuitarBloque visible={filas.length > 1} inicio={f.inicio} onQuitar={() => setFilas(filas.filter((_, k) => k !== i))} />
                </div>
                <ErroresBloque errores={revision.errores[i]} />
              </div>
            ))}
          </div>
        </div>

        {/* Celular y tableta: un bloque por tarjeta, cada día con su nombre. */}
        <div className="space-y-3 lg:hidden">
          {filas.map((f, i) => (
            <div key={i} className={cx("space-y-2 rounded-2xl p-3 ring-1", revision.errores[i].length ? "bg-red-50/60 ring-red-200" : "bg-sup/50 ring-sup")}>
              <div className="flex items-end gap-2">
                <Campo etiqueta="Inicio"><Entrada type="time" value={f.inicio} onChange={(e) => cambiar(i, { inicio: e.target.value })} onBlur={ordenar} /></Campo>
                <Campo etiqueta="Fin"><Entrada type="time" value={f.fin} onChange={(e) => cambiar(i, { fin: e.target.value })} /></Campo>
                <span className="flex-1" />
                <QuitarBloque visible={filas.length > 1} inicio={f.inicio} onQuitar={() => setFilas(filas.filter((_, k) => k !== i))} />
              </div>
              <ErroresBloque errores={revision.errores[i]} />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{DIAS.map((_, d) => celda(f, i, d, true))}</div>
            </div>
          ))}
        </div>

        <Boton variante="vidrio" icono={Plus} onClick={() => setFilas([...filas, siguiente()])}>Agregar bloque</Boton>
      </div>
    </Dialogo>
  );
}

function QuitarBloque({ visible, inicio, onQuitar }: { visible: boolean; inicio: string; onQuitar(): void }) {
  if (!visible) return <span />;
  return (
    <button type="button" onClick={onQuitar} className="mb-1 grid h-10 w-10 place-items-center rounded-full text-red-700 hover:bg-red-50" aria-label={`Quitar bloque ${inicio}`} title="Quitar bloque">
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}

function ErroresBloque({ errores }: { errores: string[] }) {
  if (!errores.length) return null;
  return (
    <ul className="mt-1.5 space-y-0.5 px-1">
      {errores.map((e) => (
        <li key={e} className="flex items-start gap-1.5 text-xs font-medium text-red-700"><TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />{e}</li>
      ))}
    </ul>
  );
}
