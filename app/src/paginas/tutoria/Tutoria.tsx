import { useEffect, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, ChevronRight, HandHeart, LifeBuoy, MessagesSquare, Plus, Save, TriangleAlert, UserRound, Users } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { estudiantesDeSeccion, nombreCompleto, seccionesDeTutoria, anioActivo } from "@/datos/consultas";
import { guardar, vivas } from "@/db/repositorio";
import type { Estudiante, Periodo } from "@/db/tipos";
import { indicadores, type Indicadores } from "@/dominio/seguimiento";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Boton, Contenido, Dialogo, Encabezado, Gema, Tarjeta, cx, iniciales, orden } from "@/ui/componentes";
import { Evidencias } from "@/ui/Evidencias";
import { Campo, Casilla, Entrada, Segmentado, Selector, Vacio } from "@/ui/formulario";
import { FichaSeguimiento } from "./FichaSeguimiento";
import { MiTutoria } from "./MiTutoria";
import { Pedidos, pedidosParaAtender } from "./Pedidos";
import { ABIERTAS } from "@/dominio/solicitudes";

export function Tutoria() {
  const { usuario } = useApp();
  // Estudiantes y familias: su tutor(a), pedir ayuda y observaciones.
  if (usuario?.roles.some((r) => r === "estudiante" || r === "apoderado") && !usuario.roles.some((r) => ["director", "subdirector", "tutor", "docente"].includes(r))) return <MiTutoria />;
  return (
    <Routes>
      <Route index element={<InicioTutoria />} />
      <Route path="estudiante/:id" element={<FichaSeguimiento />} />
      <Route path="pedidos" element={<Pedidos />} />
    </Routes>
  );
}

const hoy = () => new Date().toISOString().slice(0, 10);
const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "short" });

export function periodoActual(periodos: Periodo[]): Periodo | undefined {
  const h = hoy();
  const ord = [...periodos].sort((a, b) => a.numero - b.numero);
  return ord.find((p) => p.inicio <= h && h <= p.fin) ?? [...ord].reverse().find((p) => p.inicio <= h) ?? ord[0];
}

/** Indicadores de seguimiento de varios estudiantes (asistencia del año, notas del periodo actual, incidencias). */
export async function indicadoresDe(estudiantes: Estudiante[]): Promise<Map<string, Indicadores>> {
  const anio = await anioActivo();
  const periodos = anio ? vivas(await db.tabla("periodo").where("anio_id").equals(anio.id).toArray()) : [];
  const p = periodoActual(periodos);
  const res = new Map<string, Indicadores>();
  for (const e of estudiantes) {
    const [asistencias, califs, incidencias] = await Promise.all([
      db.tabla("asistencia").where("estudiante_id").equals(e.id).toArray(),
      db.tabla("calificacion").where("estudiante_id").equals(e.id).toArray(),
      db.tabla("incidencia").where("estudiante_id").equals(e.id).toArray(),
    ]);
    res.set(e.id, indicadores({ asistencias, calificacionesPeriodo: califs.filter((c) => c.periodo_id === p?.id), incidencias }));
  }
  return res;
}

