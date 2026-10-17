import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CircleCheck, CloudOff, CloudUpload, QrCode, ScanLine, TriangleAlert } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { NOMBRE_ESTADO, marcarConQr } from "@/datos/asistencia";
import { vivas } from "@/db/repositorio";
import { leerTokenQr } from "@/dominio/qr";
import { Boton, Contenido, Encabezado, Gema, Tarjeta, cx, orden } from "@/ui/componentes";
import { Vacio } from "@/ui/formulario";
import { Escaner } from "@/ui/qr";

type Resultado = { tipo: "ok" | "repetida" | "error"; texto: string } | null;

export function MarcarAsistencia() {
  const { usuario, colegioId, sync } = useApp();
  const [resultado, setResultado] = useState<Resultado>(null);

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
    return { yo, marcas: marcas.map((m) => ({ m, pendiente: pendientes.has(m.id), rechazo: rechazos.get(m.id) })) };
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

  const leer = async (texto: string) => {
    const token = leerTokenQr(texto);
    if (!token) {
      setResultado({ tipo: "error", texto: "Ese código no es de asistencia. Escanee el QR que muestra su docente." });
      return;
    }
    const r = await marcarConQr({ token: texto.trim(), sesionId: token.sesionId, estudianteId: datos.yo!.id, colegioId });
    setResultado(r === "nueva"
      ? { tipo: "ok", texto: "Asistencia registrada" }
      : { tipo: "repetida", texto: "Ya había registrado su asistencia en esta clase" });
  };

  return (
    <>
      <Encabezado etiqueta="Asistencia" titulo="Marcar asistencia" subtitulo="Apunte al código QR que muestra su docente." />
      <Contenido ancho="max-w-md">
        {resultado ? (
          <Tarjeta fuerte className="aparecer flex flex-col items-center gap-4 p-8 text-center">
            <Gema icono={resultado.tipo === "error" ? TriangleAlert : CircleCheck} tono={resultado.tipo === "error" ? "tono-coral" : "tono-musgo"} tam="lg" />
            <h2 className="titulo-display text-2xl font-bold">{resultado.texto}</h2>
            {resultado.tipo === "ok" && (
              <p className="flex items-center gap-2 text-sm text-tinta-suave">
                {datos.marcas[0] && !datos.marcas[0].pendiente
                  ? <><CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden /> Recibida por el colegio</>
                  : sync.conectado
                    ? <><CloudUpload className="h-4 w-4" aria-hidden /> Enviando a su docente...</>
                    : <><CloudOff className="h-4 w-4" aria-hidden /> Sin conexión: se enviará cuando haya señal.</>}
              </p>
            )}
            <Boton variante="vidrio" icono={ScanLine} onClick={() => setResultado(null)}>Escanear otro código</Boton>
          </Tarjeta>
        ) : (
          <Tarjeta className="aparecer p-4" style={orden(1)}>
            <Escaner onLeer={(t) => void leer(t)} textoManual="La cámara no funciona" />
          </Tarjeta>
        )}

        {datos.marcas.length > 0 && (
          <section className="space-y-2">
            <h2 className="etiqueta px-1">Mis últimas marcas</h2>
            <Tarjeta className="divide-y divide-white/70">
              {datos.marcas.map(({ m, pendiente, rechazo }) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="flex-1">
                    <span className="block font-semibold">{m.marcado_en ? new Date(m.marcado_en).toLocaleString("es-PE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}</span>
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
    </>
  );
}
