import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarCheck, ClipboardList, FileDown, FileCheck, GraduationCap, ShieldAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { anioActivo, nombreCompleto, seccionesDetalle } from "@/datos/consultas";
import { descargarReporte } from "@/datos/reporte";
import { vivas } from "@/db/repositorio";
import type { Nivel } from "@/db/tipos";
import { calcularAvance } from "@/dominio/notas";
import { calcularPanel } from "@/dominio/panel";
import { UMBRAL_ASISTENCIA } from "@/dominio/seguimiento";
import { useAvisar } from "@/ui/avisos";
import { Boton, Contenido, Encabezado, Gema, Tarjeta, cx, orden } from "@/ui/componentes";
import { Campo, Segmentado, Selector, Vacio } from "@/ui/formulario";
import { BarrasNiveles, BarrasSimples, LineaPorcentaje } from "@/ui/graficos";

const hoyISO = () => new Date().toISOString().slice(0, 10);
const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "short" });

function Kpi({ icono, tono, valor, etiqueta, alerta, enlace, i }: {
  icono: LucideIcon; tono: string; valor: string | number; etiqueta: string; alerta?: string | null; enlace?: string; i: number;
}) {
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-2">
        <Gema icono={icono} tono={alerta ? "tono-coral" : tono} tam="sm" />
        {alerta && <TriangleAlert className="h-4 w-4 text-red-600" aria-hidden />}
      </div>
      <p className="titulo-display mt-2 text-3xl font-bold tabular-nums">{valor}</p>
      <p className="text-xs text-tinta-suave">{etiqueta}</p>
      {alerta && <p className="mt-1 text-[0.7rem] font-semibold text-red-700">{alerta}</p>}
    </>
  );
  const clase = "vidrio aparecer block p-4 transition";
  return enlace
    ? <Link to={enlace} className={cx(clase, "hover:bg-white/55")} style={orden(i)}>{contenido}</Link>
    : <div className={clase} style={orden(i)}>{contenido}</div>;
}

