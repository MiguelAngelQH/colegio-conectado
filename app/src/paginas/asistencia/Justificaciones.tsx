import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, FileCheck, X } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { NOMBRE_ESTADO } from "@/datos/asistencia";
import { nombreCompleto } from "@/datos/consultas";
import { guardarLote, vivas } from "@/db/repositorio";
import type { Justificacion } from "@/db/tipos";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Boton, BotonRegresar, Contenido, Dialogo, Encabezado, Gema, Tarjeta, cx, orden } from "@/ui/componentes";
import { Evidencias } from "@/ui/Evidencias";
import { Segmentado, Vacio } from "@/ui/formulario";

/** Revisión de las justificaciones enviadas por las familias (tutor, auxiliar o dirección). */
export function Justificaciones() {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [filtro, setFiltro] = useState<"pendiente" | "revisadas">("pendiente");
  const [rechazando, setRechazando] = useState<Justificacion | null>(null);
  const [respuesta, setRespuesta] = useState("");

  const datos = useLiveQuery(async () => {
    const lista = vivas(await db.tabla("justificacion").toArray()).sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
    const marcas = new Map((await db.tabla("asistencia").bulkGet(lista.map((j) => j.asistencia_id))).filter(Boolean).map((a) => [a!.id, a!]));
    const sesiones = new Map((await db.tabla("asistencia_sesion").bulkGet([...new Set([...marcas.values()].map((m) => m.sesion_id))])).filter(Boolean).map((s) => [s!.id, s!]));
    const ests = new Map((await db.tabla("estudiante").bulkGet([...new Set(lista.map((j) => j.estudiante_id))])).filter(Boolean).map((e) => [e!.id, e!]));
    const usuarios = new Map((await db.tabla("usuario").toArray()).map((u) => [u.id, u]));
    const apoderados = await db.tabla("apoderado").toArray();
    return { lista, marcas, sesiones, ests, usuarios, apoderados };
  });
  if (!datos) return null;
  const lista = datos.lista.filter((j) => (filtro === "pendiente" ? j.estado === "pendiente" : j.estado !== "pendiente"));

  const resolver = async (j: Justificacion, estado: "aprobada" | "rechazada", texto: string | null) => {
    const marca = datos.marcas.get(j.asistencia_id);
    await guardarLote(db, [
      { tabla: "justificacion", datos: { id: j.id, estado, respuesta: texto } },
      // Aprobada: la falta o tardanza pasa a "justificada".
      ...(estado === "aprobada" && marca ? [{ tabla: "asistencia" as const, datos: { id: marca.id, estado: "J" as const, por_revisar: false } }] : []),
    ], colegioId);
    avisar(textoGuardado(estado === "aprobada" ? "Justificación aprobada" : "Justificación rechazada"));
    setRechazando(null);
    setRespuesta("");
  };

  const solicitante = (id: string) => {
    const u = datos.usuarios.get(id);
    const a = datos.apoderados.find((x) => x.usuario_id === id);
    return u ? `${u.nombres} ${u.apellidos}` : a ? `${a.nombres} ${a.apellidos}` : "Apoderado";
  };

  return (
    <>
      <Encabezado etiqueta="Asistencia" titulo="Justificaciones" subtitulo="Solicitudes de las familias para justificar faltas y tardanzas." />
      <Contenido ancho="max-w-3xl">
        <Segmentado etiqueta="Filtro" valor={filtro} onCambio={setFiltro} opciones={[{ valor: "pendiente", texto: "Por revisar" }, { valor: "revisadas", texto: "Revisadas" }]} />
        {lista.length === 0 ? (
          <Vacio icono={FileCheck} tono="tono-musgo" titulo={filtro === "pendiente" ? "No hay justificaciones por revisar" : "Aún no hay justificaciones revisadas"} />
        ) : lista.map((j, i) => {
          const e = datos.ests.get(j.estudiante_id);
          const m = datos.marcas.get(j.asistencia_id);
          const s = m ? datos.sesiones.get(m.sesion_id) : undefined;
          return (
            <Tarjeta key={j.id} className="aparecer space-y-3 p-4" style={orden(Math.min(i + 1, 6))}>
              <div className="flex items-start gap-3">
                <Gema icono={FileCheck} tono={j.estado === "pendiente" ? "tono-cielo" : j.estado === "aprobada" ? "tono-musgo" : "tono-coral"} tam="sm" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-bold">{e ? nombreCompleto(e) : "Estudiante"}</p>
                  <p className="text-xs text-tinta-suave">
                    {m ? NOMBRE_ESTADO[m.estado] : "Marca"} del {s ? new Date(`${s.fecha}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long" }) : "-"} · Envió: {solicitante(j.solicitante_id)}
                  </p>
                  <p className="mt-1.5">{j.motivo}</p>
                  {j.estado !== "pendiente" && (
                    <p className={cx("mt-1.5 text-xs font-semibold", j.estado === "aprobada" ? "text-emerald-700" : "text-red-700")}>
                      {j.estado === "aprobada" ? "Aprobada" : "Rechazada"}{j.revisado_por && ` por ${datos.usuarios.get(j.revisado_por)?.nombres ?? ""}`}{j.respuesta && `: ${j.respuesta}`}
                    </p>
                  )}
                </div>
              </div>
              <Evidencias entidad="justificacion" entidadId={j.id} estudianteId={j.estudiante_id} editable={false} />
              {j.estado === "pendiente" && (
                <div className="flex flex-wrap justify-end gap-2">
                  <Boton variante="fantasma" icono={X} className="text-red-700" onClick={() => setRechazando(j)}>Rechazar</Boton>
                  <Boton icono={Check} onClick={() => void resolver(j, "aprobada", null)}>Aprobar</Boton>
                </div>
              )}
            </Tarjeta>
          );
        })}
        <div className="flex justify-center pt-2"><BotonRegresar a="/asistencia" /></div>
      </Contenido>
      <Dialogo tam="chico" abierto={!!rechazando} titulo="Rechazar justificación" onCerrar={() => setRechazando(null)}
        acciones={<><Boton variante="fantasma" onClick={() => setRechazando(null)}>Cancelar</Boton><Boton variante="peligro" onClick={() => void resolver(rechazando!, "rechazada", respuesta.trim())} disabled={respuesta.trim().length < 5}>Rechazar</Boton></>}>
        <p className="mb-2">Explique el motivo a la familia (lo verán en la app).</p>
        <textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={3} className="campo" aria-label="Motivo del rechazo" autoFocus />
      </Dialogo>
    </>
  );
}
