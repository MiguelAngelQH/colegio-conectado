import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarCheck, ClipboardList, FileDown, FileCheck, GraduationCap, ShieldAlert, TriangleAlert } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { anioActivo, nombreCompleto, seccionesDetalle } from "@/datos/consultas";
import { descargarReporte } from "@/datos/reporte";
import { vivas } from "@/db/repositorio";
import type { Nivel } from "@/db/tipos";
import { calcularAvance } from "@/dominio/notas";
import { calcularPanel } from "@/dominio/panel";
import { UMBRAL_ASISTENCIA } from "@/dominio/seguimiento";
import { useAvisar } from "@/ui/avisos";
import { Boton, Contenido, Encabezado, Tarjeta, cx, orden } from "@/ui/componentes";
import { Campo, Segmentado, Selector, Vacio } from "@/ui/formulario";
import { AreaAsistencia, BarrasDivergentesNiveles, BarrasRanking, ColumnasConteo, DonaNiveles, MapaCalor, TarjetaKpi } from "@/ui/graficos";

const hoyISO = () => new Date().toISOString().slice(0, 10);
const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "short" }).replace(".", "");
const fechaMedia = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long" });
const nombreMes = (m: string, formato: "short" | "long") =>
  new Date(`${m}-15T12:00:00`).toLocaleDateString("es-PE", formato === "long" ? { month: "long", year: "numeric" } : { month: "short" }).replace(".", "");
const RANGOS = [4, 8, 14] as const;

function SelectorRango({ valor, onCambio }: { valor: number; onCambio(v: (typeof RANGOS)[number]): void }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 p-0.5" role="group" aria-label="Semanas a mostrar">
      {RANGOS.map((r) => (
        <button key={r} type="button" onClick={() => onCambio(r)} aria-pressed={valor === r}
          className={cx("rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums transition", valor === r ? "bg-white text-tinta shadow-sm" : "text-tinta-suave hover:text-tinta")}>
          {r} sem.
        </button>
      ))}
    </span>
  );
}

