import { useEffect, useMemo, useState } from "react";
import { Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ExternalLink, Plus, Save, Send, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { nombreCompleto } from "@/datos/consultas";
import { nuevoId } from "@/db/local";
import { guardar, vivas } from "@/db/repositorio";
import type { Estudiante, Incidencia } from "@/db/tipos";
import { normalizar } from "@/dominio/texto";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Aviso, Boton, BotonRegresar, Contenido, Dialogo, Encabezado, Gema, Tarjeta, cx, orden } from "@/ui/componentes";
import { Evidencias } from "@/ui/Evidencias";
import { Buscador, Campo, Entrada, Segmentado, Selector, Vacio } from "@/ui/formulario";

/** Tipos de incidencia. Los de violencia o acoso se reportan en el SíseVe del MINEDU. */
export const TIPOS_INCIDENCIA: { tipo: string; siseve: boolean }[] = [
  { tipo: "Violencia física", siseve: true },
  { tipo: "Violencia psicológica o verbal", siseve: true },
  { tipo: "Violencia sexual", siseve: true },
  { tipo: "Acoso escolar (bullying)", siseve: true },
  { tipo: "Ciberacoso", siseve: true },
  { tipo: "Daño a la propiedad", siseve: false },
  { tipo: "Conducta inadecuada en clase", siseve: false },
  { tipo: "Uso indebido del celular", siseve: false },
  { tipo: "Inasistencias o tardanzas reiteradas", siseve: false },
  { tipo: "Consumo de sustancias", siseve: false },
  { tipo: "Otro", siseve: false },
];

const ESTADO: Record<Incidencia["estado"], { texto: string; clase: string }> = {
  abierta: { texto: "Abierta", clase: "bg-red-100/80 text-red-800" },
  en_seguimiento: { texto: "En seguimiento", clase: "bg-amber-100/80 text-amber-800" },
  cerrada: { texto: "Cerrada", clase: "bg-emerald-100/80 text-emerald-800" },
};
const SISEVE_URL = "https://siseve.minedu.gob.pe";
const hoy = () => new Date().toISOString().slice(0, 10);
const fecha = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long" });
const pendienteSiseve = (i: Incidencia) => !!i.requiere_siseve && !i.codigo_siseve?.trim();

export function Convivencia() {
  return (
    <Routes>
      <Route index element={<ListaIncidencias />} />
      <Route path=":id" element={<DetalleIncidencia />} />
    </Routes>
  );
}

