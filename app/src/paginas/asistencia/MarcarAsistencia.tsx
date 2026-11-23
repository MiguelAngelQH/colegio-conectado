import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CircleCheck, CloudOff, LoaderCircle, PartyPopper, QrCode, ScanLine, TriangleAlert } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { NOMBRE_ESTADO, claseAbiertaDe, detallesDeSesiones, envioDeMarca, marcarConQr, type DetalleSesion } from "@/datos/asistencia";
import { asistenciaDelAnio } from "@/datos/consultas";
import { vivas } from "@/db/repositorio";
import type { Estudiante } from "@/db/tipos";
import { leerCodigoCorto, leerTokenQr, textoCarne, tokenDeCodigo, ventanaDe } from "@/dominio/qr";
import { ahoraServidor } from "@/sync/reloj";
import { Boton, Contenido, Dialogo, Encabezado, Gema, Tarjeta, cx, orden } from "@/ui/componentes";
import { Segmentado, Vacio } from "@/ui/formulario";
import { CodigoQr, Escaner } from "@/ui/qr";

type Resultado =
  | { tipo: "enviando" }
  | { tipo: "ok"; sesionId: string; sinSenal: boolean }
  | { tipo: "repetida" | "error"; texto: string }
  | null;

export function MarcarAsistencia() {
  const { usuario, colegioId, sync, sincronizarAhora } = useApp();
  const [modo, setModo] = useState<"escanear" | "mi-qr">("escanear");
  const [resultado, setResultado] = useState<Resultado>(null);
  const [felicitar, setFelicitar] = useState<{ sesionId: string; sinSenal: boolean } | null>(null);

  const datos = useLiveQuery(async () => {
    if (!usuario) return null;
    const yo = (await db.tabla("estudiante").where("usuario_id").equals(usuario.id).toArray()).find((e) => !e.eliminado);
    if (!yo) return { yo: undefined, marcas: [] };
    const marcas = vivas(await db.tabla("asistencia").where("estudiante_id").equals(yo.id).toArray())
      .sort((a, b) => (b.marcado_en ?? "").localeCompare(a.marcado_en ?? ""))
      .slice(0, 8);
    const outbox = (await db.outbox.toArray()).filter((e) => e.tabla === "asistencia");
    const pendientes = new Set(outbox.filter((e) => e.estado !== "rechazado").map((e) => e.fila_id));
    const rechazos = new Map(outbox.filter((e) => e.estado === "rechazado").map((e) => [e.fila_id, e.error]));
    const detalles = await detallesDeSesiones(marcas.map((m) => m.sesion_id));
    return { yo, marcas: marcas.map((m) => ({ m, d: detalles.get(m.sesion_id), pendiente: pendientes.has(m.id), rechazo: rechazos.get(m.id) })) };
  }, [usuario?.id]);

  if (!datos) return null;
  if (!datos.yo) {
    return (
      <>
        <Encabezado etiqueta="Asistencia" titulo="Marcar asistencia" />
        <Contenido ancho="max-w-md"><Vacio icono={QrCode} titulo="Su cuenta no está vinculada a un estudiante">Avise a la dirección del colegio.</Vacio></Contenido>
      </>
    );
  }
  const yo = datos.yo;

  /** Guarda la marca y, si hay señal, espera la respuesta del colegio antes de felicitar. */
  const registrar = async (token: string, sesionId: string) => {
    const r = await marcarConQr({ token, sesionId, estudianteId: yo.id, colegioId });
    if (r === "repetida") {
      setResultado({ tipo: "repetida", texto: "Ya habías registrado tu asistencia en esta clase" });
      return;
    }
    if (!sync.conectado) {
      setResultado({ tipo: "ok", sesionId, sinSenal: true });
      setFelicitar({ sesionId, sinSenal: true });
      return;
    }
    setResultado({ tipo: "enviando" });
    await sincronizarAhora();
    const envio = await envioDeMarca(sesionId, yo.id);
    if (envio.estado === "rechazada") {
      setResultado({ tipo: "error", texto: envio.motivo });
      return;
    }
    const sinSenal = envio.estado === "pendiente";
    setResultado({ tipo: "ok", sesionId, sinSenal });
    setFelicitar({ sesionId, sinSenal });
  };

  const leer = async (texto: string) => {
    // Código de 6 dígitos escrito a mano: se marca en la clase abierta de su sección.
    const codigo = leerCodigoCorto(texto);
    if (codigo) {
      let clase = await claseAbiertaDe(yo.id);
      if (!clase && sync.conectado) {
        await sincronizarAhora();
        clase = await claseAbiertaDe(yo.id);
      }
      if (!clase) {
        setResultado({ tipo: "error", texto: sync.conectado
          ? "No hay una clase abierta en tu sección. Espera a que tu docente muestre el código."
          : "Sin conexión no se puede usar el código escrito. Escanea el QR con la cámara." });
        return;
      }
      await registrar(tokenDeCodigo(clase.id, ventanaDe(ahoraServidor()), codigo), clase.id);
      return;
    }
    const token = leerTokenQr(texto);
    if (!token) {
      setResultado({ tipo: "error", texto: "Ese código no es de asistencia. Escanea el QR o escribe los 6 dígitos que muestra tu docente." });
      return;
    }
    await registrar(texto.trim(), token.sesionId);
  };

  return (
    <>
      <Encabezado etiqueta="Asistencia" titulo="Marcar asistencia" subtitulo="Escanea el QR de tu docente, escribe su código de 6 dígitos o muéstrale tu QR." />
      <Contenido ancho="max-w-md">
        <div className="flex justify-center">
          <Segmentado etiqueta="Cómo marcar" valor={modo} onCambio={(v) => { setModo(v); setResultado(null); }}
            opciones={[{ valor: "escanear", texto: "Escanear" }, { valor: "mi-qr", texto: "Mi QR" }]} />
        </div>

        {modo === "mi-qr" ? (
          <MiQr yo={yo} />
        ) : resultado ? (
          <Tarjeta fuerte className="aparecer flex flex-col items-center gap-4 p-8 text-center">
            {resultado.tipo === "enviando" ? (
              <>
                <LoaderCircle className="h-12 w-12 animate-spin text-teal-600" aria-hidden />
                <h2 className="titulo-display text-xl font-bold">Enviando tu asistencia...</h2>
              </>
            ) : (
              <>
                <Gema icono={resultado.tipo === "error" ? TriangleAlert : CircleCheck} tono={resultado.tipo === "error" ? "tono-coral" : "tono-musgo"} tam="lg" />
                <h2 className="titulo-display text-2xl font-bold">
                  {resultado.tipo === "ok" ? "Asistencia registrada" : resultado.tipo === "error" ? "No se pudo registrar" : resultado.texto}
                </h2>
                {resultado.tipo === "error" && <p className="text-sm text-tinta-suave">{resultado.texto}</p>}
                {resultado.tipo === "ok" && (
                  <p className="flex items-center gap-2 text-sm text-tinta-suave">
                    {resultado.sinSenal
                      ? <><CloudOff className="h-4 w-4" aria-hidden /> Sin conexión: se enviará cuando haya señal.</>
                      : <><CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden /> Recibida por el colegio</>}
                  </p>
                )}
                <Boton variante="vidrio" icono={ScanLine} onClick={() => setResultado(null)}>{resultado.tipo === "error" ? "Intentar de nuevo" : "Escanear otro código"}</Boton>
              </>
            )}
          </Tarjeta>
        ) : (
          <Tarjeta className="aparecer p-4" style={orden(1)}>
            <Escaner onLeer={(t) => void leer(t)} textoManual="Escribir el código de 6 dígitos" placeholderManual="Código de 6 dígitos" numerico />
          </Tarjeta>
        )}

        {datos.marcas.length > 0 && (
          <section className="space-y-2">
            <h2 className="etiqueta px-1">Mis últimas marcas</h2>
            <Tarjeta className="divide-y divide-white/70">
              {datos.marcas.map(({ m, d, pendiente, rechazo }) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{d?.clase ?? (pendiente ? "Clase de hoy" : "Clase")}{d?.seccion ? ` · ${d.seccion}` : ""}</span>
                    <span className="block text-xs text-tinta-suave">
                      {m.marcado_en ? new Date(m.marcado_en).toLocaleString("es-PE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}
                      {d?.docente ? ` · Prof. ${d.docente}` : ""}
                      {m.origen === "qr" ? " · con QR" : m.origen === "carne" ? " · con carné" : ""}
                    </span>
                    {m.motivo_revision && <span className="block text-xs text-amber-800">En revisión: {m.motivo_revision}</span>}
                    {rechazo && <span className="block text-xs text-red-700">No aceptada: {rechazo}</span>}
                  </span>
                  <span className={cx("rounded-full px-2.5 py-1 text-[0.65rem] font-bold",
                    rechazo ? "bg-red-100/80 text-red-800" : pendiente ? "bg-sky-100/80 text-sky-800" : m.por_revisar ? "bg-amber-100/80 text-amber-800" : "bg-emerald-100/80 text-emerald-800")}>
                    {rechazo ? "Rechazada" : pendiente ? "Por enviar" : m.por_revisar ? "Por revisar" : NOMBRE_ESTADO[m.estado]}
                  </span>
                </div>
              ))}
            </Tarjeta>
          </section>
        )}
      </Contenido>
      {felicitar && <Felicitacion yo={yo} {...felicitar} onCerrar={() => setFelicitar(null)} />}
    </>
  );
}

/** El QR del carné en el celular: el docente lo escanea en el modo "Carnés". */
function MiQr({ yo }: { yo: Estudiante }) {
  return (
    <Tarjeta fuerte className="aparecer flex flex-col items-center gap-4 p-6 text-center">
      <div className="w-full max-w-xs rounded-[1.75rem] bg-white p-4 shadow-[0_24px_60px_-24px_rgba(11,46,51,.6)]">
        <CodigoQr texto={textoCarne(yo.codigo_carne)} className="aspect-square w-full" />
      </div>
      <div>
        <p className="titulo-display text-lg font-bold">{yo.nombres} {yo.apellidos}</p>
        <p className="text-sm text-tinta-suave">Código de carné <span className="font-bold tracking-wider text-tinta">{yo.codigo_carne}</span></p>
      </div>
      <p className="max-w-xs text-xs text-tinta-suave">
        Muéstrale este código a tu docente o auxiliar: lo escanea con su celular en la opción "Carnés". Sube el brillo de tu pantalla si no lo lee.
      </p>
    </Tarjeta>
  );
}

const CONFETI = ["bg-teal-400", "bg-amber-300", "bg-rose-400", "bg-sky-400", "bg-lime-400", "bg-violet-400"];

/** Ventana de felicitación al registrar la asistencia. */
function Felicitacion({ yo, sesionId, sinSenal, onCerrar }: { yo: Estudiante; sesionId: string; sinSenal: boolean; onCerrar(): void }) {
  const info = useLiveQuery(async (): Promise<{ d: DetalleSesion | undefined; presentes: number }> => {
    const d = (await detallesDeSesiones([sesionId])).get(sesionId);
    const { marcas } = await asistenciaDelAnio(yo.id);
    return { d, presentes: marcas.filter((m) => m.estado === "P").length };
  }, [sesionId, yo.id]);

  return (
    <Dialogo abierto titulo="Asistencia registrada" onCerrar={onCerrar} acciones={<Boton onClick={onCerrar} className="w-full">Continuar</Boton>}>
      <div className="relative overflow-hidden pb-1 pt-2 text-center text-tinta">
        <div aria-hidden className="pointer-events-none absolute inset-0 motion-reduce:hidden">
          {Array.from({ length: 18 }, (_, i) => (
            <span key={i} className={cx("confeti absolute top-0 h-2.5 w-1.5 rounded-sm", CONFETI[i % CONFETI.length])}
              style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.12}s`, animationDuration: `${1.6 + (i % 5) * 0.25}s` }} />
          ))}
        </div>
        <div className="relative flex flex-col items-center gap-3">
          <Gema icono={PartyPopper} tono="tono-ambar" tam="lg" />
          <p className="titulo-display text-2xl font-bold">¡Felicidades, {yo.nombres.split(" ")[0]}!</p>
          <p className="text-sm text-tinta-suave">
            {info?.d ? <>Tu asistencia en <strong className="text-tinta">{info.d.clase}</strong>{info.d.docente ? <> con Prof. {info.d.docente}</> : null} quedó registrada.</> : "Tu asistencia quedó registrada."}
            {" "}¡Gracias por venir!
          </p>
          {info && info.presentes > 1 && (
            <p className="rounded-full bg-emerald-100/80 px-4 py-1.5 text-sm font-bold text-emerald-800">Llevas {info.presentes} asistencias este año</p>
          )}
          {sinSenal && <p className="text-xs text-tinta-suave">Sin conexión: se enviará al colegio cuando haya señal.</p>}
        </div>
      </div>
    </Dialogo>
  );
}