function InicioTutoria() {
  const { usuario } = useApp();
  const navegar = useNavigate();
  const [seccionId, setSeccionId] = useState("");
  const [vista, setVista] = useState<"estudiantes" | "sesiones" | "entrevistas">("estudiantes");
  const [nuevaSesion, setNuevaSesion] = useState(false);
  const [nuevaEntrevista, setNuevaEntrevista] = useState(false);

  const secciones = useLiveQuery(async () => (usuario ? seccionesDeTutoria(usuario) : []), [usuario?.id]);
  const pedidos = useLiveQuery(async () => {
    const lista = usuario ? await pedidosParaAtender(usuario) : [];
    return { abiertos: lista.filter((s) => ABIERTAS.includes(s.estado)).length, nuevos: lista.filter((s) => s.estado === "enviada").length, total: lista.length };
  }, [usuario?.id]);
  useEffect(() => { if (secciones?.[0] && !seccionId) setSeccionId(secciones[0].id); }, [secciones, seccionId]);

  const datos = useLiveQuery(async () => {
    if (!seccionId) return null;
    const estudiantes = await estudiantesDeSeccion(seccionId);
    const ind = await indicadoresDe(estudiantes);
    const sesiones = vivas(await db.tabla("sesion_tutoria").where("seccion_id").equals(seccionId).toArray()).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const ids = new Set(estudiantes.map((e) => e.id));
    const entrevistas = vivas(await db.tabla("entrevista").toArray()).filter((x) => ids.has(x.estudiante_id)).sort((a, b) => b.fecha.localeCompare(a.fecha));
    return { estudiantes, ind, sesiones, entrevistas };
  }, [seccionId]);

  if (!secciones) return null;
  const enRiesgo = datos ? datos.estudiantes.filter((e) => datos.ind.get(e.id)!.alertas.length > 0).length : 0;
  const porId = new Map(datos?.estudiantes.map((e) => [e.id, e]) ?? []);

  return (
    <>
      <Encabezado etiqueta="Tutoría y orientación educativa" titulo="Tutoría" subtitulo="Seguimiento de cada estudiante, sesiones de tutoría y entrevistas con las familias." />
      <Contenido ancho="max-w-4xl">
        {pedidos && (pedidos.total > 0 || secciones.length > 0) && (
          <button onClick={() => navegar("pedidos")}
            className={cx("vidrio aparecer flex w-full items-center gap-4 p-4 text-left transition hover:bg-white/55", pedidos.nuevos > 0 && "ring-2 ring-sky-300")}>
            <Gema icono={LifeBuoy} tono="tono-rosa" tam="sm" />
            <span className="min-w-0 flex-1">
              <span className="block font-bold">Pedidos de ayuda</span>
              <span className="block text-sm text-tinta-suave">
                {pedidos.abiertos === 0 ? "No hay pedidos por atender" : `${pedidos.abiertos} por atender${pedidos.nuevos ? `, ${pedidos.nuevos} sin leer` : ""}`}
              </span>
            </span>
            {pedidos.nuevos > 0 && <span className="rounded-full bg-sky-600 px-2.5 py-0.5 text-xs font-bold text-white">{pedidos.nuevos}</span>}
            <ChevronRight className="h-5 w-5 text-tinta-suave" aria-hidden />
          </button>
        )}
        {secciones.length === 0 ? (
          <Vacio icono={HandHeart} tono="tono-rosa" titulo="No es tutor(a) de ninguna sección">La dirección asigna tutores en Configuración, paso 2.</Vacio>
        ) : (
          <>
            <Tarjeta className="aparecer flex flex-col gap-3 p-4 sm:flex-row sm:items-end" style={orden(1)}>
              <Campo etiqueta="Sección" className="flex-1">
                <Selector value={seccionId} onChange={(e) => setSeccionId(e.target.value)}>
                  {secciones.map((s) => <option key={s.id} value={s.id}>{s.nombreLargo}</option>)}
                </Selector>
              </Campo>
              <Segmentado etiqueta="Vista" valor={vista} onCambio={setVista} opciones={[
                { valor: "estudiantes", texto: "Estudiantes" }, { valor: "sesiones", texto: "Sesiones" }, { valor: "entrevistas", texto: "Entrevistas" },
              ]} />
            </Tarjeta>

            {datos && vista === "estudiantes" && (
              <>
                {enRiesgo > 0 && (
                  <p className="flex items-center gap-2 px-1 text-sm font-semibold text-amber-800">
                    <TriangleAlert className="h-4 w-4" aria-hidden /> {enRiesgo} {enRiesgo === 1 ? "estudiante necesita" : "estudiantes necesitan"} atención
                  </p>
                )}
                <Tarjeta className="divide-y divide-white/70 overflow-hidden">
                  {[...datos.estudiantes]
                    .sort((a, b) => datos.ind.get(b.id)!.alertas.length - datos.ind.get(a.id)!.alertas.length)
                    .map((e) => {
                      const i = datos.ind.get(e.id)!;
                      return (
                        <button key={e.id} onClick={() => navegar(`estudiante/${e.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/40">
                          <span className={cx("gema titulo-display h-11 w-11 shrink-0 text-sm font-bold", i.alertas.length ? "tono-ambar" : "tono-musgo")}>
                            <span className="relative z-10">{iniciales(e.nombres, e.apellidos)}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{nombreCompleto(e)}</span>
                            <span className={cx("block truncate text-xs", i.alertas.length ? "font-semibold text-amber-800" : "text-tinta-suave")}>
                              {i.alertas.length ? i.alertas.join(" · ")
                                : `${i.asistencia === null ? "Sin asistencia registrada" : `Asistencia ${i.asistencia}%`}${i.notasB ? ` · ${i.notasB} en proceso` : ""}`}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                </Tarjeta>
              </>
            )}

            {datos && vista === "sesiones" && (
              <>
                <div className="flex justify-end"><Boton icono={Plus} onClick={() => setNuevaSesion(true)}>Nueva sesión</Boton></div>
                {datos.sesiones.length === 0 ? <Vacio icono={Users} tono="tono-rosa" titulo="Aún no hay sesiones de tutoría registradas" /> : (
                  <div className="space-y-3">
                    {datos.sesiones.map((s) => (
                      <Tarjeta key={s.id} className="space-y-2 p-4">
                        <div className="flex items-start gap-3">
                          <Gema icono={CalendarDays} tono="tono-rosa" tam="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="font-bold">{s.tema}</p>
                            <p className="text-xs text-tinta-suave">{fechaCorta(s.fecha)}</p>
                            {s.acuerdos && <p className="mt-1 text-sm">{s.acuerdos}</p>}
                          </div>
                        </div>
                        <Evidencias entidad="sesion_tutoria" entidadId={s.id} editable={s.tutor_id === usuario?.id} />
                      </Tarjeta>
                    ))}
                  </div>
                )}
              </>
            )}

            {datos && vista === "entrevistas" && (
              <>
                <div className="flex justify-end"><Boton icono={Plus} onClick={() => setNuevaEntrevista(true)}>Nueva entrevista</Boton></div>
                {datos.entrevistas.length === 0 ? <Vacio icono={MessagesSquare} tono="tono-rosa" titulo="Aún no hay entrevistas registradas" /> : (
                  <div className="space-y-3">
                    {datos.entrevistas.map((x) => (
                      <Tarjeta key={x.id} className="space-y-2 p-4">
                        <div className="flex items-start gap-3">
                          <Gema icono={MessagesSquare} tono="tono-coral" tam="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="font-bold">{porId.get(x.estudiante_id) ? nombreCompleto(porId.get(x.estudiante_id)!) : "Estudiante"}</p>
                            <p className="text-xs text-tinta-suave">{fechaCorta(x.fecha)}{!x.asistio && " · La familia no asistió"}</p>
                            <p className="mt-1 text-sm"><strong>Motivo:</strong> {x.motivo}</p>
                            {x.acuerdos && <p className="text-sm"><strong>Acuerdos:</strong> {x.acuerdos}</p>}
                          </div>
                        </div>
                        <Evidencias entidad="entrevista" entidadId={x.id} estudianteId={x.estudiante_id} editable={x.tutor_id === usuario?.id} />
                      </Tarjeta>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Contenido>
      {nuevaSesion && <DialogoSesion seccionId={seccionId} onCerrar={() => setNuevaSesion(false)} />}
      {nuevaEntrevista && datos && <DialogoEntrevista estudiantes={datos.estudiantes} onCerrar={() => setNuevaEntrevista(false)} />}
    </>
  );
}

function DialogoSesion({ seccionId, onCerrar }: { seccionId: string; onCerrar(): void }) {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const [f, setF] = useState({ fecha: hoy(), tema: "", acuerdos: "" });
  const registrar = async () => {
    await guardar(db, "sesion_tutoria", { seccion_id: seccionId, tutor_id: usuario!.id, fecha: f.fecha, tema: f.tema.trim(), acuerdos: f.acuerdos.trim() || null }, colegioId);
    avisar(textoGuardado("Sesión registrada"));
    onCerrar();
  };
  return (
    <Dialogo abierto titulo="Nueva sesión de tutoría" onCerrar={onCerrar}
      acciones={<><Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton><Boton icono={Save} onClick={registrar} disabled={!f.tema.trim()}>Registrar</Boton></>}>
      <div className="space-y-3 pt-2 text-tinta">
        <Campo etiqueta="Fecha"><Entrada type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Campo>
        <Campo etiqueta="Tema"><Entrada value={f.tema} onChange={(e) => setF({ ...f, tema: e.target.value })} placeholder="Ejemplo: Prevención del acoso escolar" autoFocus /></Campo>
        <Campo etiqueta="Acuerdos (opcional)"><textarea value={f.acuerdos} onChange={(e) => setF({ ...f, acuerdos: e.target.value })} rows={3} className="campo" /></Campo>
        <p className="text-xs">Podrá adjuntar fotos o archivos después de registrarla.</p>
      </div>
    </Dialogo>
  );
}

export function DialogoEntrevista({ estudiantes, estudianteFijo, onCerrar }: { estudiantes: Estudiante[]; estudianteFijo?: string; onCerrar(): void }) {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const [estudianteId, setEstudianteId] = useState(estudianteFijo ?? estudiantes[0]?.id ?? "");
  const [apoderadoId, setApoderadoId] = useState("");
  const [f, setF] = useState({ fecha: hoy(), motivo: "", acuerdos: "" });
  const [asistio, setAsistio] = useState(true);
  const apoderados = useLiveQuery(async () => {
    const v = vivas(await db.tabla("estudiante_apoderado").where("estudiante_id").equals(estudianteId).toArray());
    const a = await db.tabla("apoderado").bulkGet(v.map((x) => x.apoderado_id));
    return v.map((x, i) => ({ id: x.apoderado_id, texto: a[i] ? `${nombreCompleto(a[i]!)} (${x.parentesco})` : x.parentesco }));
  }, [estudianteId], []);
  const registrar = async () => {
    await guardar(db, "entrevista", {
      estudiante_id: estudianteId, apoderado_id: apoderadoId || null, tutor_id: usuario!.id, fecha: f.fecha,
      motivo: f.motivo.trim(), acuerdos: f.acuerdos.trim() || null, asistio,
    }, colegioId);
    avisar(textoGuardado("Entrevista registrada"));
    onCerrar();
  };
  return (
    <Dialogo abierto titulo="Entrevista con la familia" onCerrar={onCerrar}
      acciones={<><Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton><Boton icono={Save} onClick={registrar} disabled={!f.motivo.trim() || !estudianteId}>Registrar</Boton></>}>
      <div className="space-y-3 pt-2 text-tinta">
        {!estudianteFijo && (
          <Campo etiqueta="Estudiante">
            <Selector value={estudianteId} onChange={(e) => { setEstudianteId(e.target.value); setApoderadoId(""); }}>
              {estudiantes.map((e) => <option key={e.id} value={e.id}>{nombreCompleto(e)}</option>)}
            </Selector>
          </Campo>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Con">
            <Selector value={apoderadoId} onChange={(e) => setApoderadoId(e.target.value)}>
              <option value="">{apoderados.length ? "Elegir apoderado" : "Sin apoderados registrados"}</option>
              {apoderados.map((a) => <option key={a.id} value={a.id}>{a.texto}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Fecha"><Entrada type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Campo>
        </div>
        <Campo etiqueta="Motivo"><textarea value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} rows={2} className="campo" autoFocus /></Campo>
        <Campo etiqueta="Acuerdos"><textarea value={f.acuerdos} onChange={(e) => setF({ ...f, acuerdos: e.target.value })} rows={2} className="campo" /></Campo>
        <Casilla marcada={asistio} onCambio={setAsistio}>La familia asistió</Casilla>
        <p className="flex items-center gap-1.5 text-xs"><UserRound className="h-3.5 w-3.5" aria-hidden /> Solo la ven usted, la dirección y la UGEL.</p>
      </div>
    </Dialogo>
  );
}
