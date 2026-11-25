import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUpRight, CalendarDays, GraduationCap, Megaphone, TriangleAlert, Users } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { modulosPara } from "@/app/modulos";
import { vivas } from "@/db/repositorio";
import { asistenciaDelAnio } from "@/datos/consultas";
import { hijosDe } from "@/datos/familia";
import { indicadores, type Indicadores } from "@/dominio/seguimiento";
import type { Periodo } from "@/db/tipos";
import { Contenido, Gema, Tarjeta, orden } from "@/ui/componentes";

const hoyISO = () => new Date().toISOString().slice(0, 10);

function periodoVigente(periodos: Periodo[], hoy = hoyISO()): Periodo | undefined {
  const ordenados = [...periodos].sort((a, b) => a.numero - b.numero);
  return ordenados.find((p) => p.inicio <= hoy && hoy <= p.fin) ?? ordenados.find((p) => p.inicio > hoy) ?? ordenados.at(-1);
}

function saludo() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long" });

export function Inicio() {
  const { usuario } = useApp();

  const datos = useLiveQuery(async () => {
    const anio = (await db.tabla("anio_escolar").toArray()).find((a) => a.activo && !a.eliminado);
    const periodos = anio ? vivas(await db.tabla("periodo").where("anio_id").equals(anio.id).toArray()) : [];
    const comunicados = vivas(await db.tabla("comunicado").orderBy("fecha").reverse().limit(3).toArray());

    let secciones: { id: string; nombre: string; nivel: string; areas: string[]; estudiantes: number; tutor: boolean }[] = [];
    if (usuario && usuario.roles.some((r) => r === "docente" || r === "tutor")) {
      const asig = vivas(await db.tabla("docente_asignacion").where("docente_id").equals(usuario.id).toArray());
      const tutorDe = vivas(await db.tabla("seccion").where("tutor_id").equals(usuario.id).toArray());
      const ids = [...new Set([...asig.map((a) => a.seccion_id), ...tutorDe.map((s) => s.id)])];
      secciones = await Promise.all(ids.map(async (sid) => {
        const s = await db.tabla("seccion").get(sid);
        const g = s ? await db.tabla("grado").get(s.grado_id) : undefined;
        const areas = await Promise.all(asig.filter((a) => a.seccion_id === sid).map((a) => db.tabla("area").get(a.area_id)));
        const estudiantes = await db.tabla("matricula").where("seccion_id").equals(sid).filter((m) => !m.eliminado && m.estado === "matriculado").count();
        return {
          id: sid,
          nombre: g && s ? `${g.nombre} "${s.letra}"` : "Sección",
          nivel: g?.nivel === "primaria" ? "Primaria" : "Secundaria",
          areas: areas.filter(Boolean).map((a) => a!.nombre),
          estudiantes,
          tutor: s?.tutor_id === usuario.id,
        };
      }));
    }
    // Familia: un resumen por hijo (asistencia del año y notas del periodo).
    let familia: { id: string; nombre: string; ind: Indicadores }[] = [];
    if (usuario && usuario.roles.some((r) => r === "estudiante" || r === "apoderado")) {
      const p = periodoVigente(periodos);
      familia = await Promise.all((await hijosDe(usuario)).map(async (h) => {
        const [{ marcas: asistencias }, califs] = await Promise.all([
          asistenciaDelAnio(h.id),
          db.tabla("calificacion").where("estudiante_id").equals(h.id).toArray(),
        ]);
        // Si el periodo vigente aún no tiene notas, se usa el último que sí tenga.
        const conNotas = [...periodos].sort((a, b) => b.numero - a.numero).find((x) => califs.some((c) => c.periodo_id === x.id && c.nivel_logro));
        const pid = califs.some((c) => c.periodo_id === p?.id && c.nivel_logro) ? p?.id : conNotas?.id;
        return { id: h.id, nombre: `${h.nombres} ${h.apellidos.split(" ")[0]}`, ind: indicadores({ asistencias, calificacionesPeriodo: califs.filter((c) => c.periodo_id === pid), incidencias: [] }) };
      }));
    }
    return { anio, periodo: periodoVigente(periodos), comunicados, secciones, familia };
  }, [usuario?.id]);

  if (!usuario) return null;
  const modulos = modulosPara(usuario.roles).filter((m) => m.id !== "inicio" && m.id !== "perfil");
  const p = datos?.periodo;
  const hoy = hoyISO();
  const avance = p ? Math.min(100, Math.max(0, ((Date.parse(hoy) - Date.parse(p.inicio)) / (Date.parse(p.fin) - Date.parse(p.inicio))) * 100)) : 0;
  const aunNoEmpieza = p ? hoy < p.inicio : false;

  return (
    <Contenido>
      {/* Saludo + periodo */}
      <section className="grid grid-cols-[minmax(0,1fr)] gap-3 pt-2 md:grid-cols-[1.4fr_1fr]">
        <div className="aparecer px-1 py-2">
          <p className="etiqueta">{new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="titulo-display mt-1 text-[2.1rem] font-bold leading-[1.05] sm:text-5xl">
            {saludo()},<br />
            <span className="bg-gradient-to-r from-blue-600 via-sky-600 to-sky-600 bg-clip-text text-transparent">{usuario.nombres}</span>
          </h1>
          {datos?.anio && <p className="mt-2 text-sm text-tinta-suave">Año escolar {datos.anio.anio}</p>}
        </div>

        {p && (
          <Tarjeta className="aparecer p-5" style={orden(1)}>
            <div className="flex items-start gap-3">
              <Gema icono={CalendarDays} tono="tono-cielo" tam="sm" />
              <div className="min-w-0 flex-1">
                <p className="etiqueta">{aunNoEmpieza ? "Próximo periodo" : "Periodo actual"}</p>
                <p className="titulo-display text-xl font-bold">{p.nombre}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[0.7rem] font-bold ${p.estado === "abierto" ? "bg-emerald-100/80 text-emerald-800" : "bg-slate-200/80 text-slate-700"}`}>
                {p.estado === "abierto" ? "Abierto" : "Cerrado"}
              </span>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/60 shadow-[inset_0_1px_3px_rgba(11,46,51,.15)]">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-sky-500 shadow-[0_0_12px_rgba(56,189,248,.6)]" style={{ width: `${aunNoEmpieza ? 0 : avance}%` }} />
            </div>
            <p className="mt-2 text-xs text-tinta-suave">
              {aunNoEmpieza ? `Empieza el ${fechaLarga(p.inicio)}` : `Del ${fechaLarga(p.inicio)} al ${fechaLarga(p.fin)}`}
            </p>
          </Tarjeta>
        )}
      </section>

      {datos && datos.familia.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2">
          {datos.familia.map((h, i) => (
            <Tarjeta key={h.id} className="aparecer p-4" style={orden(i + 1)}>
              <div className="flex items-center gap-3">
                <Gema icono={GraduationCap} tono={h.ind.alertas.length ? "tono-ambar" : "tono-musgo"} tam="sm" />
                <p className="font-bold">{h.nombre}</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[[h.ind.asistencia === null ? "-" : `${h.ind.asistencia}%`, "asistencia"], [h.ind.faltas, "faltas"], [h.ind.notasC, "notas en C"]].map(([v, t]) => (
                  <div key={t as string} className="rounded-2xl bg-white/45 py-2 ring-1 ring-white/80">
                    <p className="titulo-display text-xl font-bold">{v}</p>
                    <p className="text-[0.65rem] text-tinta-suave">{t}</p>
                  </div>
                ))}
              </div>
              {h.ind.alertas.length > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800"><TriangleAlert className="h-3.5 w-3.5" aria-hidden /> {h.ind.alertas.join(" · ")}</p>
              )}
            </Tarjeta>
          ))}
        </section>
      )}

      {/* Módulos */}
      <section aria-label="Módulos" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {modulos.map((m, i) => (
          <Link key={m.id} to={m.ruta} style={orden(i + 2)}
            className="vidrio aparecer group flex min-h-[8.5rem] flex-col justify-between p-4 transition hover:-translate-y-0.5 hover:bg-white/55 active:scale-[0.97]">
            <div className="flex items-start justify-between">
              <Gema icono={m.icono} tono={m.tono} />
              <ArrowUpRight className="h-4 w-4 text-tinta-suave opacity-0 transition group-hover:opacity-100" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">{m.titulo}</p>
              <p className="mt-0.5 line-clamp-2 text-[0.72rem] leading-snug text-tinta-suave">{m.descripcion}</p>
            </div>
          </Link>
        ))}
      </section>

      {datos && datos.secciones.length > 0 && (
        <section>
          <h2 className="etiqueta mb-2 px-1">Mis secciones</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {datos.secciones.map((s, i) => (
              <Tarjeta key={s.id} className="aparecer flex items-center gap-4 p-4" style={orden(i + 4)}>
                <div className="gema tono-cielo h-14 w-14 flex-col !rounded-2xl">
                  <span className="titulo-display relative z-10 text-xl font-bold leading-none">{s.nombre.split(".")[0]}</span>
                  <span className="relative z-10 text-[0.6rem] font-bold">{s.nombre.match(/"(.+)"/)?.[1]}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{s.nombre} <span className="font-normal text-tinta-suave">· {s.nivel}</span></p>
                  <p className="truncate text-sm text-tinta-suave">{s.areas.join(", ") || "Sin áreas asignadas"}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                    <Users className="h-3.5 w-3.5" aria-hidden /> {s.estudiantes} estudiantes{s.tutor && " · Tutor(a)"}
                  </p>
                </div>
              </Tarjeta>
            ))}
          </div>
        </section>
      )}

      {datos && datos.comunicados.length > 0 && (
        <section>
          <h2 className="etiqueta mb-2 px-1">Comunicados</h2>
          <div className="space-y-3">
            {datos.comunicados.map((c, i) => (
              <Tarjeta key={c.id} className="aparecer flex gap-3 p-4" style={orden(i + 5)}>
                <Gema icono={Megaphone} tono="tono-ambar" tam="sm" />
                <div className="min-w-0 text-sm">
                  <p className="font-bold">{c.titulo}</p>
                  <p className="mt-0.5 leading-relaxed text-tinta-suave">{c.cuerpo}</p>
                  <p className="mt-1.5 text-xs text-tinta-suave/80">{fechaLarga(c.fecha)}</p>
                </div>
              </Tarjeta>
            ))}
          </div>
        </section>
      )}
    </Contenido>
  );
}
