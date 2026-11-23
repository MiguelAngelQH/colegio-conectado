import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarCheck, FileCheck, Send } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { NOMBRE_ESTADO, detallesDeSesiones } from "@/datos/asistencia";
import { asistenciaDelAnio } from "@/datos/consultas";
import { useHijos } from "@/datos/familia";
import { nuevoId } from "@/db/local";
import { guardar, vivas } from "@/db/repositorio";
import type { Asistencia, Justificacion } from "@/db/tipos";
import { indicadores } from "@/dominio/seguimiento";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Boton, Contenido, Dialogo, Encabezado, Tarjeta, cx, orden } from "@/ui/componentes";
import { Evidencias } from "@/ui/Evidencias";
import { Segmentado, Vacio } from "@/ui/formulario";
import { SelectorHijo } from "@/ui/SelectorHijo";

const ESTADO_J: Record<Justificacion["estado"], { texto: string; clase: string }> = {
  pendiente: { texto: "Justificación en revisión", clase: "bg-sky-100/80 text-sky-800" },
  aprobada: { texto: "Justificada", clase: "bg-emerald-100/80 text-emerald-800" },
  rechazada: { texto: "Justificación rechazada", clase: "bg-red-100/80 text-red-800" },
};

interface Registro { a: Asistencia; fecha: string; clase: string | null; docente: string | null; j: Justificacion | undefined }

