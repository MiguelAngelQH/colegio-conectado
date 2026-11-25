// Horario de clases: la dirección lo arma por sección; el docente ve "Mi horario" con todas sus
// clases; el estudiante y la familia ven el de su sección. Funciona sin conexión.
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarClock, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { anioActivo, matriculaActual, seccionesDetalle, type SeccionDetalle } from "@/datos/consultas";
import { useHijos } from "@/datos/familia";
import { guardarLote, vivas, type Escritura } from "@/db/repositorio";
import type { HorarioClase } from "@/db/tipos";
import { idDeterministico } from "@/dominio/notas";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Boton, Contenido, Dialogo, Encabezado, Tarjeta, cx } from "@/ui/componentes";
import { Campo, Entrada, Selector, Vacio } from "@/ui/formulario";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const RECREO = "__recreo";

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
                      if (!b) return <td key={i} className="rounded-xl bg-white/25" />;
                      const recreo = !b.area_id;
                      return (
                        <td key={i} className={cx("rounded-xl px-2 py-2 align-top ring-1", recreo ? "bg-amber-50/70 ring-amber-100" : "bg-white/70 ring-white")}>
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
          areas={datos.asig.filter((a) => a.seccion_id === vista).map((a) => ({ id: a.area_id, nombre: datos.areas.get(a.area_id) ?? "Área", docenteId: a.docente_id }))}
          onCerrar={() => setEditando(false)} />
      )}
    </>
  );
}

interface FilaEditor { inicio: string; fin: string; dias: string[] }

function EditorHorario({ seccionId, bloques, areas, onCerrar }: {
  seccionId: string; bloques: HorarioClase[]; areas: { id: string; nombre: string; docenteId: string }[]; onCerrar(): void;
}) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const inicial = (): FilaEditor[] => {
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
  const [filas, setFilas] = useState<FilaEditor[]>(inicial);
  const [guardando, setGuardando] = useState(false);
  const horaValida = (h: string) => /^\d{2}:\d{2}$/.test(h);
  const valido = filas.every((f) => horaValida(f.inicio) && horaValida(f.fin) && f.inicio < f.fin);
  const cambiar = (i: number, c: Partial<FilaEditor>) => setFilas(filas.map((f, k) => (k === i ? { ...f, ...c } : f)));
  const siguiente = () => {
    const ult = filas[filas.length - 1];
    const [h, m] = (ult?.fin ?? "08:00").split(":").map(Number);
    const fin = new Date(0, 0, 0, h, m + 45);
    return { inicio: ult?.fin ?? "08:00", fin: `${String(fin.getHours()).padStart(2, "0")}:${String(fin.getMinutes()).padStart(2, "0")}`, dias: ["", "", "", "", ""] };
  };

  const guardarTodo = async () => {
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

  return (
    <Dialogo abierto titulo="Editar horario" onCerrar={onCerrar}
      acciones={<><Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton><Boton icono={Save} cargando={guardando} disabled={!valido} onClick={guardarTodo}>Guardar</Boton></>}>
      <div className="space-y-3 pt-2 text-tinta">
        {areas.length === 0 && <p className="text-sm text-amber-800">Esta sección aún no tiene docentes asignados por área. Asígnelos en Configuración, Personal.</p>}
        {filas.map((f, i) => (
          <div key={i} className="space-y-2 rounded-2xl bg-white/50 p-3 ring-1 ring-white">
            <div className="flex items-end gap-2">
              <Campo etiqueta="Inicio"><Entrada type="time" value={f.inicio} onChange={(e) => cambiar(i, { inicio: e.target.value })} /></Campo>
              <Campo etiqueta="Fin"><Entrada type="time" value={f.fin} onChange={(e) => cambiar(i, { fin: e.target.value })} /></Campo>
              <span className="flex-1" />
              {filas.length > 1 && (
                <button type="button" onClick={() => setFilas(filas.filter((_, k) => k !== i))} className="mb-1 rounded-full p-2 text-red-700 hover:bg-white/70" aria-label={`Quitar bloque ${f.inicio}`}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {DIAS.map((d, k) => (
                <Selector key={d} value={f.dias[k]} aria-label={`${d} ${f.inicio}`} onChange={(e) => cambiar(i, { dias: f.dias.map((x, j) => (j === k ? e.target.value : x)) })}>
                  <option value="">{d}: libre</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  <option value={RECREO}>Recreo</option>
                </Selector>
              ))}
            </div>
          </div>
        ))}
        <Boton variante="vidrio" icono={Plus} onClick={() => setFilas([...filas, siguiente()])}>Agregar bloque</Boton>
      </div>
    </Dialogo>
  );
}