export function Paneles() {
  const { usuario } = useApp();
  const avisar = useAvisar();
  const esUgel = !!usuario?.roles.includes("ugel");
  const [nivel, setNivel] = useState<"todos" | Nivel>("todos");
  const [seccionId, setSeccionId] = useState("");
  const [periodoId, setPeriodoId] = useState("");
  const [generando, setGenerando] = useState(false);
  const [rango, setRango] = useState<(typeof RANGOS)[number]>(8);

  const base = useLiveQuery(async () => {
    const anio = await anioActivo();
    if (!anio) return null;
    const [periodos, secciones, estudiantes, matriculas, sesiones, asistencias, calificaciones, competencias, areas, asignaciones, incidencias, justificaciones, usuarios, colegios] = await Promise.all([
      db.tabla("periodo").where("anio_id").equals(anio.id).toArray(),
      seccionesDetalle(anio.id),
      db.tabla("estudiante").toArray(),
      db.tabla("matricula").toArray(),
      db.tabla("asistencia_sesion").toArray(),
      db.tabla("asistencia").toArray(),
      db.tabla("calificacion").toArray(),
      db.tabla("competencia").toArray(),
      db.tabla("area").toArray(),
      db.tabla("docente_asignacion").toArray(),
      db.tabla("incidencia").toArray(),
      db.tabla("justificacion").toArray(),
      db.tabla("usuario").toArray(),
      db.tabla("colegio").toArray(),
    ]);
    return {
      anio, periodos: vivas(periodos).sort((a, b) => a.numero - b.numero), secciones, estudiantes: vivas(estudiantes),
      matriculas: matriculas.filter((m) => m.anio_id === anio.id), sesiones, asistencias, calificaciones, competencias,
      areas: new Map(areas.map((a) => [a.id, a])), asignaciones, incidencias, justificaciones,
      usuarios: new Map(usuarios.map((u) => [u.id, u])), colegio: colegios[0],
    };
  });

  // Periodo por defecto: el último ya terminado que tiene notas (el que está en curso suele estar casi vacío).
  useEffect(() => {
    if (!base || periodoId) return;
    const tieneNotas = (id: string) => base.calificaciones.some((c) => c.periodo_id === id && c.nivel_logro);
    const recientes = [...base.periodos].reverse();
    const conNotas = recientes.find((p) => p.fin < hoyISO() && tieneNotas(p.id)) ?? recientes.find((p) => tieneNotas(p.id));
    setPeriodoId((conNotas ?? base.periodos[0])?.id ?? "");
  }, [base, periodoId]);

  // Solo los niveles que el colegio tiene: si no hay primaria, no se ofrece.
  const niveles = useMemo(() => (["primaria", "secundaria"] as Nivel[]).filter((n) => (base?.secciones ?? []).some((s) => s.grado?.nivel === n)), [base]);
  const ambos = niveles.length > 1;
  const seccionesFiltradas = useMemo(() => (base?.secciones ?? []).filter((s) => nivel === "todos" || s.grado?.nivel === nivel), [base, nivel]);
  useEffect(() => setSeccionId(""), [nivel]);

  const panel = useMemo(() => {
    if (!base) return null;
    const visibles = new Set((seccionId ? seccionesFiltradas.filter((s) => s.id === seccionId) : seccionesFiltradas).map((s) => s.id));
    return calcularPanel({
      hoy: hoyISO(), periodoId: periodoId || null, anio: base.anio.anio, estudiantes: base.estudiantes,
      matriculas: base.matriculas.filter((m) => visibles.has(m.seccion_id)),
      seccionNombre: (id) => base.secciones.find((s) => s.id === id)?.nombre ?? "",
      sesiones: base.sesiones, asistencias: base.asistencias, calificaciones: base.calificaciones, competencias: base.competencias,
      areaNombre: (id) => {
        const a = base.areas.get(id);
        if (!a) return "Área";
        // Con ambos niveles a la vista, la misma área aparece dos veces: se indica el nivel.
        return nivel === "todos" && ambos ? `${a.nombre} · ${a.nivel === "primaria" ? "Prim." : "Sec."}` : a.nombre;
      }, asignaciones: base.asignaciones, incidencias: base.incidencias, justificaciones: base.justificaciones,
    });
  }, [base, seccionesFiltradas, seccionId, periodoId, nivel]);

  const avanceDocentes = useMemo(() => {
    if (!base || !periodoId) return [];
    const visibles = new Set((seccionId ? seccionesFiltradas.filter((s) => s.id === seccionId) : seccionesFiltradas).map((s) => s.id));
    const av = calcularAvance({ periodoId, asignaciones: vivas(base.asignaciones).filter((a) => visibles.has(a.seccion_id)), matriculas: base.matriculas, competencias: base.competencias, calificaciones: base.calificaciones });
    const porDoc = new Map<string, { e: number; r: number }>();
    for (const a of av) {
      const x = porDoc.get(a.asignacion.docente_id) ?? { e: 0, r: 0 };
      porDoc.set(a.asignacion.docente_id, { e: x.e + a.esperadas, r: x.r + a.registradas });
    }
    return [...porDoc].map(([id, x]) => {
      const u = base.usuarios.get(id);
      return { etiqueta: u ? nombreCompleto(u) : "Docente", valor: x.e ? Math.round((x.r / x.e) * 100) : 0, detalle: `${x.r} de ${x.e} notas` };
    }).sort((a, b) => a.valor - b.valor);
  }, [base, seccionesFiltradas, seccionId, periodoId]);

  const incMes = panel && panel.incidenciasPorMes.length >= 2
    ? { actual: panel.incidenciasPorMes.at(-1)!.n, anterior: panel.incidenciasPorMes.at(-2)!.n } : null;

  if (base === null) return <Contenido><Vacio icono={ClipboardList} titulo="Aún no hay un año escolar configurado" /></Contenido>;
  if (!base || !panel) return null;
  const periodo = base.periodos.find((p) => p.id === periodoId);
  const alcance = seccionId ? base.secciones.find((s) => s.id === seccionId)?.nombreLargo : nivel === "todos" ? "Todo el colegio" : nivel === "primaria" ? "Primaria" : "Secundaria";

  const reporte = async () => {
    setGenerando(true);
    try {
      await descargarReporte({ panel, colegio: base.colegio?.nombre ?? "", ugel: base.colegio?.ugel ?? "", alcance: alcance ?? "", periodo: periodo?.nombre ?? "", avanceDocentes });
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <>
      <Encabezado etiqueta={esUgel ? "Supervisión UGEL" : "Dirección"} titulo="Indicadores" subtitulo={`${base.colegio?.nombre ?? ""} · Año ${base.anio.anio} · ${panel.matriculados} estudiantes matriculados`}
        accion={<Boton variante="vidrio" icono={FileDown} onClick={reporte} cargando={generando} className="hidden sm:inline-flex">Reporte PDF</Boton>} />
      <Contenido ancho="max-w-6xl">
        {/* Filtros: una sola fila sobre los gráficos */}
        <Tarjeta className="aparecer flex flex-col gap-3 p-4 lg:flex-row lg:items-end" style={orden(1)}>
          {ambos && (
            <div>
              <span className="mb-1.5 block text-sm font-semibold">Nivel</span>
              <Segmentado etiqueta="Nivel" valor={nivel} onCambio={setNivel} opciones={[{ valor: "todos", texto: "Todos" }, { valor: "primaria", texto: "Primaria" }, { valor: "secundaria", texto: "Secundaria" }]} />
            </div>
          )}
          <Campo etiqueta="Sección" className="lg:w-64">
            <Selector value={seccionId} onChange={(e) => setSeccionId(e.target.value)}>
              <option value="">Todas</option>
              {seccionesFiltradas.map((s) => <option key={s.id} value={s.id}>{s.nombreLargo}</option>)}
            </Selector>
          </Campo>
          <div>
            <span className="mb-1.5 block text-sm font-semibold">Periodo (notas)</span>
            <Segmentado etiqueta="Periodo" valor={periodoId} onCambio={setPeriodoId} opciones={base.periodos.map((p) => ({ valor: p.id, texto: p.nombre.split(" ")[0] }))} />
          </div>
          <Boton variante="vidrio" icono={FileDown} onClick={reporte} cargando={generando} className="sm:hidden">Reporte PDF</Boton>
        </Tarjeta>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Indicadores principales">
          <TarjetaKpi className="aparecer" icono={CalendarCheck} titulo="Asistencia · 30 días"
            valor={panel.asistencia30 ?? "-"} unidad={panel.asistencia30 === null ? undefined : "%"}
            estado={panel.asistencia30 === null ? null : panel.asistencia30 < UMBRAL_ASISTENCIA ? { texto: "Bajo la meta", tipo: "alerta" } : { texto: "En la meta", tipo: "ok" }}
            variacion={panel.asistencia30 !== null && panel.asistenciaAnterior !== null
              ? { delta: panel.asistencia30 - panel.asistenciaAnterior, unidad: " pts", mejorSiSube: true, referencia: "vs. 30 días previos" } : null}
            serie={panel.semanas.slice(-8).map((s) => s.porcentaje)} />
          <TarjetaKpi className="aparecer" icono={ClipboardList} titulo="Notas registradas"
            valor={panel.avanceNotas ?? "-"} unidad={panel.avanceNotas === null ? undefined : "%"} pie={periodo?.nombre}
            estado={panel.avanceNotas === 100 ? { texto: "Completo", tipo: "ok" } : null} enlace={esUgel ? undefined : "/notas"} />
          <TarjetaKpi className="aparecer" icono={TriangleAlert} titulo="Estudiantes con alertas"
            valor={panel.enRiesgo.length} pie={`de ${panel.matriculados} matriculados`} />
          <TarjetaKpi className="aparecer" icono={ShieldAlert} titulo="Incidencias abiertas" valor={panel.incidenciasAbiertas}
            estado={panel.sisevePendientes ? { texto: `${panel.sisevePendientes} sin SíseVe`, tipo: "alerta" } : null}
            variacion={incMes ? { delta: incMes.actual - incMes.anterior, unidad: "", mejorSiSube: false, referencia: "casos vs. mes anterior" } : null}
            serie={panel.incidenciasPorMes.map((m) => m.n)} colorSerie="#c2410c" enlace={esUgel ? undefined : "/convivencia"} />
          <TarjetaKpi className="aparecer col-span-2 md:col-span-1" icono={FileCheck} titulo="Justificaciones por revisar" valor={panel.justificacionesPendientes}
            pie={panel.justificacionesPendientes ? "Revíselas para actualizar la asistencia" : "Todo al día"} enlace={esUgel ? undefined : "/asistencia/justificaciones"} />
        </section>

        <div className="grid gap-4 lg:grid-cols-12">
          <AreaAsistencia className="lg:col-span-8" titulo="Asistencia semanal" subtitulo={`Últimas ${rango} semanas · ${alcance}`} meta={UMBRAL_ASISTENCIA}
            acciones={<SelectorRango valor={rango} onCambio={setRango} />}
            puntos={panel.semanas.slice(-rango).map((s) => ({ etiqueta: fechaCorta(s.semana), detalle: `Semana del ${fechaMedia(s.semana)}`, porcentaje: s.porcentaje, P: s.P, T: s.T, F: s.F, J: s.J }))} />
          <DonaNiveles className="lg:col-span-4" titulo="Niveles de logro" subtitulo={`${periodo?.nombre ?? ""} · ${alcance}`} conteo={panel.distribucionTotal} />

          {panel.distribucion.length ? (
            <BarrasDivergentesNiveles className="lg:col-span-7" titulo="Logros por área" subtitulo={`${periodo?.nombre ?? ""} · ${alcance}`}
              filas={[...panel.distribucion].sort((a, b) => (b.conteo.AD + b.conteo.A) / b.total - (a.conteo.AD + a.conteo.A) / a.total)
                .map((d) => ({ etiqueta: d.area, conteo: d.conteo, total: d.total }))} />
          ) : (
            <div className="lg:col-span-7"><Vacio icono={ClipboardList} tono="tono-cielo" titulo="Sin notas en este periodo" /></div>
          )}
          <BarrasRanking className="lg:col-span-5" titulo="Asistencia por sección" subtitulo="Últimos 30 días" nombreValor="Asistencia" sufijo="%" maximo={100}
            meta={{ valor: UMBRAL_ASISTENCIA, etiqueta: `Meta ${UMBRAL_ASISTENCIA}%` }}
            items={panel.porSeccion.map((s) => ({ etiqueta: s.seccion, valor: s.porcentaje, detalle: `${s.registros} registros` }))} />

          <MapaCalor className="lg:col-span-12" titulo="Inasistencia por día" subtitulo={`Últimas 14 semanas · ${alcance}`}
            dias={panel.dias} desde={panel.semanas[0]?.semana ?? hoyISO()} hasta={hoyISO()} />

          {avanceDocentes.length > 0 && (
            <BarrasRanking className="lg:col-span-6" titulo="Avance del registro de notas" subtitulo={`Por docente · ${periodo?.nombre ?? ""}`} nombreValor="Avance"
              sufijo="%" maximo={100} items={avanceDocentes} />
          )}
          <ColumnasConteo className={avanceDocentes.length > 0 ? "lg:col-span-6" : "lg:col-span-12"} titulo="Incidencias por mes" subtitulo="Últimos 6 meses" nombreValor="Incidencias"
            puntos={panel.incidenciasPorMes.map((m) => ({ etiqueta: nombreMes(m.mes, "short"), detalle: nombreMes(m.mes, "long"), valor: m.n, desglose: m.tipos }))} />
        </div>

        <section className="space-y-2">
          <h2 className="etiqueta flex items-center gap-1.5 px-1"><TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Estudiantes que necesitan atención ({panel.enRiesgo.length})</h2>
          {panel.enRiesgo.length === 0 ? <Vacio icono={GraduationCap} tono="tono-musgo" titulo="Ningún estudiante con alertas" /> : (
            <Tarjeta className="divide-y divide-white/70 overflow-hidden">
              {panel.enRiesgo.slice(0, 30).map((r) => {
                const fila = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{nombreCompleto(r.estudiante)}</span>
                      <span className="block truncate text-xs text-amber-800">{r.alertas.join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-xs text-tinta-suave">{r.seccion}</span>
                  </>
                );
                return esUgel
                  ? <div key={r.estudiante.id} className="flex items-center gap-3 px-4 py-3">{fila}</div>
                  : <Link key={r.estudiante.id} to={`/tutoria/estudiante/${r.estudiante.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/40">{fila}</Link>;
              })}
              {panel.enRiesgo.length > 30 && <p className="px-4 py-3 text-xs text-tinta-suave">y {panel.enRiesgo.length - 30} más (ver el reporte PDF).</p>}
            </Tarjeta>
          )}
        </section>
      </Contenido>
    </>
  );
}