export function Paneles() {
  const { usuario } = useApp();
  const avisar = useAvisar();
  const esUgel = !!usuario?.roles.includes("ugel");
  const [nivel, setNivel] = useState<"todos" | Nivel>("todos");
  const [seccionId, setSeccionId] = useState("");
  const [periodoId, setPeriodoId] = useState("");
  const [generando, setGenerando] = useState(false);

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
      areas: new Map(areas.map((a) => [a.id, a.nombre])), asignaciones, incidencias, justificaciones,
      usuarios: new Map(usuarios.map((u) => [u.id, u])), colegio: colegios[0],
    };
  });

  // Periodo por defecto: el último que ya tiene notas.
  useEffect(() => {
    if (!base || periodoId) return;
    const conNotas = [...base.periodos].reverse().find((p) => base.calificaciones.some((c) => c.periodo_id === p.id && c.nivel_logro));
    setPeriodoId((conNotas ?? base.periodos[0])?.id ?? "");
  }, [base, periodoId]);

  const seccionesFiltradas = useMemo(() => (base?.secciones ?? []).filter((s) => nivel === "todos" || s.grado?.nivel === nivel), [base, nivel]);
  useEffect(() => setSeccionId(""), [nivel]);

  const panel = useMemo(() => {
    if (!base) return null;
    const visibles = new Set((seccionId ? seccionesFiltradas.filter((s) => s.id === seccionId) : seccionesFiltradas).map((s) => s.id));
    return calcularPanel({
      hoy: hoyISO(), periodoId: periodoId || null, estudiantes: base.estudiantes,
      matriculas: base.matriculas.filter((m) => visibles.has(m.seccion_id)),
      seccionNombre: (id) => base.secciones.find((s) => s.id === id)?.nombre ?? "",
      sesiones: base.sesiones, asistencias: base.asistencias, calificaciones: base.calificaciones, competencias: base.competencias,
      areaNombre: (id) => base.areas.get(id) ?? "Área", asignaciones: base.asignaciones, incidencias: base.incidencias, justificaciones: base.justificaciones,
    });
  }, [base, seccionesFiltradas, seccionId, periodoId]);

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
      <Encabezado etiqueta={esUgel ? "Supervisión UGEL" : "Dirección"} titulo="Indicadores" subtitulo={`${base.colegio?.nombre ?? ""} · Año ${base.anio.anio}`}
        accion={<Boton variante="vidrio" icono={FileDown} onClick={reporte} cargando={generando} className="hidden sm:inline-flex">Reporte PDF</Boton>} />
      <Contenido ancho="max-w-6xl">
        {/* Filtros: una sola fila sobre los gráficos */}
        <Tarjeta className="aparecer flex flex-col gap-3 p-4 lg:flex-row lg:items-end" style={orden(1)}>
          <div>
            <span className="mb-1.5 block text-sm font-semibold">Nivel</span>
            <Segmentado etiqueta="Nivel" valor={nivel} onCambio={setNivel} opciones={[{ valor: "todos", texto: "Todos" }, { valor: "primaria", texto: "Primaria" }, { valor: "secundaria", texto: "Secundaria" }]} />
          </div>
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

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Indicadores principales">
          <Kpi i={2} icono={GraduationCap} tono="tono-musgo" valor={panel.matriculados} etiqueta="estudiantes matriculados" />
          <Kpi i={3} icono={CalendarCheck} tono="tono-laguna" valor={panel.asistencia30 === null ? "-" : `${panel.asistencia30}%`} etiqueta="asistencia (30 días)"
            alerta={panel.asistencia30 !== null && panel.asistencia30 < UMBRAL_ASISTENCIA ? `Bajo la meta de ${UMBRAL_ASISTENCIA}%` : null} />
          <Kpi i={4} icono={ClipboardList} tono="tono-cielo" valor={panel.avanceNotas === null ? "-" : `${panel.avanceNotas}%`} etiqueta={`notas registradas · ${periodo?.nombre ?? ""}`}
            enlace={esUgel ? undefined : "/notas"} />
          <Kpi i={5} icono={TriangleAlert} tono="tono-ambar" valor={panel.enRiesgo.length} etiqueta="estudiantes con alertas" />
          <Kpi i={6} icono={ShieldAlert} tono="tono-ambar" valor={panel.incidenciasAbiertas} etiqueta="incidencias abiertas"
            alerta={panel.sisevePendientes ? `${panel.sisevePendientes} sin reporte SíseVe` : null} enlace={esUgel ? undefined : "/convivencia"} />
          <Kpi i={7} icono={FileCheck} tono="tono-lila" valor={panel.justificacionesPendientes} etiqueta="justificaciones por revisar" enlace={esUgel ? undefined : "/asistencia/justificaciones"} />
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          {panel.distribucion.length ? (
            <BarrasNiveles titulo="Logros por área" subtitulo={`${periodo?.nombre ?? ""} · ${alcance}`}
              filas={panel.distribucion.map((d) => ({ etiqueta: d.area, conteo: d.conteo, total: d.total }))} />
          ) : (
            <Vacio icono={ClipboardList} tono="tono-cielo" titulo="Sin notas en este periodo" />
          )}
          <LineaPorcentaje titulo="Asistencia por semana" subtitulo={`Últimas 8 semanas · ${alcance}`} nombreValor="Asistencia"
            umbral={{ valor: UMBRAL_ASISTENCIA, etiqueta: `Meta ${UMBRAL_ASISTENCIA}%` }}
            puntos={panel.semanas.map((s) => ({ etiqueta: fechaCorta(s.semana), valor: s.porcentaje, detalle: s.registros ? `${s.registros} registros` : "sin registros" }))} />
          {avanceDocentes.length > 0 && (
            <BarrasSimples titulo="Avance del registro de notas por docente" subtitulo={periodo?.nombre} items={avanceDocentes} sufijo="%" maximo={100} />
          )}
          {panel.incidenciasPorTipo.length > 0 && (
            <BarrasSimples titulo="Incidencias por tipo" subtitulo="Año escolar" items={panel.incidenciasPorTipo.map((t) => ({ etiqueta: t.tipo, valor: t.n }))} />
          )}
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
