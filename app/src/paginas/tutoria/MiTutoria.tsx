import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { HandHeart, LifeBuoy, Send, ShieldAlert, StickyNote, X } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { matriculaActual } from "@/datos/consultas";
import { useHijos } from "@/datos/familia";
import { guardar, vivas } from "@/db/repositorio";
import type { Observacion, SolicitudTutoria } from "@/db/tipos";
import { ABIERTAS, esSensible, LIMITE_ABIERTAS, MOTIVOS, type MotivoSolicitud } from "@/dominio/solicitudes";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Aviso, Boton, Contenido, Dialogo, Encabezado, Gema, Tarjeta, cx, orden } from "@/ui/componentes";
import { Campo, Segmentado, Vacio } from "@/ui/formulario";
import { SelectorHijo } from "@/ui/SelectorHijo";
import { TarjetaPedido } from "./TarjetaPedido";

const TIPO: Record<Observacion["tipo"], { texto: string; tono: string }> = {
  academica: { texto: "Académica", tono: "tono-cielo" },
  conducta: { texto: "Conducta", tono: "tono-ambar" },
  felicitacion: { texto: "Felicitación", tono: "tono-musgo" },
  otra: { texto: "Observación", tono: "tono-pizarra" },
};

const MAX_MENSAJE = 1000;

function DialogoPedirAyuda({ estudianteId, para, tutor, onCerrar }: {
  estudianteId: string; para: "estudiante" | "apoderado"; tutor: string; onCerrar(): void;
}) {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const [motivo, setMotivo] = useState<MotivoSolicitud | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [modalidad, setModalidad] = useState<SolicitudTutoria["modalidad"]>("presencial");
  const listo = !!motivo && mensaje.trim().length > 0 && mensaje.length <= MAX_MENSAJE;

  const enviar = async () => {
    if (!motivo || !usuario) return;
    await guardar(db, "solicitud_tutoria", {
      estudiante_id: estudianteId, solicitante_id: usuario.id, tutor_id: null, motivo, mensaje: mensaje.trim(), modalidad,
      estado: "enviada", cita: null, respuesta: null, entrevista_id: null, creada_en: new Date().toISOString(),
    }, colegioId);
    avisar(textoGuardado("Pedido enviado a tu tutor(a)"));
    onCerrar();
  };

  return (
    <Dialogo abierto titulo={para === "estudiante" ? "Pedir ayuda a tu tutor(a)" : "Pedir una entrevista con el tutor(a)"} onCerrar={onCerrar}
      acciones={<>
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        <Boton icono={Send} onClick={enviar} disabled={!listo}>Enviar</Boton>
      </>}>
      <div className="space-y-4 pt-2 text-tinta">
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{para === "estudiante" ? "¿Sobre qué quieres conversar?" : "Motivo"}</legend>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
            {(Object.keys(MOTIVOS) as MotivoSolicitud[]).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={motivo === m} onClick={() => setMotivo(m)}
                className={cx("rounded-2xl px-3 py-2.5 text-left text-sm font-semibold ring-1 transition",
                  motivo === m ? "bg-blue-50 text-blue-900 ring-2 ring-blue-500" : "bg-sup/60 ring-sup hover:bg-sup")}>
                {MOTIVOS[m][para]}
              </button>
            ))}
          </div>
        </fieldset>
        <Campo etiqueta={para === "estudiante" ? "Cuéntale brevemente" : "Mensaje para el tutor(a)"}
          ayuda={`${mensaje.length} de ${MAX_MENSAJE} caracteres`}>
          <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value.slice(0, MAX_MENSAJE))} rows={4} className="campo"
            placeholder={para === "estudiante" ? "Por ejemplo: no entiendo fracciones y tengo examen el viernes." : "Por ejemplo: quisiera conversar sobre su rendimiento en Matemática."} />
        </Campo>
        <div>
          <span className="mb-1.5 block text-sm font-semibold">¿Cómo prefieres conversar?</span>
          <Segmentado etiqueta="Modalidad" valor={modalidad} onCambio={setModalidad} opciones={[{ valor: "presencial", texto: "En persona" }, { valor: "app", texto: "Por la app" }]} />
        </div>
        {motivo && esSensible(motivo) ? (
          <Aviso tipo="alerta" icono={ShieldAlert}>
            Lo verán {tutor} y la dirección del colegio, para {para === "estudiante" ? "protegerte" : "proteger a su hijo(a)"} lo antes posible.
          </Aviso>
        ) : (
          <p className="text-xs text-tinta-suave">
            {para === "estudiante" ? `Solo lo verá ${tutor}. Tu familia no ve tus pedidos.` : `Lo verá ${tutor}, tutor(a) de la sección.`} Si no hay señal, se envía cuando vuelva.
          </p>
        )}
      </div>
    </Dialogo>
  );
}

