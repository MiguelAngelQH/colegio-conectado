// Historial del estudiante: lo que necesita saber un docente que lo recibe. Reúne todos sus años
// (situación final, asistencia y logros), el informe de su tutor anterior, la evolución de sus
// competencias y la línea de tiempo de observaciones, entrevistas e incidencias.
// Lo ven quienes tienen al estudiante ESTE año (y la dirección); el servidor aplica la misma regla.
// Los pedidos de ayuda al tutor no aparecen: son privados entre el estudiante y su tutor.
import { Fragment } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useParams } from "react-router-dom";
import { CalendarCheck, FilePen, GraduationCap, Lock, MessagesSquare, ShieldAlert, StickyNote, TriangleAlert, type LucideIcon } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { anioActivo, matriculaActual, nombreCompleto, nombreSeccion } from "@/datos/consultas";
import { vivas } from "@/db/repositorio";
import type { AnioEscolar, Area, Calificacion, Competencia, InformeTutor, Matricula, NivelLogro, Periodo, ResumenAsistencia, Usuario } from "@/db/tipos";
import { nivelFinal, NOMBRE_SITUACION } from "@/dominio/promocion";
import { NIVEL_HEX, NIVEL_TEXTO } from "@/ui/colores-niveles";
import { BotonRegresar, Contenido, Encabezado, Gema, Tarjeta, cx, iniciales, orden } from "@/ui/componentes";
import { Vacio } from "@/ui/formulario";
import { CAMPOS_INFORME } from "./tutoria/InformeTutor";
import { indicadoresDe } from "./tutoria/Tutoria";

const ROLES_TODO = ["director", "subdirector", "auxiliar", "ugel"];

/** ¿Puede este usuario ver el historial? Dirección y auxiliares sí; docentes y tutores, solo de sus estudiantes de este año. */
export async function puedoVerHistorial(u: Usuario, estudianteId: string): Promise<boolean> {
  if (u.roles.some((r) => ROLES_TODO.includes(r))) return true;
  const mat = await matriculaActual(estudianteId);
  if (!mat) return false;
  const sec = await db.tabla("seccion").get(mat.seccion_id);
  if (sec?.tutor_id === u.id) return true;
  return vivas(await db.tabla("docente_asignacion").where("docente_id").equals(u.id).toArray()).some((a) => a.seccion_id === mat.seccion_id);
}

function Chip({ n }: { n: NivelLogro | null }) {
  if (!n) return <span className="inline-block h-6 w-8 rounded-[6px] bg-slate-100" aria-label="Sin nota" />;
  return <span className="inline-flex h-6 w-8 items-center justify-center rounded-[6px] text-[0.7rem] font-bold" style={{ background: NIVEL_HEX[n], color: NIVEL_TEXTO[n] }}>{n}</span>;
}

interface Anio {
  anio: AnioEscolar;
  matricula: Matricula;
  seccion: string;
  tutor: string | null;
  periodos: Periodo[];
  asistencia: ResumenAsistencia | null;
  /** Por área: nivel final de cada competencia. */
  logros: { area: Area; finales: (NivelLogro | null)[] }[];
}

interface Evento { id: string; fecha: string; icono: LucideIcon; tono: string; titulo: string; texto?: string | null }

const fechaLarga = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });

