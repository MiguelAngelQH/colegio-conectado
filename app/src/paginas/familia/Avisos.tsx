import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellRing, BookCheck, CalendarDays, CalendarX, MessagesSquare, ClipboardList, Eye, FileCheck, HandHeart, Megaphone, StickyNote, type LucideIcon } from "lucide-react";
import { useApp } from "@/app/contexto";
import { marcarAvisosVistos, useAvisos } from "@/datos/familia";
import type { TipoAviso } from "@/dominio/avisos";
import { Boton, Contenido, Encabezado, Gema, Tarjeta, cx, orden } from "@/ui/componentes";
import { Vacio } from "@/ui/formulario";

const ICONO: Record<TipoAviso, { icono: LucideIcon; tono: string }> = {
  falta: { icono: CalendarX, tono: "tono-coral" },
  tardanza: { icono: CalendarX, tono: "tono-ambar" },
  nota: { icono: ClipboardList, tono: "tono-cielo" },
  comunicado: { icono: Megaphone, tono: "tono-ambar" },
  observacion: { icono: StickyNote, tono: "tono-musgo" },
  justificacion: { icono: FileCheck, tono: "tono-lila" },
  por_revisar: { icono: FileCheck, tono: "tono-cielo" },
  monitoreo: { icono: Eye, tono: "tono-lila" },
  tutoria: { icono: HandHeart, tono: "tono-rosa" },
  tarea: { icono: BookCheck, tono: "tono-cielo" },
  evento: { icono: CalendarDays, tono: "tono-ambar" },
  mensaje: { icono: MessagesSquare, tono: "tono-laguna" },
};

const cuando = (iso: string) => (iso ? new Date(iso).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export function Avisos() {
  const { usuario } = useApp();
  const datos = useAvisos(usuario);
  // Los "nuevos" se congelan al abrir la página (si no, desaparecerían al marcarlos como vistos).
  const nuevosAlAbrir = useRef<Set<string> | null>(null);
  const [permiso, setPermiso] = useState(typeof Notification === "undefined" ? "no-soportado" : Notification.permission);

  useEffect(() => {
    if (!datos || !usuario || nuevosAlAbrir.current) return;
    nuevosAlAbrir.current = new Set(datos.avisos.filter((a) => a.nuevo).map((a) => a.id));
    void marcarAvisosVistos(usuario.id);
  }, [datos, usuario]);

  if (!datos) return null;
  const nuevos = datos.avisos.filter((a) => nuevosAlAbrir.current?.has(a.id));
  const anteriores = datos.avisos.filter((a) => !nuevosAlAbrir.current?.has(a.id)).slice(0, 40);

  const activar = async () => setPermiso(await Notification.requestPermission());

  const lista = (avisos: typeof datos.avisos, base: number) => (
    <Tarjeta className="divide-y divide-sup/70 overflow-hidden">
      {avisos.map((a, i) => {
        const { icono, tono } = ICONO[a.tipo];
        return (
          <Link key={a.id} to={a.enlace} style={orden(Math.min(base + i, 8))} className="aparecer flex gap-3 px-4 py-3 transition hover:bg-sup/40">
            <Gema icono={icono} tono={tono} tam="sm" />
            <span className="min-w-0 flex-1 text-sm">
              <span className={cx("block font-semibold", a.importante && "text-tinta")}>{a.titulo}</span>
              <span className="line-clamp-2 block text-tinta-suave">{a.detalle}</span>
              <span className="mt-0.5 block text-[0.7rem] text-tinta-suave/80">{cuando(a.momento)}</span>
            </span>
            {a.importante && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" aria-label="Importante" />}
          </Link>
        );
      })}
    </Tarjeta>
  );

  return (
    <>
      <Encabezado etiqueta="Bandeja" titulo="Avisos" subtitulo="Se actualizan cada vez que el equipo sincroniza." />
      <Contenido ancho="max-w-2xl">
        {permiso === "default" && (
          <Tarjeta className="aparecer flex flex-wrap items-center gap-3 p-4">
            <Gema icono={BellRing} tono="tono-ambar" tam="sm" />
            <p className="min-w-0 flex-1 text-sm">Reciba un aviso en el celular cuando llegue algo nuevo (con la app abierta o en segundo plano).</p>
            <Boton variante="vidrio" onClick={activar}>Activar</Boton>
          </Tarjeta>
        )}
        {datos.avisos.length === 0 && <Vacio icono={Bell} tono="tono-ambar" titulo="No hay avisos" />}
        {nuevos.length > 0 && (
          <section className="space-y-2">
            <h2 className="etiqueta px-1">Nuevos ({nuevos.length})</h2>
            {lista(nuevos, 1)}
          </section>
        )}
        {anteriores.length > 0 && (
          <section className="space-y-2">
            <h2 className="etiqueta px-1">Anteriores</h2>
            {lista(anteriores, nuevos.length + 1)}
          </section>
        )}
      </Contenido>
    </>
  );
}