/** Vista del estudiante y del apoderado: su tutor(a), pedir ayuda y las observaciones registradas. */
export function MiTutoria() {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const esEstudiante = !!usuario?.roles.includes("estudiante");
  const para = esEstudiante ? "estudiante" : "apoderado";
  const { hijos, hijo } = useHijos(usuario);
  const [pidiendo, setPidiendo] = useState(false);

  const datos = useLiveQuery(async () => {
    if (!usuario || !hijo) return null;
    const mat = await matriculaActual(hijo.id);
    const sec = mat ? await db.tabla("seccion").get(mat.seccion_id) : undefined;
    const tutor = sec?.tutor_id ? await db.tabla("usuario").get(sec.tutor_id) : undefined;
    const obs = vivas(await db.tabla("observacion").where("estudiante_id").equals(hijo.id).toArray()).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const misPedidos = vivas(await db.tabla("solicitud_tutoria").where("solicitante_id").equals(usuario.id).toArray());
    return {
      tutor, obs, abiertas: misPedidos.filter((s) => ABIERTAS.includes(s.estado)).length,
      pedidos: misPedidos.filter((s) => s.estudiante_id === hijo.id).sort((a, b) => b.creada_en.localeCompare(a.creada_en)),
    };
  }, [usuario?.id, hijo?.id]);
  if (hijos && hijos.length === 0) return <Contenido><Vacio icono={HandHeart} titulo="No hay estudiantes vinculados a su cuenta" /></Contenido>;
  if (!datos || !hijo) return null;

  const nombreTutor = datos.tutor ? `${datos.tutor.nombres} ${datos.tutor.apellidos}` : null;
  const enLimite = datos.abiertas >= LIMITE_ABIERTAS;
  const cancelar = async (s: SolicitudTutoria) => {
    await guardar(db, "solicitud_tutoria", { id: s.id, estado: "cancelada" }, colegioId);
    avisar(textoGuardado("Pedido cancelado"));
  };

  return (
    <>
      <Encabezado etiqueta="Tutoría" titulo={esEstudiante ? "Mi tutoría" : "Tutoría"} />
      <Contenido>
        {!esEstudiante && <SelectorHijo hijos={hijos ?? []} hijo={hijo} />}
        <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
        <Tarjeta className="aparecer p-5" style={orden(1)}>
          <div className="flex items-center gap-4">
            <Gema icono={HandHeart} tono="tono-rosa" tam="lg" />
            <div className="min-w-0">
              <p className="etiqueta">{esEstudiante ? "Tu tutor(a)" : `Tutor(a) de ${hijo.nombres}`}</p>
              <p className="titulo-display text-xl font-bold">{nombreTutor ?? "Sin asignar"}</p>
              <p className="text-sm text-tinta-suave">
                {esEstudiante ? "Puedes pedirle ayuda con tus estudios o con cualquier cosa que te preocupe." : "Puede pedirle una entrevista para conversar sobre su hijo(a)."}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Boton icono={LifeBuoy} onClick={() => setPidiendo(true)} disabled={!nombreTutor || enLimite}>
              {esEstudiante ? "Pedir ayuda" : "Pedir entrevista"}
            </Boton>
            {enLimite && <p className="text-xs text-tinta-suave">Tienes {LIMITE_ABIERTAS} pedidos abiertos: espera la respuesta o cancela uno.</p>}
            {!nombreTutor && <p className="text-xs text-tinta-suave">Cuando la sección tenga tutor(a) podrás enviarle pedidos.</p>}
          </div>
        </Tarjeta>

        {esEstudiante && (
          <Aviso tipo="info" icono={ShieldAlert}>
            Si alguien te hace daño o te sientes en peligro, habla hoy con un adulto de confianza del colegio. También puedes llamar gratis a la <strong>Línea 100</strong>.
          </Aviso>
        )}

        {datos.pedidos.length > 0 && (
          <section className="aparecer space-y-2" style={orden(2)}>
            <h2 className="etiqueta px-1">{esEstudiante ? "Mis pedidos" : "Sus pedidos"}</h2>
            <Tarjeta className="divide-y divide-sup/70">
              {datos.pedidos.map((s) => (
                <TarjetaPedido key={s.id} s={s} para={para}
                  acciones={ABIERTAS.includes(s.estado) && <Boton variante="fantasma" icono={X} onClick={() => void cancelar(s)}>Cancelar pedido</Boton>} />
              ))}
            </Tarjeta>
          </section>
        )}

        </div>
        <section className="space-y-3">
        <h2 className="etiqueta px-1">{esEstudiante ? "Observaciones sobre ti" : `Observaciones sobre ${hijo.nombres}`}</h2>
        {datos.obs.length === 0 ? <Vacio icono={StickyNote} titulo="Aún no hay observaciones" /> : (
          <div className="space-y-3">
            {datos.obs.map((o) => (
              <Tarjeta key={o.id} className="flex gap-3 p-4">
                <Gema icono={StickyNote} tono={TIPO[o.tipo].tono} tam="sm" />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">{TIPO[o.tipo].texto} · <span className="font-normal text-tinta-suave">{new Date(`${o.fecha}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long" })}</span></p>
                  <p className="mt-0.5">{o.texto}</p>
                </div>
              </Tarjeta>
            ))}
          </div>
        )}
        </section>
        </div>
      </Contenido>
      {pidiendo && nombreTutor && <DialogoPedirAyuda estudianteId={hijo.id} para={para} tutor={nombreTutor} onCerrar={() => setPidiendo(false)} />}
    </>
  );
}