export function HistorialEstudiante() {
  const { id } = useParams();
  const { usuario } = useApp();

  const datos = useLiveQuery(async () => {
    if (!usuario || !id) return null;
    if (!(await puedoVerHistorial(usuario, id))) return { sinPermiso: true as const };
    const est = await db.tabla("estudiante").get(id);
    if (!est) return null;
    const actual = await anioActivo();
    const [anios, mats, secciones, grados, usuarios, periodos, areas, competencias, califs, informes] = await Promise.all([
      db.tabla("anio_escolar").toArray(), db.tabla("matricula").where("estudiante_id").equals(id).toArray(), db.tabla("seccion").toArray(),
      db.tabla("grado").toArray(), db.tabla("usuario").toArray(), db.tabla("periodo").toArray(), db.tabla("area").toArray(),
      db.tabla("competencia").toArray(), db.tabla("calificacion").where("estudiante_id").equals(id).toArray(), db.tabla("informe_tutor").where("estudiante_id").equals(id).toArray(),
    ]);
    const persona = new Map(usuarios.map((u) => [u.id, u]));
    const notas = vivas(califs);

    const porAnio: Anio[] = [];
    for (const m of vivas(mats)) {
      const a = anios.find((x) => x.id === m.anio_id);
      const s = secciones.find((x) => x.id === m.seccion_id);
      if (!a || !s) continue;
      const g = grados.find((x) => x.id === s.grado_id);
      const pers = vivas(periodos).filter((p) => p.anio_id === a.id).sort((x, y) => x.numero - y.numero);
      const ids = new Set(pers.map((p) => p.id));
      const delAnio = notas.filter((c) => ids.has(c.periodo_id));
      const logros = vivas(areas)
        .filter((ar) => ar.nivel === g?.nivel && ar.codigo !== "TRV").sort((x, y) => x.orden - y.orden)
        .map((ar) => ({ area: ar, finales: vivas(competencias).filter((k) => k.area_id === ar.id).sort((x, y) => x.orden - y.orden).map((k) => nivelFinal(delAnio.filter((c) => c.competencia_id === k.id), pers)) }))
        .filter((x) => x.finales.some(Boolean));
      let asistencia = m.asistencia_resumen ?? null;
      if (!asistencia && a.id === actual?.id) {
        // Año en curso: se calcula con las marcas que ya hay.
        const sesiones = new Set(vivas(await db.tabla("asistencia_sesion").where("seccion_id").equals(s.id).toArray()).map((x) => x.id));
        const marcas = vivas(await db.tabla("asistencia").where("estudiante_id").equals(id).toArray()).filter((x) => sesiones.has(x.sesion_id));
        const c = { P: 0, T: 0, F: 0, J: 0 };
        for (const x of marcas) c[x.estado]++;
        const base = c.P + c.T + c.F;
        asistencia = { ...c, porcentaje: base ? Math.round(((c.P + c.T) / base) * 100) : null };
      }
      const tutor = s.tutor_id ? persona.get(s.tutor_id) : undefined;
      porAnio.push({ anio: a, matricula: m, seccion: nombreSeccion(g, s), tutor: tutor ? nombreCompleto(tutor) : null, periodos: pers, asistencia, logros });
    }
    porAnio.sort((x, y) => y.anio.anio - x.anio.anio);

    // Evolución: cada competencia evaluada, con su nivel en cada periodo de cada año (del más antiguo al actual).
    const columnas = [...porAnio].reverse().flatMap((x) => x.periodos.map((p) => ({ anio: x.anio.anio, periodo: p })));
    const compsConNota = vivas(competencias).filter((k) => notas.some((c) => c.competencia_id === k.id && c.nivel_logro));
    const evolucion = vivas(areas).filter((ar) => compsConNota.some((k) => k.area_id === ar.id)).sort((x, y) => x.orden - y.orden || x.nivel.localeCompare(y.nivel))
      .map((ar) => ({
        area: ar,
        filas: compsConNota.filter((k) => k.area_id === ar.id).sort((x, y) => x.orden - y.orden).map((k: Competencia) => ({
          competencia: k,
          niveles: columnas.map((col) => notas.find((c: Calificacion) => c.competencia_id === k.id && c.periodo_id === col.periodo.id)?.nivel_logro ?? null),
        })),
      }));

    // Informes del tutor, del más reciente al más antiguo.
    const informesOrden = vivas(informes)
      .map((i) => ({ i, anio: anios.find((a) => a.id === i.anio_id)?.anio ?? 0 }))
      .filter((x) => CAMPOS_INFORME.some((c) => x.i[c.clave]?.trim()))
      .sort((x, y) => y.anio - x.anio);

    const eventos: Evento[] = [];
    for (const o of vivas(await db.tabla("observacion").where("estudiante_id").equals(id).toArray())) {
      eventos.push({ id: o.id, fecha: o.fecha, icono: StickyNote, tono: o.tipo === "felicitacion" ? "tono-musgo" : o.tipo === "conducta" ? "tono-ambar" : "tono-cielo",
        titulo: o.tipo === "felicitacion" ? "Felicitación" : o.tipo === "conducta" ? "Observación de conducta" : "Observación", texto: o.texto });
    }
    for (const x of vivas(await db.tabla("entrevista").where("estudiante_id").equals(id).toArray())) {
      eventos.push({ id: x.id, fecha: x.fecha, icono: MessagesSquare, tono: "tono-coral", titulo: "Entrevista", texto: [x.motivo, x.acuerdos && `Acuerdos: ${x.acuerdos}`].filter(Boolean).join(". ") });
    }
    for (const i of vivas(await db.tabla("incidencia").where("estudiante_id").equals(id).toArray())) {
      eventos.push({ id: i.id, fecha: i.fecha, icono: ShieldAlert, tono: "tono-coral", titulo: `Incidencia: ${i.tipo}`, texto: `${i.descripcion}${i.estado === "cerrada" ? " (cerrada)" : ""}` });
    }
    eventos.sort((a, b) => b.fecha.localeCompare(a.fecha));

    const ind = actual ? (await indicadoresDe([est])).get(est.id) : undefined;
    return { est, porAnio, columnas, evolucion, informes: informesOrden, eventos, alertas: ind?.alertas ?? [], persona, actual };
  }, [id, usuario?.id]);

  if (datos === null) return <Contenido><Vacio icono={TriangleAlert} titulo="No se encontró al estudiante" accion={<BotonRegresar />} /></Contenido>;
  if (!datos) return null;
  if ("sinPermiso" in datos) {
    return <Contenido><Vacio icono={Lock} titulo="Este estudiante no está en sus secciones este año">Solo pueden ver su historial quienes lo tienen a cargo este año y la dirección.</Vacio></Contenido>;
  }
  const { est } = datos;
  const ultimo = datos.informes[0];
  const enCurso = datos.porAnio.find((x) => x.anio.id === datos.actual?.id);

  return (
    <>
      <Encabezado etiqueta="Historial del estudiante" titulo={`${est.nombres} ${est.apellidos}`}
        subtitulo={[enCurso?.seccion, est.dni && `DNI ${est.dni}`, datos.porAnio.length > 1 && `${datos.porAnio.length} años en el colegio`].filter(Boolean).join(" · ")} />
      <Contenido ancho="max-w-4xl">
        {/* Lo primero que necesita un docente nuevo */}
        <Tarjeta className="aparecer space-y-3 p-5" style={orden(1)}>
          <div className="flex items-center gap-3">
            <span className="gema tono-lila titulo-display h-12 w-12 text-base font-bold"><span className="relative z-10">{iniciales(est.nombres, est.apellidos)}</span></span>
            <div>
              <h2 className="font-bold">Lo que conviene saber</h2>
              <p className="text-xs text-tinta-suave">{ultimo ? `Informe de ${datos.persona.get(ultimo.i.tutor_id) ? nombreCompleto(datos.persona.get(ultimo.i.tutor_id)!) : "su tutor(a)"}, ${ultimo.anio}` : "Aún no hay informes de tutoría."}</p>
            </div>
          </div>
          {datos.alertas.length > 0 && (
            <ul className="space-y-1 rounded-2xl bg-amber-50/70 p-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
              {datos.alertas.map((a) => <li key={a} className="flex items-center gap-2"><TriangleAlert className="h-4 w-4" aria-hidden /> {a}</li>)}
            </ul>
          )}
          {ultimo && (
            <dl className="grid gap-3 sm:grid-cols-2">
              {CAMPOS_INFORME.filter((c) => ultimo.i[c.clave]?.trim()).map((c) => (
                <div key={c.clave} className={cx("rounded-2xl bg-white/55 p-3 ring-1 ring-white", c.clave === "recomendaciones" && "sm:col-span-2")}>
                  <dt className="etiqueta">{c.titulo}</dt>
                  <dd className="mt-0.5 whitespace-pre-line text-sm text-tinta">{(ultimo.i as InformeTutor)[c.clave]}</dd>
                </div>
              ))}
            </dl>
          )}
        </Tarjeta>

        {/* Trayectoria por año */}
        <section className="space-y-2">
          <h2 className="etiqueta px-1">Trayectoria</h2>
          {datos.porAnio.map((x, i) => (
            <Tarjeta key={x.anio.id} className="aparecer space-y-3 p-4" style={orden(i + 2)}>
              <div className="flex flex-wrap items-center gap-2">
                <Gema icono={GraduationCap} tono="tono-cielo" tam="sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{x.anio.anio} · {x.seccion}</p>
                  <p className="text-xs text-tinta-suave">Tutor(a): {x.tutor ?? "-"}</p>
                </div>
                {x.matricula.situacion_final ? (
                  <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-bold ring-1 ring-white">{NOMBRE_SITUACION[x.matricula.situacion_final]}
                    {x.matricula.resultado_recuperacion && ` · recuperación: ${x.matricula.resultado_recuperacion === "PRO" ? "aprobó" : "no aprobó"}`}</span>
                ) : x.anio.id === datos.actual?.id ? <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-900 ring-1 ring-sky-200">En curso</span> : null}
                {x.asistencia && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-white">
                    <CalendarCheck className="h-3.5 w-3.5" aria-hidden /> {x.asistencia.porcentaje ?? "-"}% · {x.asistencia.F} faltas
                  </span>
                )}
              </div>
              {x.matricula.situacion_motivo && <p className="text-xs text-tinta-suave">Situación corregida por la dirección: {x.matricula.situacion_motivo}</p>}
              {x.logros.length === 0 ? <p className="text-sm text-tinta-suave">Sin calificaciones registradas.</p> : (
                <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {x.logros.map((l) => (
                    <li key={l.area.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{l.area.nombre}</span>
                      <span className="flex shrink-0 gap-1">{l.finales.map((n, k) => <Chip key={k} n={n} />)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          ))}
        </section>

        {/* Evolución por periodo */}
        {datos.evolucion.length > 0 && (
          <section className="space-y-2">
            <h2 className="etiqueta px-1">Evolución por competencia</h2>
            <Tarjeta className="overflow-x-auto p-3">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="text-xs text-tinta-suave">
                    <th className="px-2 py-1 text-left font-semibold">Competencia</th>
                    {datos.columnas.map((c) => <th key={c.periodo.id} className="px-1 py-1 text-center font-semibold">{c.anio}<br />{c.periodo.nombre.split(" ")[0]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {datos.evolucion.map((a) => (
                    <Fragment key={a.area.id}>
                      <tr><td colSpan={datos.columnas.length + 1} className="px-2 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-tinta-suave">{a.area.nombre}</td></tr>
                      {a.filas.map((f) => (
                        <tr key={f.competencia.id} className="border-t border-white/70">
                          <td className="max-w-[18rem] truncate px-2 py-1" title={f.competencia.nombre}>{f.competencia.nombre}</td>
                          {f.niveles.map((n, k) => <td key={k} className="px-1 py-1 text-center"><Chip n={n} /></td>)}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </Tarjeta>
          </section>
        )}

        {/* Informes anteriores */}
        {datos.informes.length > 1 && (
          <section className="space-y-2">
            <h2 className="etiqueta px-1">Informes de años anteriores</h2>
            {datos.informes.slice(1).map(({ i, anio }) => (
              <Tarjeta key={i.id} className="space-y-1 p-4 text-sm">
                <p className="flex items-center gap-2 font-bold"><FilePen className="h-4 w-4" aria-hidden /> {anio}</p>
                {CAMPOS_INFORME.filter((c) => i[c.clave]?.trim()).map((c) => <p key={c.clave}><strong>{c.titulo}:</strong> {i[c.clave]}</p>)}
              </Tarjeta>
            ))}
          </section>
        )}

        {/* Línea de tiempo de todos los años */}
        <section className="space-y-2">
          <h2 className="etiqueta px-1">Observaciones, entrevistas e incidencias</h2>
          {datos.eventos.length === 0 ? <Vacio icono={StickyNote} titulo="Sin registros" /> : (
            <Tarjeta className="divide-y divide-white/70">
              {datos.eventos.map((e) => (
                <div key={e.id} className="flex gap-3 px-4 py-3">
                  <Gema icono={e.icono} tono={e.tono} tam="sm" />
                  <div className="min-w-0 text-sm">
                    <p className="text-xs text-tinta-suave">{fechaLarga(e.fecha)}</p>
                    <p className="font-semibold">{e.titulo}</p>
                    {e.texto && <p className="text-tinta">{e.texto}</p>}
                  </div>
                </div>
              ))}
            </Tarjeta>
          )}
        </section>

        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {usuario?.roles.some((r) => ["tutor", "director", "subdirector"].includes(r)) && (
            <Link to={`/tutoria/estudiante/${est.id}`} className="vidrio !rounded-full px-4 py-2 text-sm font-semibold">Ficha de seguimiento</Link>
          )}
          <BotonRegresar />
        </div>
      </Contenido>
    </>
  );
}