export function MiAsistencia() {
  const { usuario } = useApp();
  const { hijos, hijo } = useHijos(usuario);
  const [justificando, setJustificando] = useState<Registro | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "faltas">("todas");
  const esApoderado = !!usuario?.roles.includes("apoderado");

  const datos = useLiveQuery(async () => {
    if (!hijo) return null;
    // Solo el año en curso: los años anteriores quedan en el historial del estudiante.
    const { marcas, sesiones } = await asistenciaDelAnio(hijo.id);
    const detalles = await detallesDeSesiones(marcas.map((m) => m.sesion_id));
    const justifs = vivas(await db.tabla("justificacion").where("estudiante_id").equals(hijo.id).toArray());
    const registros: Registro[] = marcas
      .map((a) => {
        const s = sesiones.get(a.sesion_id);
        // Si hay varias solicitudes para la misma marca, cuenta la más reciente.
        const j = justifs.filter((x) => x.asistencia_id === a.id).sort((x, y) => (y.updated_at ?? "").localeCompare(x.updated_at ?? ""))[0];
        const d = detalles.get(a.sesion_id);
        return { a, fecha: s?.fecha ?? (a.marcado_en ?? "").slice(0, 10), clase: d?.clase ?? null, docente: d?.docente ?? null, j };
      })
      .sort((x, y) => y.fecha.localeCompare(x.fecha) || (y.a.marcado_en ?? "").localeCompare(x.a.marcado_en ?? ""));
    return { ind: indicadores({ asistencias: marcas, calificacionesPeriodo: [], incidencias: [] }), registros };
  }, [hijo?.id]);

  if (hijos && hijos.length === 0) {
    return (
      <>
        <Encabezado etiqueta="Familia" titulo="Asistencia" />
        <Contenido ancho="max-w-md"><Vacio icono={CalendarCheck} titulo="No hay estudiantes vinculados a su cuenta" /></Contenido>
      </>
    );
  }
  if (!datos || !hijo) return null;
  const { ind } = datos;

  return (
    <>
      <Encabezado etiqueta={esApoderado ? `Asistencia de ${hijo.nombres.split(" ")[0]}` : "Mi asistencia"} titulo="Asistencia" />
      <Contenido ancho="max-w-3xl">
        <SelectorHijo hijos={hijos ?? []} hijo={hijo} />
        <Tarjeta className="aparecer grid grid-cols-4 gap-2 p-4 text-center" style={orden(1)}>
          {[
            [ind.asistencia === null ? "-" : `${ind.asistencia}%`, "asistencia"],
            [ind.faltas, "faltas"],
            [ind.tardanzas, "tardanzas"],
            [ind.justificadas, "justificadas"],
          ].map(([v, t]) => (
            <div key={t as string} className="rounded-2xl bg-white/45 py-2 ring-1 ring-white/80">
              <p className={cx("titulo-display text-2xl font-bold", t === "faltas" && ind.faltas >= 3 && "text-red-700")}>{v}</p>
              <p className="text-[0.65rem] font-semibold text-tinta-suave">{t}</p>
            </div>
          ))}
        </Tarjeta>
        <p className="px-1 text-xs text-tinta-suave">Sobre {ind.sesiones} {ind.sesiones === 1 ? "registro" : "registros"} de asistencia de este año.</p>

        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="etiqueta">Registro de asistencia</h2>
          <Segmentado etiqueta="Mostrar" valor={filtro} onCambio={setFiltro}
            opciones={[{ valor: "todas", texto: `Todas (${datos.registros.length})` }, { valor: "faltas", texto: "Faltas y tardanzas" }]} />
        </div>
        {(() => {
          const lista = filtro === "todas" ? datos.registros : datos.registros.filter((r) => r.a.estado !== "P");
          if (lista.length === 0) {
            return filtro === "faltas"
              ? <Vacio icono={CalendarCheck} tono="tono-musgo" titulo="Sin faltas ni tardanzas">¡Muy bien!</Vacio>
              : <Vacio icono={CalendarCheck} titulo="Todavía no hay asistencias registradas este año" />;
          }
          return (
          <Tarjeta className="aparecer divide-y divide-white/70" style={orden(2)}>
            {lista.map((r) => {
              const puedeJustificar = esApoderado && (r.a.estado === "F" || r.a.estado === "T") && (!r.j || r.j.estado === "rechazada");
              return (
                <div key={r.a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className={cx("titulo-display flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white",
                    r.a.estado === "F" ? "bg-gradient-to-b from-red-400 to-red-600" : r.a.estado === "T" ? "bg-gradient-to-b from-amber-300 to-amber-500 !text-amber-950"
                      : r.a.estado === "P" ? "bg-gradient-to-b from-emerald-400 to-emerald-600" : "bg-gradient-to-b from-sky-400 to-sky-600")}>
                    {r.a.estado}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold">{NOMBRE_ESTADO[r.a.estado]} · {new Date(`${r.fecha}T12:00:00`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}</p>
                    <p className="text-xs text-tinta-suave">
                      {r.clase ?? "Asistencia del día"}{r.docente ? ` · Prof. ${r.docente}` : ""}
                      {r.a.marcado_en && r.a.estado !== "F" ? ` · ${new Date(r.a.marcado_en).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}` : ""}
                      {r.a.origen === "qr" ? " · con QR" : r.a.origen === "carne" ? " · con carné" : ""}
                    </p>
                    {r.j && (
                      <p className="mt-1">
                        <span className={cx("rounded-full px-2 py-0.5 text-[0.65rem] font-bold", ESTADO_J[r.j.estado].clase)}>{ESTADO_J[r.j.estado].texto}</span>
                        {r.j.respuesta && <span className="ml-2 text-xs text-tinta-suave">{r.j.respuesta}</span>}
                      </p>
                    )}
                  </div>
                  {puedeJustificar && <Boton variante="vidrio" icono={FileCheck} className="!min-h-10 !px-4 text-xs" onClick={() => setJustificando(r)}>Justificar</Boton>}
                </div>
              );
            })}
          </Tarjeta>
          );
        })()}
      </Contenido>
      {justificando && <DialogoJustificar registro={justificando} onCerrar={() => setJustificando(null)} />}
    </>
  );
}

function DialogoJustificar({ registro, onCerrar }: { registro: Registro; onCerrar(): void }) {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const [motivo, setMotivo] = useState("");
  const [creada, setCreada] = useState<string | null>(null);

  const enviar = async () => {
    const id = nuevoId();
    await guardar(db, "justificacion", {
      id, asistencia_id: registro.a.id, estudiante_id: registro.a.estudiante_id, solicitante_id: usuario!.id,
      motivo: motivo.trim(), estado: "pendiente", revisado_por: null, respuesta: null,
    }, colegioId);
    avisar(textoGuardado("Justificación enviada"));
    setCreada(id);
  };

  return (
    <Dialogo abierto titulo={creada ? "Justificación enviada" : "Justificar la inasistencia"} onCerrar={onCerrar}
      acciones={creada ? <Boton onClick={onCerrar}>Listo</Boton> : <>
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        <Boton icono={Send} onClick={enviar} disabled={motivo.trim().length < 5}>Enviar</Boton>
      </>}>
      {creada ? (
        <div className="space-y-3 text-tinta">
          <p className="text-sm text-tinta-suave">El tutor la revisará. Si tiene un sustento (certificado médico, constancia), puede adjuntarlo:</p>
          <Evidencias entidad="justificacion" entidadId={creada} estudianteId={registro.a.estudiante_id} />
        </div>
      ) : (
        <div className="space-y-3 pt-2 text-tinta">
          <p className="text-sm text-tinta-suave">{NOMBRE_ESTADO[registro.a.estado]} del {new Date(`${registro.fecha}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long" })}{registro.clase ? ` en ${registro.clase}` : ""}.</p>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={4} className="campo" placeholder="Motivo: por ejemplo, cita médica o enfermedad" aria-label="Motivo de la justificación" autoFocus />
          <p className="text-xs">Se enviará aunque no tenga señal: llegará al colegio en la próxima sincronización.</p>
        </div>
      )}
    </Dialogo>
  );
}
