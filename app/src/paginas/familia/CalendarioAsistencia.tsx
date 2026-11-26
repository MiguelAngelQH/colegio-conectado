import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import type { EstadoAsistencia } from "@/db/tipos";
import { cuadriculaMes, estadoDelDia, feriados } from "@/dominio/calendario";
import { cx } from "@/ui/componentes";

/** Lo mínimo que el calendario necesita de cada marca. */
export interface MarcaDia {
  id: string;
  fecha: string;
  estado: EstadoAsistencia;
}

const SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const ESTILO: Record<EstadoAsistencia, { celda: string; punto: string; texto: string }> = {
  P: { celda: "bg-emerald-100/80 text-emerald-900 ring-emerald-200", punto: "bg-emerald-500", texto: "Asistió" },
  T: { celda: "bg-amber-100/90 text-amber-900 ring-amber-300", punto: "bg-amber-500", texto: "Tardanza" },
  F: { celda: "bg-red-100/90 text-red-900 ring-red-300", punto: "bg-red-500", texto: "Falta" },
  J: { celda: "bg-sky-100/90 text-sky-900 ring-sky-300", punto: "bg-sky-500", texto: "Justificada" },
};

const hoyTexto = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const nombreMes = (anio: number, mes: number) => {
  const m = new Date(anio, mes, 1).toLocaleDateString("es-PE", { month: "long" });
  return `${m[0].toUpperCase()}${m.slice(1)} ${anio}`;
};

/**
 * Asistencia del año como calendario: cada día se pinta con lo más importante (falta, tardanza,
 * justificada o asistió) y lleva un punto por clase. Al tocar un día se elige y se muestra su detalle.
 */
