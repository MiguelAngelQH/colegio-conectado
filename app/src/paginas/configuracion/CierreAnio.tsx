// Asistente de cierre del año escolar (dirección): revisar pendientes, confirmar la situación final,
// descargar actas y libretas, y cerrar el año. La situación la PROPONE la app (RVM 094-2020) y la
// dirección la confirma o corrige con motivo; el SIAGIE sigue siendo la fuente oficial.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { CircleCheck, ClipboardCheck, FileDown, FilePen, Lock, TriangleAlert } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { cargarCierre, descargarActas, resumenAsistencia, type DatosCierre, type FilaCierre } from "@/datos/cierre";
import { nombreCompleto } from "@/datos/consultas";
import { descargarLibretas } from "@/datos/libreta";
import { guardarLote, vivas, type Escritura } from "@/db/repositorio";
import type { SituacionFinal } from "@/db/tipos";
import { calcularAvance, faltaConclusion } from "@/dominio/notas";
import { NOMBRE_SITUACION, REGLAS_POR_DEFECTO, type Reglas } from "@/dominio/promocion";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Aviso, Boton, BotonRegresar, Contenido, Dialogo, Encabezado, Tarjeta, cx } from "@/ui/componentes";
import { Campo, Entrada, Segmentado, Selector, Vacio } from "@/ui/formulario";

type Paso = "revision" | "situacion" | "documentos" | "cerrar";

const TONO_SIT: Record<SituacionFinal, string> = {
  PRO: "bg-emerald-50 text-emerald-900 ring-emerald-200", RR: "bg-amber-50 text-amber-900 ring-amber-200", PER: "bg-red-50 text-red-900 ring-red-200",
};
function ChipSituacion({ s, propuesta }: { s: SituacionFinal; propuesta?: boolean }) {
  return <span className={cx("rounded-full px-2 py-0.5 text-[0.7rem] font-bold ring-1", TONO_SIT[s])} title={NOMBRE_SITUACION[s]}>{s}{propuesta && " (propuesta)"}</span>;
}

// ------------------------------------------------------------------ paso 1: revisión

