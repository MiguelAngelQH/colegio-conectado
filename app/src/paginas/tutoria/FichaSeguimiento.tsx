import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarX, History, MessageSquarePlus, MessagesSquare, Phone, ShieldAlert, StickyNote, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { estudiantesDeSeccion, matriculaActual, nombreCompleto, nombreSeccion } from "@/datos/consultas";
import { vivas } from "@/db/repositorio";
import type { EntidadEvidencia, Observacion } from "@/db/tipos";
import { Boton, BotonRegresar, Contenido, Encabezado, Gema, Tarjeta, cx, iniciales, orden } from "@/ui/componentes";
import { Evidencias } from "@/ui/Evidencias";
import { Vacio } from "@/ui/formulario";
import { DialogoObservacion } from "../notas/RegistroNotas";
import { TarjetaInforme } from "./InformeTutor";
import { DialogoEntrevista, indicadoresDe } from "./Tutoria";

const TIPO_OBS: Record<Observacion["tipo"], { texto: string; tono: string }> = {
  academica: { texto: "Académica", tono: "tono-cielo" },
  conducta: { texto: "Conducta", tono: "tono-ambar" },
  felicitacion: { texto: "Felicitación", tono: "tono-musgo" },
  otra: { texto: "Otra", tono: "tono-pizarra" },
};

interface Evento {
  id: string; fecha: string; icono: LucideIcon; tono: string; titulo: string; texto?: string | null;
  evidencia?: { entidad: EntidadEvidencia; editable: boolean }; enlace?: string;
}

const fechaLarga = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long" });

