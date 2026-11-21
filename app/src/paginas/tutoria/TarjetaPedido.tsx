import type { ReactNode } from "react";
import { CalendarClock, MessageCircle, ShieldAlert, Users } from "lucide-react";
import type { SolicitudTutoria } from "@/db/tipos";
import { ESTADOS, esSensible, MOTIVOS } from "@/dominio/solicitudes";
import { cx } from "@/ui/componentes";

const TONO_ESTADO: Record<SolicitudTutoria["estado"], string> = {
  enviada: "bg-sky-50 text-sky-900 ring-sky-200",
  vista: "bg-violet-50 text-violet-900 ring-violet-200",
  agendada: "bg-amber-50 text-amber-900 ring-amber-200",
  atendida: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  cancelada: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function ChipEstado({ estado }: { estado: SolicitudTutoria["estado"] }) {
  return <span className={cx("shrink-0 rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold ring-1", TONO_ESTADO[estado])}>{ESTADOS[estado]}</span>;
}

export const fechaHoraCita = (iso: string) => {
  const t = new Date(iso).toLocaleString("es-PE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
export const fechaPedido = (iso: string) => new Date(iso).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Un pedido de ayuda con su estado, la respuesta y la cita. "quien" es el estudiante o quién lo pidió. */
export function TarjetaPedido({ s, quien, para = "estudiante", acciones }: {
  s: SolicitudTutoria; quien?: ReactNode; para?: "estudiante" | "apoderado"; acciones?: ReactNode;
}) {
  return (
    <article className="space-y-2 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {quien && <p className="font-semibold text-tinta">{quien}</p>}
          <p className={cx("flex items-center gap-1.5 text-sm", quien ? "text-tinta-suave" : "font-semibold text-tinta")}>
            {esSensible(s.motivo) && <ShieldAlert className="h-4 w-4 shrink-0 text-red-700" aria-label="Caso de convivencia" />}
            {MOTIVOS[s.motivo][para]}
          </p>
          <p className="text-xs text-tinta-suave">
            {fechaPedido(s.creada_en)} · {s.modalidad === "presencial" ? <><Users className="inline h-3 w-3" aria-hidden /> En persona</> : <><MessageCircle className="inline h-3 w-3" aria-hidden /> Por la app</>}
          </p>
        </div>
        <ChipEstado estado={s.estado} />
      </div>
      <p className="whitespace-pre-line rounded-2xl bg-white/60 px-3 py-2 text-sm text-tinta ring-1 ring-white">{s.mensaje}</p>
      {s.cita && s.estado !== "cancelada" && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
          <CalendarClock className="h-4 w-4" aria-hidden /> Cita: {fechaHoraCita(s.cita)}
        </p>
      )}
      {s.respuesta && (
        <div className="rounded-2xl bg-teal-50/80 px-3 py-2 text-sm ring-1 ring-teal-100">
          <p className="etiqueta !text-teal-800">Respuesta</p>
          <p className="whitespace-pre-line text-tinta">{s.respuesta}</p>
        </div>
      )}
      {acciones && <div className="flex flex-wrap justify-end gap-2 pt-1">{acciones}</div>}
    </article>
  );
}