function ListaIncidencias() {
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filtro, setFiltro] = useState<"activas" | "cerrada" | "todas">("activas");
  const [creando, setCreando] = useState<string | null>(null);

  useEffect(() => {
    const e = params.get("estudiante");
    if (e) {
      setCreando(e);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const datos = useLiveQuery(async () => {
    const incidencias = vivas(await db.tabla("incidencia").toArray()).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const ests = new Map((await db.tabla("estudiante").bulkGet([...new Set(incidencias.map((i) => i.estudiante_id).filter(Boolean) as string[])]))
      .filter(Boolean).map((e) => [e!.id, e!]));
    return { incidencias, ests };
  });
  if (!datos) return null;
  const lista = datos.incidencias.filter((i) => filtro === "todas" || (filtro === "cerrada" ? i.estado === "cerrada" : i.estado !== "cerrada"));
  const siseve = datos.incidencias.filter(pendienteSiseve).length;

  return (
    <>
      <Encabezado etiqueta="Convivencia escolar" titulo="Incidencias" subtitulo="Registro y seguimiento de situaciones de convivencia."
        accion={<Boton icono={Plus} onClick={() => setCreando("")} className="hidden sm:inline-flex">Registrar</Boton>} />
      <Contenido ancho="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <Segmentado etiqueta="Filtro" valor={filtro} onCambio={setFiltro} opciones={[
            { valor: "activas", texto: "Activas" }, { valor: "cerrada", texto: "Cerradas" }, { valor: "todas", texto: "Todas" },
          ]} />
          <Boton icono={Plus} onClick={() => setCreando("")} className="ml-auto sm:hidden">Registrar</Boton>
        </div>
        {siseve > 0 && (
          <Aviso tipo="error" icono={TriangleAlert} titulo={`${siseve} ${siseve === 1 ? "caso pendiente" : "casos pendientes"} de reportar en el SíseVe`}>
            Los casos de violencia o acoso escolar deben registrarse en el SíseVe del MINEDU. Abra cada caso para anotar el código del reporte.
          </Aviso>
        )}
        {lista.length === 0 ? (
          <Vacio icono={ShieldCheck} tono="tono-musgo" titulo={filtro === "activas" ? "No hay incidencias activas" : "Sin incidencias"} />
        ) : (
          <Tarjeta className="aparecer divide-y divide-sup/70 overflow-hidden" style={orden(1)}>
            {lista.map((i) => {
              const e = i.estudiante_id ? datos.ests.get(i.estudiante_id) : undefined;
              return (
                <button key={i.id} onClick={() => navegar(i.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-sup/40">
                  <Gema icono={ShieldAlert} tono={i.requiere_siseve ? "tono-coral" : "tono-ambar"} tam="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{i.tipo}</span>
                    <span className="block truncate text-xs text-tinta-suave">
                      {fecha(i.fecha)} · {e ? nombreCompleto(e) : "Sin estudiante identificado"}
                      {pendienteSiseve(i) && <span className="font-semibold text-red-700"> · Falta reporte SíseVe</span>}
                    </span>
                  </span>
                  <span className={cx("rounded-full px-2.5 py-1 text-[0.65rem] font-bold", ESTADO[i.estado].clase)}>{ESTADO[i.estado].texto}</span>
                </button>
              );
            })}
          </Tarjeta>
        )}
      </Contenido>
      {creando !== null && <DialogoIncidencia estudianteInicial={creando} onCerrar={() => setCreando(null)} onCreada={(id) => navegar(id)} />}
    </>
  );
}

function DialogoIncidencia({ estudianteInicial, onCerrar, onCreada }: { estudianteInicial: string; onCerrar(): void; onCreada(id: string): void }) {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const [busca, setBusca] = useState("");
  const [estudianteId, setEstudianteId] = useState(estudianteInicial);
  const [tipo, setTipo] = useState(TIPOS_INCIDENCIA[0].tipo);
  const [f, setF] = useState({ fecha: hoy(), descripcion: "" });
  const estudiantes = useLiveQuery(async () => vivas(await db.tabla("estudiante").toArray()).sort((a, b) => a.apellidos.localeCompare(b.apellidos)), [], [] as Estudiante[]);
  const filtrados = useMemo(() => estudiantes.filter((e) => normalizar(`${e.apellidos} ${e.nombres}`).includes(normalizar(busca))).slice(0, 50), [estudiantes, busca]);
  const elegido = estudiantes.find((e) => e.id === estudianteId);
  const requiere = TIPOS_INCIDENCIA.find((t) => t.tipo === tipo)?.siseve ?? false;

  const registrar = async () => {
    const id = nuevoId();
    await guardar(db, "incidencia", {
      id, estudiante_id: estudianteId || null, reportado_por: usuario!.id, fecha: f.fecha, tipo, descripcion: f.descripcion.trim(),
      estado: "abierta", codigo_siseve: null, requiere_siseve: requiere,
    }, colegioId);
    avisar(textoGuardado("Incidencia registrada"));
    onCreada(id);
  };

  return (
    <Dialogo abierto titulo="Registrar incidencia" onCerrar={onCerrar}
      acciones={<><Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton><Boton icono={Save} onClick={registrar} disabled={!f.descripcion.trim()}>Registrar</Boton></>}>
      <div className="space-y-3 pt-2 text-tinta">
        <div>
          <span className="mb-1.5 block text-sm font-semibold">Estudiante involucrado</span>
          {elegido ? (
            <div className="flex items-center justify-between rounded-2xl bg-sup/60 px-4 py-2.5 ring-1 ring-sup">
              <span className="font-semibold">{nombreCompleto(elegido)}</span>
              <Boton variante="fantasma" className="!min-h-8 !px-3 text-xs" onClick={() => setEstudianteId("")}>Cambiar</Boton>
            </div>
          ) : (
            <>
              <Buscador valor={busca} onCambio={setBusca} placeholder="Buscar por apellido" />
              {busca && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-2xl bg-sup/70 ring-1 ring-sup">
                  {filtrados.map((e) => (
                    <button key={e.id} type="button" onClick={() => setEstudianteId(e.id)} className="block w-full px-4 py-2 text-left text-sm hover:bg-sup">{nombreCompleto(e)}</button>
                  ))}
                </div>
              )}
              <p className="mt-1 text-xs">Puede dejarlo vacío si no se identificó al estudiante.</p>
            </>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Tipo">
            <Selector value={tipo} onChange={(e) => setTipo(e.target.value)}>{TIPOS_INCIDENCIA.map((t) => <option key={t.tipo}>{t.tipo}</option>)}</Selector>
          </Campo>
          <Campo etiqueta="Fecha"><Entrada type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Campo>
        </div>
        <Campo etiqueta="Qué ocurrió"><textarea value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} rows={4} className="campo" placeholder="Describa los hechos de forma objetiva" /></Campo>
        {requiere && <Aviso tipo="alerta" icono={TriangleAlert}>Este tipo de caso debe reportarse en el SíseVe. La app le recordará anotar el código del reporte.</Aviso>}
      </div>
    </Dialogo>
  );
}

function DetalleIncidencia() {
  const { id } = useParams();
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const [accion, setAccion] = useState("");
  const [codigo, setCodigo] = useState<string | null>(null);

  const datos = useLiveQuery(async () => {
    const inc = await db.tabla("incidencia").get(id!);
    if (!inc) return null;
    const est = inc.estudiante_id ? await db.tabla("estudiante").get(inc.estudiante_id) : undefined;
    const acciones = vivas(await db.tabla("incidencia_accion").where("incidencia_id").equals(inc.id).toArray()).sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.updated_at ?? "").localeCompare(b.updated_at ?? ""));
    const usuarios = new Map((await db.tabla("usuario").toArray()).map((u) => [u.id, u]));
    return { inc, est, acciones, usuarios };
  }, [id]);

  if (datos === null) return <Contenido><Vacio icono={ShieldAlert} titulo="No se encontró la incidencia" accion={<BotonRegresar a="/convivencia" />} /></Contenido>;
  if (!datos) return null;
  const { inc } = datos;
  const puedeEditar = usuario && (inc.reportado_por === usuario.id || usuario.roles.some((r) => r === "director" || r === "subdirector"));
  const autor = datos.usuarios.get(inc.reportado_por);

  const cambiar = async (cambios: Partial<Incidencia>, mensaje: string) => {
    await guardar(db, "incidencia", { id: inc.id, ...cambios }, colegioId);
    avisar(textoGuardado(mensaje));
  };
  const agregarAccion = async () => {
    await guardar(db, "incidencia_accion", { incidencia_id: inc.id, autor_id: usuario!.id, fecha: hoy(), texto: accion.trim() }, colegioId);
    // Registrar una acción pasa la incidencia a "en seguimiento".
    if (inc.estado === "abierta" && puedeEditar) await guardar(db, "incidencia", { id: inc.id, estado: "en_seguimiento" }, colegioId);
    setAccion("");
    avisar(textoGuardado("Acción registrada"));
  };

  return (
    <>
      <Encabezado etiqueta={`Incidencia · ${fecha(inc.fecha)}`} titulo={inc.tipo} />
      <Contenido ancho="max-w-3xl">
        <Tarjeta className="aparecer space-y-3 p-5" style={orden(1)}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("rounded-full px-3 py-1 text-xs font-bold", ESTADO[inc.estado].clase)}>{ESTADO[inc.estado].texto}</span>
            <span className="text-sm text-tinta-suave">Registró: {autor ? `${autor.nombres} ${autor.apellidos}` : "-"}</span>
          </div>
          <p className="font-semibold">{datos.est ? nombreCompleto(datos.est) : "Sin estudiante identificado"}</p>
          <p className="whitespace-pre-line text-sm">{inc.descripcion}</p>
          <Evidencias entidad="incidencia" entidadId={inc.id} estudianteId={inc.estudiante_id} editable={!!puedeEditar} />
          {puedeEditar && (
            <div className="flex flex-wrap gap-2 pt-1">
              {inc.estado !== "cerrada"
                ? <Boton variante="vidrio" icono={ShieldCheck} onClick={() => void cambiar({ estado: "cerrada" }, "Incidencia cerrada")}>Cerrar caso</Boton>
                : <Boton variante="vidrio" onClick={() => void cambiar({ estado: "en_seguimiento" }, "Incidencia reabierta")}>Reabrir</Boton>}
            </div>
          )}
        </Tarjeta>

        {inc.requiere_siseve && (
          <Tarjeta className={cx("aparecer space-y-3 p-5 ring-1", pendienteSiseve(inc) ? "ring-red-200" : "ring-emerald-200")} style={orden(2)}>
            <div className="flex items-start gap-3">
              <Gema icono={pendienteSiseve(inc) ? TriangleAlert : ShieldCheck} tono={pendienteSiseve(inc) ? "tono-coral" : "tono-musgo"} tam="sm" />
              <div className="text-sm">
                <p className="font-bold">{pendienteSiseve(inc) ? "Reporte en el SíseVe pendiente" : "Reportado en el SíseVe"}</p>
                <p className="text-tinta-suave">Los casos de violencia escolar se registran en el sistema del MINEDU. Luego anote aquí el código del reporte.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <a href={SISEVE_URL} target="_blank" rel="noreferrer"><Boton variante="vidrio" icono={ExternalLink} className="w-full">Abrir SíseVe</Boton></a>
              {puedeEditar && (
                <div className="flex flex-1 gap-2">
                  <Entrada value={codigo ?? inc.codigo_siseve ?? ""} onChange={(e) => setCodigo(e.target.value)} placeholder="Código del reporte" aria-label="Código del reporte SíseVe" />
                  <Boton icono={Save} disabled={codigo === null || codigo.trim() === (inc.codigo_siseve ?? "")}
                    onClick={() => { void cambiar({ codigo_siseve: codigo!.trim() || null }, "Código guardado"); setCodigo(null); }}>Guardar</Boton>
                </div>
              )}
            </div>
          </Tarjeta>
        )}

        <section className="space-y-2">
          <h2 className="etiqueta px-1">Seguimiento</h2>
          {datos.acciones.length > 0 && (
            <Tarjeta className="divide-y divide-sup/70">
              {datos.acciones.map((a) => {
                const u = datos.usuarios.get(a.autor_id);
                return (
                  <div key={a.id} className="px-4 py-3 text-sm">
                    <p className="text-xs text-tinta-suave">{fecha(a.fecha)} · {u ? `${u.nombres} ${u.apellidos}` : ""}</p>
                    <p className="whitespace-pre-line">{a.texto}</p>
                  </div>
                );
              })}
            </Tarjeta>
          )}
          {inc.estado !== "cerrada" && (
            <Tarjeta className="space-y-2 p-4">
              <textarea value={accion} onChange={(e) => setAccion(e.target.value)} rows={3} className="campo" aria-label="Nueva acción de seguimiento"
                placeholder="Acción realizada: conversación con los estudiantes, citación a la familia, derivación..." />
              <div className="flex justify-end"><Boton icono={Send} onClick={agregarAccion} disabled={!accion.trim()}>Registrar acción</Boton></div>
            </Tarjeta>
          )}
        </section>
        <div className="flex justify-center pt-2"><BotonRegresar a="/convivencia" /></div>
      </Contenido>
    </>
  );
}