export function FichaSeguimiento() {
  const { id } = useParams();
  const { usuario } = useApp();
  const [observando, setObservando] = useState(false);
  const [entrevistando, setEntrevistando] = useState(false);

  const datos = useLiveQuery(async () => {
    const est = await db.tabla("estudiante").get(id!);
    if (!est) return null;
    const mat = await matriculaActual(est.id);
    const sec = mat ? await db.tabla("seccion").get(mat.seccion_id) : undefined;
    const grado = sec ? await db.tabla("grado").get(sec.grado_id) : undefined;
    const vinculos = vivas(await db.tabla("estudiante_apoderado").where("estudiante_id").equals(est.id).toArray());
    const apoderados = (await db.tabla("apoderado").bulkGet(vinculos.map((v) => v.apoderado_id))).map((a, i) => ({ a, parentesco: vinculos[i].parentesco }));
    const ind = (await indicadoresDe([est])).get(est.id)!;
    const usuarios = new Map((await db.tabla("usuario").toArray()).map((u) => [u.id, u]));

    const eventos: Evento[] = [];
    for (const o of vivas(await db.tabla("observacion").where("estudiante_id").equals(est.id).toArray())) {
      eventos.push({
        id: o.id, fecha: o.fecha, icono: StickyNote, tono: TIPO_OBS[o.tipo].tono, texto: o.texto,
        titulo: `Observación ${TIPO_OBS[o.tipo].texto.toLowerCase()} · ${usuarios.get(o.autor_id)?.apellidos.split(" ")[0] ?? ""}`,
        evidencia: { entidad: "observacion", editable: o.autor_id === usuario?.id },
      });
    }
    for (const x of vivas(await db.tabla("entrevista").where("estudiante_id").equals(est.id).toArray())) {
      eventos.push({
        id: x.id, fecha: x.fecha, icono: MessagesSquare, tono: "tono-coral", titulo: x.asistio ? "Entrevista con la familia" : "Entrevista: la familia no asistió",
        texto: [x.motivo, x.acuerdos && `Acuerdos: ${x.acuerdos}`].filter(Boolean).join(". "), evidencia: { entidad: "entrevista", editable: x.tutor_id === usuario?.id },
      });
    }
    for (const i of vivas(await db.tabla("incidencia").where("estudiante_id").equals(est.id).toArray())) {
      eventos.push({ id: i.id, fecha: i.fecha, icono: ShieldAlert, tono: "tono-coral", titulo: `Incidencia: ${i.tipo}`, texto: i.descripcion, enlace: `/convivencia/${i.id}` });
    }
    const marcas = vivas(await db.tabla("asistencia").where("estudiante_id").equals(est.id).toArray()).filter((a) => a.estado === "F" || a.estado === "T");
    const sesiones = await db.tabla("asistencia_sesion").bulkGet(marcas.map((m) => m.sesion_id));
    marcas.forEach((m, k) => {
      const s = sesiones[k];
      if (s) eventos.push({ id: m.id, fecha: s.fecha, icono: CalendarX, tono: m.estado === "F" ? "tono-coral" : "tono-ambar", titulo: m.estado === "F" ? "Falta" : "Tardanza" });
    });
    eventos.sort((a, b) => b.fecha.localeCompare(a.fecha));

    const companeros = sec ? await estudiantesDeSeccion(sec.id) : [est];
    return { est, seccion: sec ? nombreSeccion(grado, sec) : "Sin matrícula", apoderados, ind, eventos, companeros };
  }, [id, usuario?.id]);

  if (datos === null) return <Contenido><Vacio icono={TriangleAlert} titulo="No se encontró al estudiante" accion={<BotonRegresar a="/tutoria" />} /></Contenido>;
  if (!datos) return null;
  const { est, ind } = datos;

  return (
    <>
      <Encabezado etiqueta={`Seguimiento · ${datos.seccion}`} titulo={`${est.nombres} ${est.apellidos}`} />
      <Contenido ancho="max-w-3xl">
        <Tarjeta className="aparecer p-5" style={orden(1)}>
          <div className="flex items-center gap-4">
            <span className={cx("gema titulo-display h-14 w-14 text-lg font-bold", ind.alertas.length ? "tono-ambar" : "tono-musgo")}><span className="relative z-10">{iniciales(est.nombres, est.apellidos)}</span></span>
            <div className="grid flex-1 grid-cols-4 gap-2 text-center">
              {[
                [ind.asistencia === null ? "-" : `${ind.asistencia}%`, "asistencia"],
                [ind.faltas, "faltas"],
                [ind.tardanzas, "tardanzas"],
                [ind.notasC, "en inicio (C)"],
              ].map(([v, t]) => (
                <div key={t as string}>
                  <p className="titulo-display text-2xl font-bold">{v}</p>
                  <p className="text-[0.65rem] text-tinta-suave">{t}</p>
                </div>
              ))}
            </div>
          </div>
          {ind.alertas.length > 0 && (
            <ul className="mt-4 space-y-1 rounded-2xl bg-amber-50/70 p-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
              {ind.alertas.map((a) => <li key={a} className="flex items-center gap-2"><TriangleAlert className="h-4 w-4" aria-hidden /> {a}</li>)}
            </ul>
          )}
        </Tarjeta>

        {datos.apoderados.length > 0 && (
          <Tarjeta className="aparecer divide-y divide-white/70" style={orden(2)}>
            {datos.apoderados.map(({ a, parentesco }) => a && (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="flex-1"><strong>{nombreCompleto(a)}</strong> <span className="text-tinta-suave">· {parentesco}</span></span>
                {a.telefono && (
                  <a href={`tel:${a.telefono}`} className="vidrio !rounded-full inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold">
                    <Phone className="h-3.5 w-3.5" aria-hidden /> {a.telefono}
                  </a>
                )}
              </div>
            ))}
          </Tarjeta>
        )}

        <div className="flex flex-wrap gap-2">
          <Boton icono={MessageSquarePlus} onClick={() => setObservando(true)}>Observación</Boton>
          <Boton variante="vidrio" icono={MessagesSquare} onClick={() => setEntrevistando(true)}>Entrevista</Boton>
          <Link to={`/convivencia?estudiante=${est.id}`}><Boton variante="vidrio" icono={ShieldAlert}>Incidencia</Boton></Link>
          <Link to={`/estudiantes/${est.id}`}><Boton variante="fantasma" icono={History}>Historial completo</Boton></Link>
        </div>

        <TarjetaInforme estudianteId={est.id} />

        <section className="space-y-2">
          <h2 className="etiqueta px-1">Historial</h2>
          {datos.eventos.length === 0 ? <Vacio icono={StickyNote} titulo="Sin registros todavía" /> : (
            <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[1.35rem] before:top-2 before:w-0.5 before:bg-white/70">
              {datos.eventos.map((e) => (
                <li key={e.id} className="relative flex gap-3">
                  <Gema icono={e.icono} tono={e.tono} tam="sm" />
                  <Tarjeta className="min-w-0 flex-1 space-y-2 p-3">
                    <div>
                      <p className="text-xs text-tinta-suave">{fechaLarga(e.fecha)}</p>
                      {e.enlace ? <Link to={e.enlace} className="font-semibold underline decoration-teal-500/40 underline-offset-2">{e.titulo}</Link> : <p className="font-semibold">{e.titulo}</p>}
                      {e.texto && <p className="mt-0.5 text-sm">{e.texto}</p>}
                    </div>
                    {e.evidencia && <Evidencias entidad={e.evidencia.entidad} entidadId={e.id} estudianteId={est.id} editable={e.evidencia.editable} />}
                  </Tarjeta>
                </li>
              ))}
            </ol>
          )}
        </section>
        <div className="flex justify-center pt-2"><BotonRegresar a="/tutoria" /></div>
      </Contenido>
      {observando && <DialogoObservacion estudiante={est} onCerrar={() => setObservando(false)} />}
      {entrevistando && <DialogoEntrevista estudiantes={datos.companeros} estudianteFijo={est.id} onCerrar={() => setEntrevistando(false)} />}
    </>
  );
}
