import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock, ArrowRight, BookCheck, CalendarDays, ChartColumn, CircleCheck, ClipboardList, FileCheck, MessageCircle,
  QrCode, RotateCcw, Sparkles, TriangleAlert,
} from "lucide-react";
import type { Usuario } from "@/db/tipos";
import { useSugerencias } from "@/datos/asistente";
import type { TipoSugerencia } from "@/dominio/asistente";
import { cx } from "./componentes";

const ICONO: Record<TipoSugerencia, { icono: LucideIcon; tono: string }> = {
  clase: { icono: QrCode, tono: "tono-laguna" },
  proxima: { icono: AlarmClock, tono: "tono-cielo" },
  notas: { icono: ClipboardList, tono: "tono-ambar" },
  entregas: { icono: BookCheck, tono: "tono-musgo" },
  justificaciones: { icono: FileCheck, tono: "tono-cielo" },
  mensajes: { icono: MessageCircle, tono: "tono-lila" },
  riesgo: { icono: TriangleAlert, tono: "tono-coral" },
  tarea: { icono: BookCheck, tono: "tono-ambar" },
  devuelta: { icono: RotateCcw, tono: "tono-coral" },
  evento: { icono: CalendarDays, tono: "tono-rosa" },
  avance: { icono: ChartColumn, tono: "tono-lila" },
};

/** "Tu día": lo que el asistente propone hacer ahora, ordenado por importancia. */
export function TuDia({ usuario, className, style }: { usuario: Usuario; className?: string; style?: React.CSSProperties }) {
  const sugerencias = useSugerencias(usuario);
  if (!sugerencias) return null;

  return (
    <section aria-labelledby="tu-dia" className={cx("vidrio relative overflow-hidden p-4 sm:p-5", className)} style={style}>
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-blue-400/20 blur-3xl" />
      <header className="relative mb-3 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#2563eb] to-[#1e3a8a] text-white shadow-[0_6px_14px_-6px_rgba(37,99,235,.8)]">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h2 id="tu-dia" className="titulo-display text-lg font-bold leading-tight">Tu día</h2>
          <p className="text-xs text-tinta-suave">Lo más importante ahora, según tu horario y tus pendientes.</p>
        </div>
      </header>

      {sugerencias.length === 0 ? (
        <p className="relative flex items-center gap-3 rounded-2xl bg-emerald-50/70 p-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200/70">
          <CircleCheck className="h-5 w-5 shrink-0" aria-hidden /> Todo al día. No hay pendientes urgentes.
        </p>
      ) : (
        <ul className="relative space-y-1.5">
          {sugerencias.map((s, i) => {
            const { icono: Icono, tono } = ICONO[s.tipo];
            const urgente = s.prioridad >= 85;
            return (
              <li key={s.id} className="aparecer" style={{ ["--i" as string]: i + 1 }}>
                <Link to={s.ruta}
                  className={cx("group flex items-center gap-3 rounded-2xl p-2.5 transition hover:bg-sup/60",
                    urgente ? "bg-sup/55 ring-1 ring-amber-300/60" : "bg-sup/30")}>
                  <span className={cx("gema h-10 w-10 shrink-0", tono)}><Icono className="relative z-10 h-[18px] w-[18px]" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{s.titulo}</span>
                      {urgente && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-amber-800">Urgente</span>}
                    </span>
                    <span className="block truncate text-xs text-tinta-suave">{s.detalle}</span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-blue-700 sm:flex">
                    {s.accion} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-blue-700 sm:hidden" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