export function CalendarioAsistencia({ marcas, elegido, onElegir }: {
  marcas: MarcaDia[]; elegido: string | null; onElegir(fecha: string | null): void;
}) {
  const porDia = useMemo(() => {
    const m = new Map<string, EstadoAsistencia[]>();
    for (const x of marcas) m.set(x.fecha, [...(m.get(x.fecha) ?? []), x.estado]);
    return m;
  }, [marcas]);

  // Empieza en el mes de la última asistencia registrada (o el actual).
  const ultima = marcas.reduce((u, x) => (x.fecha > u ? x.fecha : u), "");
  const inicio = ultima || hoyTexto();
  const [vista, setVista] = useState({ anio: Number(inicio.slice(0, 4)), mes: Number(inicio.slice(5, 7)) - 1 });
  useEffect(() => setVista({ anio: Number(inicio.slice(0, 4)), mes: Number(inicio.slice(5, 7)) - 1 }), [inicio]);

  const primera = marcas.reduce((p, x) => (!p || x.fecha < p ? x.fecha : p), "");
  const clave = (a: number, m: number) => a * 12 + m;
  const minimo = primera ? clave(Number(primera.slice(0, 4)), Number(primera.slice(5, 7)) - 1) : clave(vista.anio, vista.mes);
  const maximo = Math.max(clave(Number(hoyTexto().slice(0, 4)), Number(hoyTexto().slice(5, 7)) - 1), minimo);
  const actual = clave(vista.anio, vista.mes);
  const mover = (n: number) => {
    const c = Math.min(maximo, Math.max(minimo, actual + n));
    setVista({ anio: Math.floor(c / 12), mes: c % 12 });
    onElegir(null);
  };

  const celdas = cuadriculaMes(vista.anio, vista.mes);
  const libres = feriados(vista.anio);
  const hoy = hoyTexto();
  const prefijo = `${vista.anio}-${String(vista.mes + 1).padStart(2, "0")}`;

  // Resumen del mes, contando días (no clases).
  const resumen = { P: 0, T: 0, F: 0, J: 0 } as Record<EstadoAsistencia, number>;
  for (const [f, est] of porDia) if (f.startsWith(prefijo)) resumen[estadoDelDia(est)!]++;
  const diasMes = resumen.P + resumen.T + resumen.F + resumen.J;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={() => mover(-1)} disabled={actual <= minimo} aria-label="Mes anterior"
          className="grid h-10 w-10 place-items-center rounded-full transition hover:bg-sup/60 disabled:opacity-30">
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <h3 className="titulo-display flex-1 text-center text-lg font-bold">{nombreMes(vista.anio, vista.mes)}</h3>
        <button type="button" onClick={() => mover(1)} disabled={actual >= maximo} aria-label="Mes siguiente"
          className="grid h-10 w-10 place-items-center rounded-full transition hover:bg-sup/60 disabled:opacity-30">
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label={`Asistencia de ${nombreMes(vista.anio, vista.mes)}`}>
        {SEMANA.map((d, i) => <p key={d} className={cx("pb-1 text-center text-[0.68rem] font-semibold uppercase tracking-wide text-tinta-suave", i > 4 && "opacity-60")}>{d}</p>)}
        {celdas.map((f, i) => {
          if (!f) return <span key={`v${i}`} />;
          const estados = porDia.get(f) ?? [];
          const resumenDia = estadoDelDia(estados);
          const feriado = libres.get(f);
          const finde = i % 7 > 4;
          const seleccionado = elegido === f;
          const etiqueta = `${Number(f.slice(8))} de ${nombreMes(vista.anio, vista.mes)}: ${resumenDia ? ESTILO[resumenDia].texto : feriado ?? (finde ? "fin de semana" : "sin registro")}`;
          return (
            <button key={f} type="button" disabled={!estados.length} onClick={() => onElegir(seleccionado ? null : f)}
              aria-label={etiqueta} aria-pressed={seleccionado} title={feriado ?? undefined}
              className={cx(
                "relative flex h-12 flex-col items-center justify-center rounded-xl text-sm font-semibold ring-1 transition sm:h-14 xl:h-16",
                resumenDia ? cx(ESTILO[resumenDia].celda, "hover:brightness-95") : feriado ? "bg-violet-50/70 text-violet-700 ring-violet-200/70" : finde ? "text-tinta-suave/50 ring-transparent" : "text-tinta-suave ring-tinta/5",
                f === hoy && "outline outline-2 outline-offset-1 outline-blue-500",
                seleccionado && "scale-105 shadow-lg ring-2 ring-blue-600",
              )}>
              <span>{Number(f.slice(8))}</span>
              {estados.length > 0 && (
                <span className="mt-0.5 flex max-w-full gap-[3px] px-1" aria-hidden>
                  {estados.slice(0, 6).map((e, k) => <span key={k} className={cx("h-1.5 w-1.5 shrink-0 rounded-full", ESTILO[e].punto)} />)}
                </span>
              )}
              {feriado && !estados.length && <PartyPopper className="mt-0.5 h-3 w-3 opacity-70" aria-hidden />}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-tinta-suave">
        {(["P", "T", "F", "J"] as const).map((e) => (
          <span key={e} className="flex items-center gap-1.5"><span className={cx("h-2.5 w-2.5 rounded-full", ESTILO[e].punto)} /> {ESTILO[e].texto}</span>
        ))}
        <span className="flex items-center gap-1.5"><PartyPopper className="h-3 w-3 text-violet-600" aria-hidden /> Feriado</span>
        <span className="text-[0.7rem]">Cada punto es una clase.</span>
      </div>

      <p className="mt-2 text-sm">
        {diasMes === 0 ? "Sin asistencias registradas este mes." : (
          <>
            <b className="capitalize">{new Date(vista.anio, vista.mes, 1).toLocaleDateString("es-PE", { month: "long" })}</b>: {diasMes} {diasMes === 1 ? "día" : "días"} con registro
            {resumen.F ? <>, <b className="text-red-700">{resumen.F} con falta</b></> : ""}
            {resumen.T ? <>, <b className="text-amber-700">{resumen.T} con tardanza</b></> : ""}
            {resumen.J ? <>, {resumen.J} justificado{resumen.J === 1 ? "" : "s"}</> : ""}.
          </>
        )}
      </p>
    </div>
  );
}
