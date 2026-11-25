// Bandeja del tutor (y de la dirección para los casos de acoso): responder, agendar y atender pedidos de ayuda.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarClock, CheckCheck, Inbox, MessageCircle, ShieldAlert } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { nombreCompleto } from "@/datos/consultas";
import { guardar, vivas } from "@/db/repositorio";
import type { SolicitudTutoria, Usuario } from "@/db/tipos";
import { ABIERTAS, esSensible, MOTIVOS, ordenarBandeja, puedeAtender, puedeVer } from "@/dominio/solicitudes";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Aviso, Boton, BotonRegresar, Contenido, Dialogo, Encabezado, Tarjeta } from "@/ui/componentes";
import { Campo, Entrada, Segmentado, Vacio } from "@/ui/formulario";
import { TarjetaPedido } from "./TarjetaPedido";

/** Pedidos que el usuario debe atender (tutor de la sección o dirección en los sensibles). */
export async function pedidosParaAtender(usuario: Usuario): Promise<SolicitudTutoria[]> {
  return (await db.tabla("solicitud_tutoria").toArray()).filter((s) => puedeVer(s, usuario) && puedeAtender(s, usuario));
}

/** "aaaa-mm-ddThh:mm" en hora local, para el campo de fecha y hora. */
const aLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function DialogoAtender({ s, nombre, quien, onCerrar }: { s: SolicitudTutoria; nombre: string; quien: string; onCerrar(): void }) {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const [respuesta, setRespuesta] = useState(s.respuesta ?? "");
  const [cita, setCita] = useState(s.cita ? aLocal(s.cita) : "");
  const [acuerdos, setAcuerdos] = useState("");
  const [paso, setPaso] = useState<"responder" | "cerrar">("responder");

  // Al abrirlo, quien pidió ve que el tutor ya lo leyó.
  useEffect(() => {
    if (s.estado === "enviada") void guardar(db, "solicitud_tutoria", { id: s.id, estado: "vista" }, colegioId);
  }, [s.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const responder = async (agendar: boolean) => {
    await guardar(db, "solicitud_tutoria", {
      id: s.id, respuesta: respuesta.trim() || null,
      ...(agendar ? { estado: "agendada" as const, cita: new Date(cita).toISOString() } : { estado: s.estado === "agendada" ? ("agendada" as const) : ("vista" as const) }),
    }, colegioId);
    avisar(textoGuardado(agendar ? "Cita agendada" : "Respuesta enviada"));
    onCerrar();
  };

  // Atender: queda registrada la entrevista en la ficha de seguimiento del estudiante.
  const atender = async () => {
    if (!usuario) return;
    const apoderado = s.solicitante_id !== usuario.id
      ? vivas(await db.tabla("apoderado").where("usuario_id").equals(s.solicitante_id).toArray())[0] ?? null : null;
    const entrevistaId = await guardar(db, "entrevista", {
      estudiante_id: s.estudiante_id, apoderado_id: apoderado?.id ?? null, tutor_id: usuario.id,
      fecha: new Date().toISOString().slice(0, 10), motivo: `${MOTIVOS[s.motivo].estudiante} (pedido de ${quien})`,
      acuerdos: acuerdos.trim() || null, asistio: true,
    }, colegioId);
    await guardar(db, "solicitud_tutoria", { id: s.id, estado: "atendida", entrevista_id: entrevistaId, respuesta: respuesta.trim() || s.respuesta }, colegioId);
    avisar(textoGuardado("Pedido atendido y entrevista registrada"));
    onCerrar();
  };

  return (
    <Dialogo abierto titulo={`Pedido de ${nombre}`} onCerrar={onCerrar}
      acciones={paso === "responder" ? <>
        <Boton variante="fantasma" icono={CheckCheck} onClick={() => setPaso("cerrar")}>Ya conversamos</Boton>
        <Boton variante="vidrio" icono={MessageCircle} onClick={() => void responder(false)} disabled={!respuesta.trim()}>Responder</Boton>
        <Boton icono={CalendarClock} onClick={() => void responder(true)} disabled={!cita}>Agendar cita</Boton>
      </> : <>
        <Boton variante="fantasma" onClick={() => setPaso("responder")}>Volver</Boton>
        <Boton icono={CheckCheck} onClick={() => void atender()}>Marcar como atendido</Boton>
      </>}>
      <div className="space-y-3 pt-1 text-tinta">
        <div className="-mx-4 rounded-2xl bg-sup/50 ring-1 ring-sup"><TarjetaPedido s={s} quien={quien === nombre ? undefined : `Lo pidió: ${quien}`} /></div>
        {esSensible(s.motivo) && (
          <Aviso tipo="alerta" icono={ShieldAlert} titulo="Posible caso de acoso">
            Converse hoy con el estudiante. Si se confirma, registre la incidencia en <Link to="/convivencia" className="font-semibold underline">Convivencia</Link> para
            seguir el protocolo y reportarla en el SíseVe.
          </Aviso>
        )}
        {paso === "responder" ? (
          <>
            <Campo etiqueta="Respuesta (la verá quien pidió)">
              <textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={3} className="campo"
                placeholder="Por ejemplo: Gracias por escribirme. Conversemos el lunes en el recreo." />
            </Campo>
            <Campo etiqueta="Cita (opcional)">
              <Entrada type="datetime-local" value={cita} onChange={(e) => setCita(e.target.value)} />
            </Campo>
          </>
        ) : (
          <Campo etiqueta="Acuerdos de la conversación (quedan en la ficha de seguimiento)">
            <textarea value={acuerdos} onChange={(e) => setAcuerdos(e.target.value)} rows={4} className="campo" autoFocus
              placeholder="Por ejemplo: reforzamiento de fracciones los martes; la familia revisará tareas." />
          </Campo>
        )}
      </div>
    </Dialogo>
  );
}

export function Pedidos() {
  const { usuario } = useApp();
  const [vista, setVista] = useState<"abiertos" | "cerrados">("abiertos");
  const [abierto, setAbierto] = useState<string | null>(null);

  const datos = useLiveQuery(async () => {
    if (!usuario) return null;
    const lista = ordenarBandeja(await pedidosParaAtender(usuario));
    const estudiantes = new Map((await db.tabla("estudiante").bulkGet([...new Set(lista.map((s) => s.estudiante_id))])).filter(Boolean).map((e) => [e!.id, e!]));
    const personas = new Map((await db.tabla("usuario").bulkGet([...new Set(lista.map((s) => s.solicitante_id))])).filter(Boolean).map((u) => [u!.id, u!]));
    return { lista, estudiantes, personas };
  }, [usuario?.id]);
  if (!datos) return null;

  const nombreEst = (s: SolicitudTutoria) => {
    const e = datos.estudiantes.get(s.estudiante_id);
    return e ? nombreCompleto(e) : "Estudiante";
  };
  const quien = (s: SolicitudTutoria) => {
    const p = datos.personas.get(s.solicitante_id);
    const est = datos.estudiantes.get(s.estudiante_id);
    if (est?.usuario_id === s.solicitante_id) return nombreEst(s);
    return p ? `${p.nombres} ${p.apellidos} (apoderado)` : "Apoderado";
  };
  const visibles = datos.lista.filter((s) => (vista === "abiertos" ? ABIERTAS.includes(s.estado) : !ABIERTAS.includes(s.estado)));
  const actual = datos.lista.find((s) => s.id === abierto);

  return (
    <>
      <Encabezado etiqueta="Tutoría" titulo="Pedidos de ayuda" subtitulo="Lo que estudiantes y familias piden a su tutor(a). Los casos de acoso también llegan a la dirección." />
      <Contenido ancho="max-w-3xl">
        <Segmentado etiqueta="Pedidos" valor={vista} onCambio={setVista} opciones={[
          { valor: "abiertos", texto: `Por atender (${datos.lista.filter((s) => ABIERTAS.includes(s.estado)).length})` }, { valor: "cerrados", texto: "Cerrados" },
        ]} />
        {visibles.length === 0 ? (
          <Vacio icono={Inbox} tono="tono-rosa" titulo={vista === "abiertos" ? "No hay pedidos por atender" : "Aún no hay pedidos cerrados"}>
            {vista === "abiertos" && "Cuando un estudiante o una familia pida ayuda, aparecerá aquí y en la campana."}
          </Vacio>
        ) : (
          <Tarjeta className="divide-y divide-sup/70 overflow-hidden">
            {visibles.map((s) => (
              <div key={s.id} className={s.estado === "enviada" ? "bg-sky-50/50" : undefined}>
                <TarjetaPedido s={s} quien={quien(s) === nombreEst(s) ? nombreEst(s) : <>{nombreEst(s)} <span className="font-normal text-tinta-suave">· pide {quien(s)}</span></>}
                  acciones={<>
                    <Link to={`/tutoria/estudiante/${s.estudiante_id}`}><Boton variante="fantasma">Ver ficha</Boton></Link>
                    {ABIERTAS.includes(s.estado) && <Boton variante="vidrio" icono={MessageCircle} onClick={() => setAbierto(s.id)}>Atender</Boton>}
                  </>} />
              </div>
            ))}
          </Tarjeta>
        )}
        <div className="flex justify-center pt-2"><BotonRegresar a="/tutoria" /></div>
      </Contenido>
      {actual && <DialogoAtender s={actual} nombre={nombreEst(actual)} quien={quien(actual)} onCerrar={() => setAbierto(null)} />}
    </>
  );
}
