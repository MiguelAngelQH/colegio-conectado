import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FileDown, Lock, LockOpen, TriangleAlert } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { anioActivo, nombreCompleto, seccionesDetalle, type SeccionDetalle } from "@/datos/consultas";
import { descargarLibretas } from "@/datos/libreta";
import { guardar, vivas } from "@/db/repositorio";
import type { Periodo, Usuario } from "@/db/tipos";
import { calcularAvance, type AvanceAsignacion } from "@/dominio/notas";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Aviso, Boton, Contenido, Dialogo, Gema, Tarjeta, cx, orden } from "@/ui/componentes";
import { Campo, Segmentado, Selector, Vacio } from "@/ui/formulario";

function Barra({ porcentaje }: { porcentaje: number }) {
  const color = porcentaje >= 100 ? "from-emerald-400 to-blue-500" : porcentaje >= 60 ? "from-amber-300 to-amber-500" : "from-red-400 to-red-500";
  return (
    <div className="h-2 overflow-hidden rounded-full bg-sup/60">
      <div className={cx("h-full rounded-full bg-gradient-to-r transition-all", color)} style={{ width: `${Math.min(100, porcentaje)}%` }} />
    </div>
  );
}

export function PanelNotas() {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [periodoId, setPeriodoId] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [seccionLibretas, setSeccionLibretas] = useState("");
  const [generando, setGenerando] = useState(false);

  const datos = useLiveQuery(async () => {
    const anio = await anioActivo();
    if (!anio) return null;
    const [periodos, secciones, asignaciones, matriculas, competencias, calificaciones, usuarios, areas] = await Promise.all([
      db.tabla("periodo").where("anio_id").equals(anio.id).toArray(),
      seccionesDetalle(anio.id),
      db.tabla("docente_asignacion").toArray(),
      db.tabla("matricula").toArray(),
      db.tabla("competencia").toArray(),
      db.tabla("calificacion").toArray(),
      db.tabla("usuario").toArray(),
      db.tabla("area").toArray(),
    ]);
    return {
      periodos: vivas(periodos).sort((a, b) => a.numero - b.numero),
      secciones, asignaciones: vivas(asignaciones), matriculas: matriculas.filter((m) => m.anio_id === anio.id), competencias, calificaciones,
      usuarios: new Map(usuarios.map((u) => [u.id, u])), areas: new Map(areas.map((a) => [a.id, a])),
    };
  });

  useEffect(() => {
    if (!datos || periodoId) return;
    const hoy = new Date().toISOString().slice(0, 10);
    const p = datos.periodos.find((x) => x.inicio <= hoy && hoy <= x.fin) ?? [...datos.periodos].reverse().find((x) => x.inicio <= hoy) ?? datos.periodos[0];
    if (p) setPeriodoId(p.id);
    if (datos.secciones[0]) setSeccionLibretas(datos.secciones[0].id);
  }, [datos, periodoId]);

  const avance = useMemo(() => (datos && periodoId ? calcularAvance({ periodoId, ...datos }) : []), [datos, periodoId]);
  if (!datos) return null;
  const periodo = datos.periodos.find((p) => p.id === periodoId);
  if (!periodo) return <Contenido><Vacio icono={Lock} titulo="Aún no hay periodos">Configure el año escolar primero.</Vacio></Contenido>;

  const esperadas = avance.reduce((s, a) => s + a.esperadas, 0);
  const registradas = avance.reduce((s, a) => s + a.registradas, 0);
  const sinConclusion = avance.reduce((s, a) => s + a.sinConclusion, 0);
  const total = esperadas ? Math.round((registradas / esperadas) * 100) : 0;

  // Agrupado por docente, del más atrasado al más avanzado.
  const porDocente = [...avance.reduce((m, a) => {
    const l = m.get(a.asignacion.docente_id) ?? [];
    l.push(a);
    return m.set(a.asignacion.docente_id, l);
  }, new Map<string, AvanceAsignacion[]>())]
    .map(([docenteId, lista]) => {
      const e = lista.reduce((s, a) => s + a.esperadas, 0);
      const r = lista.reduce((s, a) => s + a.registradas, 0);
      return { docente: datos.usuarios.get(docenteId), lista, porcentaje: e ? Math.round((r / e) * 100) : 0, pendientes: lista.reduce((s, a) => s + a.sinConclusion, 0) };
    })
    .sort((a, b) => a.porcentaje - b.porcentaje);

  const cambiarEstado = async (estado: Periodo["estado"]) => {
    await guardar(db, "periodo", { id: periodo.id, estado, ...(estado === "abierto" ? { motivo_reapertura: motivo.trim() } : {}) }, colegioId);
    avisar(textoGuardado(estado === "cerrado" ? `${periodo.nombre} cerrado` : `${periodo.nombre} reabierto`));
    setCerrando(false);
    setReabriendo(false);
    setMotivo("");
  };

  const libretas = async (seccion: SeccionDetalle) => {
    setGenerando(true);
    try {
      const ids = datos.matriculas.filter((m) => m.seccion_id === seccion.id && !m.eliminado && m.estado === "matriculado").map((m) => m.estudiante_id);
      const ests = (await db.tabla("estudiante").bulkGet(ids)).filter(Boolean).sort((a, b) => a!.apellidos.localeCompare(b!.apellidos));
      await descargarLibretas(ests.map((e) => e!.id), `libretas_${seccion.nombre.replace(/[^\w]+/g, "_")}.pdf`);
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <Contenido>
      <Tarjeta className="aparecer space-y-4 p-5" style={orden(1)}>
        <div className="flex flex-wrap items-center gap-3">
          <Segmentado etiqueta="Periodo" valor={periodoId} onCambio={setPeriodoId} opciones={datos.periodos.map((p) => ({ valor: p.id, texto: p.nombre.split(" ")[0] }))} />
          <span className={cx("ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold", periodo.estado === "cerrado" ? "bg-slate-200/80 text-slate-700" : "bg-emerald-100/80 text-emerald-800")}>
            {periodo.estado === "cerrado" ? <Lock className="h-3.5 w-3.5" aria-hidden /> : <LockOpen className="h-3.5 w-3.5" aria-hidden />}
            {periodo.estado === "cerrado" ? "Cerrado" : "Abierto"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-sup/45 p-3 ring-1 ring-sup/80">
            <p className="titulo-display text-3xl font-bold">{total}%</p>
            <p className="text-xs text-tinta-suave">avance</p>
          </div>
          <div className="rounded-2xl bg-sup/45 p-3 ring-1 ring-sup/80">
            <p className="titulo-display text-3xl font-bold">{registradas}</p>
            <p className="text-xs text-tinta-suave">de {esperadas} notas</p>
          </div>
          <div className={cx("rounded-2xl p-3 ring-1", sinConclusion ? "bg-amber-50/70 ring-amber-200" : "bg-sup/45 ring-sup/80")}>
            <p className={cx("titulo-display text-3xl font-bold", sinConclusion > 0 && "text-amber-700")}>{sinConclusion}</p>
            <p className="text-xs text-tinta-suave">conclusiones pendientes</p>
          </div>
        </div>
        <Barra porcentaje={total} />
        <div className="flex flex-wrap justify-end gap-2">
          {periodo.estado === "abierto"
            ? <Boton icono={Lock} onClick={() => setCerrando(true)}>Cerrar {periodo.nombre}</Boton>
            : <Boton variante="vidrio" icono={LockOpen} onClick={() => setReabriendo(true)}>Reabrir {periodo.nombre}</Boton>}
        </div>
        {periodo.estado === "abierto" && periodo.motivo_reapertura && (
          <p className="text-xs text-tinta-suave">Reabierto por: {periodo.motivo_reapertura}</p>
        )}
      </Tarjeta>

      <section className="space-y-2">
        <h2 className="etiqueta px-1">Avance por docente</h2>
        {porDocente.length === 0 ? (
          <Vacio icono={TriangleAlert} titulo="No hay asignaciones">Asigne áreas a los docentes en Configuración.</Vacio>
        ) : (
          <Tarjeta className="divide-y divide-sup/70">
            {porDocente.map(({ docente, lista, porcentaje, pendientes }) => (
              <details key={docente?.id ?? lista[0].asignacion.id} className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{docente ? nombreCompleto(docente as Usuario) : "Docente"}</span>
                    <span className="block text-xs text-tinta-suave">{lista.length} {lista.length === 1 ? "curso" : "cursos"}{pendientes > 0 && <span className="text-amber-700"> · {pendientes} conclusiones pendientes</span>}</span>
                  </span>
                  <span className="w-24"><Barra porcentaje={porcentaje} /></span>
                  <span className="titulo-display w-12 text-right font-bold">{porcentaje}%</span>
                </summary>
                <ul className="mt-3 space-y-2 pl-1">
                  {lista.map((a) => (
                    <li key={a.asignacion.id} className="flex items-center gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {datos.areas.get(a.asignacion.area_id)?.nombre} · {datos.secciones.find((s) => s.id === a.asignacion.seccion_id)?.nombre}
                      </span>
                      <span className="text-xs text-tinta-suave">{a.registradas}/{a.esperadas}</span>
                      <span className="w-16"><Barra porcentaje={a.porcentaje} /></span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </Tarjeta>
        )}
      </section>

      <Tarjeta className="aparecer space-y-3 p-5">
        <div className="flex items-center gap-3">
          <Gema icono={FileDown} tono="tono-musgo" />
          <div>
            <h2 className="font-bold">Libretas (informes de progreso)</h2>
            <p className="text-sm text-tinta-suave">PDF con todos los periodos registrados. Se genera en este equipo, sin internet.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Campo etiqueta="Sección" className="flex-1">
            <Selector value={seccionLibretas} onChange={(e) => setSeccionLibretas(e.target.value)}>
              {datos.secciones.map((s) => <option key={s.id} value={s.id}>{s.nombreLargo} ({s.estudiantes})</option>)}
            </Selector>
          </Campo>
          <Boton icono={FileDown} cargando={generando} disabled={!seccionLibretas}
            onClick={() => { const s = datos.secciones.find((x) => x.id === seccionLibretas); if (s) void libretas(s); }}>
            Descargar libretas
          </Boton>
        </div>
      </Tarjeta>

      <Dialogo tam="chico" abierto={cerrando} titulo={`¿Cerrar el ${periodo.nombre}?`} onCerrar={() => setCerrando(false)}
        acciones={<>
          <Boton variante="fantasma" onClick={() => setCerrando(false)}>Cancelar</Boton>
          <Boton icono={Lock} onClick={() => void cambiarEstado("cerrado")} disabled={sinConclusion > 0}>Cerrar periodo</Boton>
        </>}>
        <div className="space-y-3">
          <p>Al cerrar, ningún docente podrá modificar las notas de este periodo (tampoco desde equipos que estaban sin conexión).</p>
          {sinConclusion > 0 && (
            <Aviso tipo="error" icono={TriangleAlert}>Faltan {sinConclusion} conclusiones descriptivas en notas B o C. La norma las exige antes del cierre.</Aviso>
          )}
          {total < 100 && sinConclusion === 0 && (
            <Aviso tipo="alerta" icono={TriangleAlert}>El registro está al {total}%: faltan {esperadas - registradas} notas. Puede cerrar igual si corresponde.</Aviso>
          )}
        </div>
      </Dialogo>

      <Dialogo tam="chico" abierto={reabriendo} titulo={`Reabrir el ${periodo.nombre}`} onCerrar={() => setReabriendo(false)}
        acciones={<>
          <Boton variante="fantasma" onClick={() => setReabriendo(false)}>Cancelar</Boton>
          <Boton icono={LockOpen} onClick={() => void cambiarEstado("abierto")} disabled={motivo.trim().length < 5}>Reabrir</Boton>
        </>}>
        <p className="mb-2">Indique el motivo. Quedará registrado en el historial de cambios.</p>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="campo" placeholder="Ejemplo: corrección de la nota de un estudiante" aria-label="Motivo de la reapertura" autoFocus />
      </Dialogo>
    </Contenido>
  );
}