function Revision({ d }: { d: DatosCierre }) {
  const datos = useLiveQuery(async () => {
    const [asignaciones, matriculas, usuarios, informes] = await Promise.all([
      db.tabla("docente_asignacion").toArray(), db.tabla("matricula").toArray(), db.tabla("usuario").toArray(), db.tabla("informe_tutor").toArray(),
    ]);
    const idsSec = new Set(d.secciones.map((s) => s.id));
    const asig = vivas(asignaciones).filter((a) => idsSec.has(a.seccion_id));
    const pendientesDocente = new Map<string, number>();
    for (const p of d.periodos) {
      for (const a of calcularAvance({ periodoId: p.id, asignaciones: asig, matriculas: vivas(matriculas), competencias: d.competencias, calificaciones: d.calificaciones })) {
        const falta = a.esperadas - a.registradas;
        if (falta > 0) pendientesDocente.set(a.asignacion.docente_id, (pendientesDocente.get(a.asignacion.docente_id) ?? 0) + falta);
      }
    }
    const nombres = new Map(usuarios.map((u) => [u.id, nombreCompleto(u)]));
    const conInforme = new Set(vivas(informes).filter((i) => i.anio_id === d.anio.id && (i.fortalezas || i.dificultades || i.recomendaciones)).map((i) => i.estudiante_id));
    return {
      docentes: [...pendientesDocente].map(([id, n]) => ({ nombre: nombres.get(id) ?? "Docente", n })).sort((a, b) => b.n - a.n),
      conclusiones: d.calificaciones.filter((c) => faltaConclusion(c)).length,
      informes: d.secciones.map((s) => ({ s, faltan: (d.porSeccion.get(s.id) ?? []).filter((f) => !conInforme.has(f.estudiante.id)).length, total: d.porSeccion.get(s.id)?.length ?? 0 }))
        .filter((x) => x.faltan > 0),
    };
  }, [d]);
  if (!datos) return null;
  const todoListo = !datos.docentes.length && !datos.conclusiones && !datos.informes.length;
  return (
    <div className="space-y-3">
      {todoListo && <Aviso tipo="ok" icono={CircleCheck}>No hay pendientes: puede pasar a la situación final.</Aviso>}
      <Tarjeta className="p-4">
        <h3 className="font-bold">Notas por registrar</h3>
        {datos.docentes.length === 0 ? <p className="text-sm text-tinta-suave">Todos los docentes completaron sus notas.</p> : (
          <ul className="mt-2 divide-y divide-sup/70 text-sm">
            {datos.docentes.map((x) => <li key={x.nombre} className="flex justify-between py-1.5"><span>{x.nombre}</span><span className="font-semibold tabular-nums text-amber-800">{x.n} notas</span></li>)}
          </ul>
        )}
      </Tarjeta>
      <Tarjeta className="p-4">
        <h3 className="font-bold">Conclusiones descriptivas</h3>
        <p className="text-sm text-tinta-suave">{datos.conclusiones ? `${datos.conclusiones} calificaciones B o C aún no tienen conclusión.` : "Todas las B y C tienen su conclusión."}</p>
      </Tarjeta>
      <Tarjeta className="p-4">
        <h3 className="font-bold">Informes de tutoría para el próximo año</h3>
        {datos.informes.length === 0 ? <p className="text-sm text-tinta-suave">Todos los tutores completaron sus informes.</p> : (
          <ul className="mt-2 divide-y divide-sup/70 text-sm">
            {datos.informes.map(({ s, faltan, total }) => (
              <li key={s.id} className="flex justify-between py-1.5">
                <span>{s.nombreLargo} <span className="text-tinta-suave">· {s.tutor ? nombreCompleto(s.tutor) : "sin tutor"}</span></span>
                <span className="font-semibold tabular-nums text-amber-800">{faltan} de {total}</span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      <p className="px-1 text-xs text-tinta-suave">Los pendientes no impiden continuar, pero la situación propuesta puede no ser exacta si faltan notas.</p>
    </div>
  );
}

// ------------------------------------------------------------------ paso 2: situación final

function FilaSituacion({ f, cerrado, onCambio }: { f: FilaCierre; cerrado: boolean; onCambio(sit: SituacionFinal, motivo: string): void }) {
  const actual = (f.matricula.situacion_final ?? f.propuesta.situacion) as SituacionFinal;
  const [sit, setSit] = useState<SituacionFinal>(actual);
  const [motivo, setMotivo] = useState(f.matricula.situacion_motivo ?? "");
  const cambia = sit !== f.propuesta.situacion;
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 font-semibold">{nombreCompleto(f.estudiante)}</span>
        {f.faltantes > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.7rem] font-semibold text-slate-700">Faltan {f.faltantes} notas</span>}
        <ChipSituacion s={f.propuesta.situacion} propuesta />
        <Selector value={sit} disabled={cerrado} aria-label="Situación final" className="!w-auto !py-1.5 text-sm"
          onChange={(e) => { const v = e.target.value as SituacionFinal; setSit(v); onCambio(v, motivo); }}>
          {(Object.keys(NOMBRE_SITUACION) as SituacionFinal[]).map((s) => <option key={s} value={s}>{s} · {NOMBRE_SITUACION[s]}</option>)}
        </Selector>
        {f.matricula.situacion_final && <CircleCheck className="h-5 w-5 text-emerald-700" aria-label="Confirmada" />}
      </div>
      <p className="text-xs text-tinta-suave">{f.propuesta.motivo}</p>
      {cambia && (
        <Entrada value={motivo} disabled={cerrado} placeholder="Motivo del cambio (obligatorio)" aria-label="Motivo del cambio"
          onChange={(e) => { setMotivo(e.target.value); onCambio(sit, e.target.value); }} />
      )}
    </div>
  );
}

function Situacion({ d }: { d: DatosCierre }) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [seccionId, setSeccionId] = useState(d.secciones[0]?.id ?? "");
  const [filtro, setFiltro] = useState<"todos" | "RR" | "PER">("todos");
  const [cambios, setCambios] = useState<Record<string, { sit: SituacionFinal; motivo: string }>>({});
  const filas = d.porSeccion.get(seccionId) ?? [];
  const visibles = filas.filter((f) => filtro === "todos" || (cambios[f.matricula.id]?.sit ?? f.matricula.situacion_final ?? f.propuesta.situacion) === filtro);
  const cerrado = !!d.anio.cerrado_en;
  const sinMotivo = filas.filter((f) => {
    const c = cambios[f.matricula.id];
    const sit = c?.sit ?? f.matricula.situacion_final ?? f.propuesta.situacion;
    const motivo = c?.motivo ?? f.matricula.situacion_motivo ?? "";
    return sit !== f.propuesta.situacion && !motivo.trim();
  }).length;

  const confirmar = async () => {
    const escrituras: Escritura[] = filas.map((f) => {
      const c = cambios[f.matricula.id];
      const sit = c?.sit ?? f.matricula.situacion_final ?? f.propuesta.situacion;
      const motivo = (c?.motivo ?? f.matricula.situacion_motivo ?? "").trim();
      return { tabla: "matricula", datos: { id: f.matricula.id, situacion_propuesta: f.propuesta.situacion, situacion_final: sit, situacion_motivo: sit === f.propuesta.situacion ? null : motivo } };
    });
    await guardarLote(db, escrituras, colegioId);
    setCambios({});
    avisar(textoGuardado(`Situación final confirmada en ${d.secciones.find((s) => s.id === seccionId)?.nombre ?? "la sección"}`));
  };

  const confirmadas = [...d.porSeccion.values()].flat().filter((f) => f.matricula.situacion_final).length;
  const total = [...d.porSeccion.values()].flat().length;
  const conteo = (s: SituacionFinal) => filas.filter((f) => (cambios[f.matricula.id]?.sit ?? f.matricula.situacion_final ?? f.propuesta.situacion) === s).length;

  return (
    <div className="space-y-3">
      <Tarjeta className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Campo etiqueta="Sección" className="flex-1">
          <Selector value={seccionId} onChange={(e) => { setSeccionId(e.target.value); setCambios({}); }}>
            {d.secciones.map((s) => {
              const fs = d.porSeccion.get(s.id) ?? [];
              const listas = fs.filter((f) => f.matricula.situacion_final).length;
              return <option key={s.id} value={s.id}>{s.nombreLargo} ({listas === fs.length && fs.length ? "confirmada" : `${listas}/${fs.length}`})</option>;
            })}
          </Selector>
        </Campo>
        <Segmentado etiqueta="Filtro" valor={filtro} onCambio={setFiltro} opciones={[{ valor: "todos", texto: "Todos" }, { valor: "RR", texto: `RR (${conteo("RR")})` }, { valor: "PER", texto: `PER (${conteo("PER")})` }]} />
      </Tarjeta>
      <p className="px-1 text-xs text-tinta-suave">{confirmadas} de {total} estudiantes con situación confirmada. Promovidos en esta sección: {conteo("PRO")}.</p>
      {visibles.length === 0 ? <Vacio icono={ClipboardCheck} titulo="Sin estudiantes en este filtro" /> : (
        <Tarjeta className="divide-y divide-sup/70 overflow-hidden">
          {visibles.map((f) => (
            <FilaSituacion key={`${f.matricula.id}-${f.matricula.situacion_final ?? ""}`} f={f} cerrado={cerrado}
              onCambio={(sit, motivo) => setCambios((c) => ({ ...c, [f.matricula.id]: { sit, motivo } }))} />
          ))}
        </Tarjeta>
      )}
      {!cerrado && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {sinMotivo > 0 && <p className="text-xs font-semibold text-red-800">{sinMotivo} cambios sin motivo.</p>}
          <Boton icono={CircleCheck} onClick={() => void confirmar()} disabled={sinMotivo > 0 || filas.length === 0}>Confirmar situación de la sección</Boton>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ paso 3: documentos

function Documentos({ d }: { d: DatosCierre }) {
  const avisar = useAvisar();
  const [generando, setGenerando] = useState<string | null>(null);
  const generar = async (clave: string, fn: () => Promise<void>) => {
    setGenerando(clave);
    try {
      await fn();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setGenerando(null);
    }
  };
  return (
    <div className="space-y-3">
      <Tarjeta className="flex flex-wrap items-center justify-between gap-3 p-4">
        <span className="text-sm">Actas de todas las secciones en un solo archivo.</span>
        <Boton icono={FileDown} cargando={generando === "todas"} onClick={() => void generar("todas", () => descargarActas(d, d.secciones.map((s) => s.id), `actas_${d.anio.anio}.pdf`))}>Todas las actas</Boton>
      </Tarjeta>
      <Tarjeta className="divide-y divide-sup/70">
        {d.secciones.map((s) => {
          const filas = d.porSeccion.get(s.id) ?? [];
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="min-w-0 flex-1 font-semibold">{s.nombreLargo} <span className="font-normal text-tinta-suave">· {filas.length} estudiantes</span></span>
              <Boton variante="vidrio" icono={FileDown} cargando={generando === `acta-${s.id}`}
                onClick={() => void generar(`acta-${s.id}`, () => descargarActas(d, [s.id], `acta_${d.anio.anio}_${s.nombre.replace(/[^a-zA-Z0-9]+/g, "_")}.pdf`))}>Acta</Boton>
              <Boton variante="vidrio" icono={FileDown} cargando={generando === `lib-${s.id}`} disabled={!filas.length}
                onClick={() => void generar(`lib-${s.id}`, () => descargarLibretas(filas.map((f) => f.estudiante.id), `libretas_${d.anio.anio}_${s.nombre.replace(/[^a-zA-Z0-9]+/g, "_")}.pdf`))}>Libretas</Boton>
            </div>
          );
        })}
      </Tarjeta>
      <p className="px-1 text-xs text-tinta-suave">Las libretas incluyen el nivel final de cada competencia y, después del cierre, la situación final y la asistencia del año. Compare las actas con las del SIAGIE antes de firmarlas.</p>
    </div>
  );
}

// ------------------------------------------------------------------ paso 4: cerrar

function Cerrar({ d }: { d: DatosCierre }) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [confirmando, setConfirmando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const filas = [...d.porSeccion.values()].flat();
  const sinConfirmar = filas.filter((f) => !f.matricula.situacion_final).length;

  const cerrar = async () => {
    setCerrando(true);
    try {
      const escrituras: Escritura[] = [];
      for (const s of d.secciones) {
        const resumen = await resumenAsistencia(s.id);
        for (const f of d.porSeccion.get(s.id) ?? []) {
          escrituras.push({ tabla: "matricula", datos: { id: f.matricula.id, asistencia_resumen: resumen.get(f.estudiante.id) ?? { P: 0, T: 0, F: 0, J: 0, porcentaje: null } } });
        }
      }
      // El año se marca al final: después ya no se aceptan cambios en sus notas ni asistencia.
      escrituras.push({ tabla: "anio_escolar", datos: { id: d.anio.id, cerrado_en: new Date().toISOString() } });
      await guardarLote(db, escrituras, colegioId);
      avisar(textoGuardado(`Año ${d.anio.anio} cerrado`));
      setConfirmando(false);
    } finally {
      setCerrando(false);
    }
  };

  if (d.anio.cerrado_en) {
    return (
      <Tarjeta className="space-y-3 p-5">
        <p className="flex items-center gap-2 font-bold"><Lock className="h-5 w-5" aria-hidden /> Año {d.anio.anio} cerrado</p>
        <p className="text-sm text-tinta-suave">Sus notas, asistencia e informes ya no se modifican. Quedan en el historial de cada estudiante.</p>
        <Link to="/configuracion/anio"><Boton icono={FilePen}>Iniciar el año {d.anio.anio + 1}</Boton></Link>
      </Tarjeta>
    );
  }
  return (
    <div className="space-y-3">
      {sinConfirmar > 0 && (
        <Aviso tipo="alerta" icono={TriangleAlert}>
          {sinConfirmar} estudiantes aún no tienen la situación final confirmada. Puede cerrar igual, pero quedarán sin situación en su historial.
        </Aviso>
      )}
      <Tarjeta className="space-y-2 p-5 text-sm">
        <p className="font-bold">Al cerrar el año {d.anio.anio}:</p>
        <ul className="list-disc space-y-1 pl-5 text-tinta-suave">
          <li>Se guarda el resumen de asistencia de cada estudiante.</li>
          <li>Ya no se pueden registrar ni cambiar notas, asistencia ni informes de este año.</li>
          <li>Todo queda en el historial de cada estudiante, para quien lo reciba el próximo año.</li>
        </ul>
        <div className="pt-2"><Boton icono={Lock} onClick={() => setConfirmando(true)}>Cerrar el año {d.anio.anio}</Boton></div>
      </Tarjeta>
      <Dialogo tam="chico" abierto={confirmando} titulo={`¿Cerrar el año ${d.anio.anio}?`} onCerrar={() => setConfirmando(false)}
        acciones={<>
          <Boton variante="fantasma" onClick={() => setConfirmando(false)}>Cancelar</Boton>
          <Boton icono={Lock} cargando={cerrando} onClick={() => void cerrar()}>Cerrar el año</Boton>
        </>}>
        Después de cerrarlo no se pueden cambiar sus notas ni su asistencia. Verifique que las actas coincidan con el SIAGIE.
      </Dialogo>
    </div>
  );
}

// ------------------------------------------------------------------ página

export function CierreAnio() {
  const [paso, setPaso] = useState<Paso>("revision");
  const reglas: Reglas = REGLAS_POR_DEFECTO;
  const d = useLiveQuery(() => cargarCierre(reglas), []);
  const pasos = useMemo(() => [
    { valor: "revision" as const, texto: "1. Revisión" }, { valor: "situacion" as const, texto: "2. Situación final" },
    { valor: "documentos" as const, texto: "3. Actas y libretas" }, { valor: "cerrar" as const, texto: "4. Cerrar" },
  ], []);
  if (d === null) return <Contenido><Vacio icono={ClipboardCheck} titulo="No hay un año escolar activo" /></Contenido>;
  if (!d) return null;
  return (
    <>
      <Encabezado etiqueta="Configuración" titulo={`Cierre del año ${d.anio.anio}`}
        subtitulo="La app propone la situación final según la RVM 094-2020; la dirección la confirma. El SIAGIE sigue siendo la fuente oficial." />
      <Contenido>
        <div className="overflow-x-auto pb-1"><Segmentado etiqueta="Paso" valor={paso} onCambio={setPaso} opciones={pasos} /></div>
        {paso === "revision" && <Revision d={d} />}
        {paso === "situacion" && <Situacion d={d} />}
        {paso === "documentos" && <Documentos d={d} />}
        {paso === "cerrar" && <Cerrar d={d} />}
        <div className="flex justify-center pt-2"><BotonRegresar a="/configuracion" /></div>
      </Contenido>
    </>
  );
}
