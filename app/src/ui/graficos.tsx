// Gráficos del panel. Reglas (skill dataviz): un solo eje, marcas finas con extremos redondeados de
// 4 px y separación de 2 px, etiquetas directas selectivas, leyenda, tooltip y vista de tabla.
// Los niveles AD/A/B/C usan un par divergente azul / rojo-anaranjado validado para daltonismo
// (protan ΔE 16,9); el contraste bajo de A y B se compensa con etiquetas y la tabla.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Table2 } from "lucide-react";
import type { NivelLogro } from "@/db/tipos";
import { DESCRIPCION_NIVEL, NIVELES } from "@/dominio/notas";
import { cx } from "./componentes";

export const NIVEL_HEX: Record<NivelLogro, string> = { AD: "#1d4f91", A: "#5b9bd5", B: "#f0956a", C: "#b8322a" };
/** Texto sobre cada relleno (los claros llevan tinta oscura). */
export const NIVEL_TEXTO: Record<NivelLogro, string> = { AD: "#ffffff", A: "#0b2e33", B: "#0b2e33", C: "#ffffff" };
const MARCA = "#0f8f84"; // un solo tono para series únicas

function BotonTabla({ activa, onClick }: { activa: boolean; onClick(): void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa}
      className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
        activa ? "bg-white text-tinta ring-white" : "text-tinta-suave ring-white/70 hover:bg-white/50")}>
      <Table2 className="h-3.5 w-3.5" aria-hidden /> {activa ? "Ver gráfico" : "Ver tabla"}
    </button>
  );
}

export function MarcoGrafico({ titulo, subtitulo, children, tabla, leyenda }: {
  titulo: string; subtitulo?: string; children: ReactNode; tabla: ReactNode; leyenda?: ReactNode;
}) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <figure className="vidrio space-y-3 p-4 sm:p-5">
      <figcaption className="flex flex-wrap items-start justify-between gap-2">
        <span>
          <span className="block font-bold">{titulo}</span>
          {subtitulo && <span className="block text-xs text-tinta-suave">{subtitulo}</span>}
        </span>
        <BotonTabla activa={verTabla} onClick={() => setVerTabla(!verTabla)} />
      </figcaption>
      {!verTabla && leyenda}
      {verTabla ? <div className="overflow-x-auto">{tabla}</div> : children}
    </figure>
  );
}

const claseTabla = "w-full text-left text-sm [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-xs [&_th]:font-semibold [&_th]:text-tinta-suave [&_tbody_tr]:border-t [&_tbody_tr]:border-white/70";

// ------------------------------------------------------------------ barras 100% por nivel de logro

export interface FilaNiveles { etiqueta: string; conteo: Record<NivelLogro, number>; total: number }

export function LeyendaNiveles() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta-suave" aria-label="Leyenda">
      {NIVELES.map((n) => (
        <li key={n} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px]" style={{ background: NIVEL_HEX[n] }} aria-hidden />
          <span><strong className="text-tinta">{n}</strong> {DESCRIPCION_NIVEL[n].nombre}</span>
        </li>
      ))}
    </ul>
  );
}

export function BarrasNiveles({ titulo, subtitulo, filas }: { titulo: string; subtitulo?: string; filas: FilaNiveles[] }) {
  const [foco, setFoco] = useState<{ fila: number; nivel: NivelLogro } | null>(null);
  const pct = (f: FilaNiveles, n: NivelLogro) => (f.total ? Math.round((f.conteo[n] / f.total) * 100) : 0);

  return (
    <MarcoGrafico titulo={titulo} subtitulo={subtitulo} leyenda={<LeyendaNiveles />}
      tabla={
        <table className={claseTabla}>
          <thead><tr><th>Área</th>{NIVELES.map((n) => <th key={n} className="text-right">{n}</th>)}<th className="text-right">Notas</th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.etiqueta}><td className="font-semibold">{f.etiqueta}</td>
                {NIVELES.map((n) => <td key={n} className="text-right tabular-nums">{f.conteo[n]} <span className="text-tinta-suave">({pct(f, n)}%)</span></td>)}
                <td className="text-right tabular-nums">{f.total}</td></tr>
            ))}
          </tbody>
        </table>
      }>
      <div className="space-y-3" onMouseLeave={() => setFoco(null)}>
        {filas.map((f, i) => {
          const visibles = NIVELES.filter((n) => f.conteo[n] > 0);
          return (
            <div key={f.etiqueta}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-semibold">{f.etiqueta}</span>
                <span className="tabular-nums text-tinta-suave">{f.total} notas</span>
              </div>
              <div className="relative">
                {/* gap-[2px] deja el respiro de 2 px entre segmentos */}
                <div className="flex h-7 gap-[2px]">
                  {visibles.map((n, k) => {
                    const p = pct(f, n);
                    const activo = foco?.fila === i && foco.nivel === n;
                    return (
                      <button key={n} type="button" style={{ width: `${(f.conteo[n] / f.total) * 100}%`, background: NIVEL_HEX[n], color: NIVEL_TEXTO[n] }}
                        aria-label={`${f.etiqueta}, ${n} ${DESCRIPCION_NIVEL[n].nombre}: ${f.conteo[n]} (${p}%)`}
                        onMouseEnter={() => setFoco({ fila: i, nivel: n })} onFocus={() => setFoco({ fila: i, nivel: n })} onBlur={() => setFoco(null)}
                        onClick={() => setFoco(activo ? null : { fila: i, nivel: n })}
                        className={cx("flex min-w-[3px] items-center justify-center text-[0.7rem] font-bold tabular-nums transition-[filter] focus:outline-none",
                          k === 0 && "rounded-l-[4px]", k === visibles.length - 1 && "rounded-r-[4px]",
                          foco && !activo && "brightness-[1.15] saturate-[.6]")}>
                        {p >= 12 && `${p}%`}
                      </button>
                    );
                  })}
                </div>
                {foco?.fila === i && (
                  <div role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-xl bg-tinta px-3 py-1.5 text-xs text-white shadow-lg">
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] align-middle" style={{ background: NIVEL_HEX[foco.nivel] }} />
                    {foco.nivel} {DESCRIPCION_NIVEL[foco.nivel].nombre}: <strong>{f.conteo[foco.nivel]}</strong> ({pct(f, foco.nivel)}%)
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </MarcoGrafico>
  );
}

// ------------------------------------------------------------------ línea semanal

export interface PuntoLinea { etiqueta: string; detalle: string; valor: number | null }

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

export function LineaPorcentaje({ titulo, subtitulo, puntos, umbral, nombreValor }: {
  titulo: string; subtitulo?: string; puntos: PuntoLinea[]; umbral?: { valor: number; etiqueta: string }; nombreValor: string;
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [foco, setFoco] = useState<number | null>(null);
  const alto = 200;
  const m = { izq: 34, der: 12, arr: 14, aba: 26 };
  const valores = puntos.map((p) => p.valor).filter((v): v is number => v !== null);
  // Línea (no barras): el eje puede no empezar en cero para que se vean las variaciones.
  const minimo = Math.max(0, Math.floor((Math.min(...valores, umbral?.valor ?? 100) - 10) / 10) * 10);
  const x = (i: number) => m.izq + (puntos.length === 1 ? 0 : (i / (puntos.length - 1)) * (ancho - m.izq - m.der));
  const y = (v: number) => m.arr + (1 - (v - minimo) / (100 - minimo)) * (alto - m.arr - m.aba);
  const ticks = [minimo, Math.round((minimo + 100) / 2), 100];

  // Los huecos (semanas sin registros) cortan la línea en tramos.
  const tramos: string[] = [];
  let actual = "";
  puntos.forEach((p, i) => {
    if (p.valor === null) { if (actual) tramos.push(actual); actual = ""; return; }
    actual += `${actual ? "L" : "M"}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`;
  });
  if (actual) tramos.push(actual);

  const mover = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    let mejor = 0;
    puntos.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(mejor) - px)) mejor = i; });
    setFoco(mejor);
  };
  const p = foco !== null ? puntos[foco] : null;

  return (
    <MarcoGrafico titulo={titulo} subtitulo={subtitulo}
      tabla={
        <table className={claseTabla}>
          <thead><tr><th>Semana</th><th className="text-right">{nombreValor}</th><th>Detalle</th></tr></thead>
          <tbody>{puntos.map((q) => <tr key={q.etiqueta}><td>{q.etiqueta}</td><td className="text-right tabular-nums">{q.valor === null ? "-" : `${q.valor}%`}</td><td className="text-tinta-suave">{q.detalle}</td></tr>)}</tbody>
        </table>
      }>
      <div ref={ref} className="relative">
        {valores.length === 0 ? <p className="py-10 text-center text-sm text-tinta-suave">Aún no hay registros en estas semanas.</p> : (
          <svg width={ancho} height={alto} role="img" aria-label={`${titulo}: ${puntos.map((q) => `${q.etiqueta} ${q.valor ?? "sin datos"}`).join(", ")}`}
            onMouseMove={(e) => mover(e.clientX, e.currentTarget.getBoundingClientRect())}
            onTouchStart={(e) => mover(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => setFoco(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.izq} x2={ancho - m.der} y1={y(t)} y2={y(t)} stroke="rgba(11,46,51,.10)" strokeWidth={1} />
                <text x={m.izq - 6} y={y(t) + 4} textAnchor="end" className="fill-[#3f5f63] text-[10px] tabular-nums">{t}%</text>
              </g>
            ))}
            {umbral && (
              <g>
                <line x1={m.izq} x2={ancho - m.der} y1={y(umbral.valor)} y2={y(umbral.valor)} stroke="#3f5f63" strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
                <text x={ancho - m.der} y={y(umbral.valor) - 5} textAnchor="end" className="fill-[#3f5f63] text-[10px]">{umbral.etiqueta}</text>
              </g>
            )}
            {puntos.map((q, i) => (i % Math.ceil(puntos.length / 6) === 0 || i === puntos.length - 1) && (
              <text key={q.etiqueta} x={x(i)} y={alto - 6} textAnchor="middle" className="fill-[#3f5f63] text-[10px]">{q.etiqueta}</text>
            ))}
            {foco !== null && <line x1={x(foco)} x2={x(foco)} y1={m.arr} y2={alto - m.aba} stroke="rgba(11,46,51,.35)" strokeWidth={1} />}
            {tramos.map((d) => <path key={d} d={d} fill="none" stroke={MARCA} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
            {puntos.map((q, i) => q.valor !== null && (
              <circle key={q.etiqueta} cx={x(i)} cy={y(q.valor)} r={foco === i ? 6 : 4} fill={MARCA} stroke="#fcfcfb" strokeWidth={2} />
            ))}
          </svg>
        )}
        {p && foco !== null && (
          <div role="tooltip" className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-xl bg-tinta px-3 py-1.5 text-xs text-white shadow-lg"
            style={{ left: Math.min(Math.max(x(foco), 70), ancho - 70) }}>
            <strong>{p.etiqueta}</strong>: {p.valor === null ? "sin registros" : `${p.valor}%`}
            <span className="block text-white/75">{p.detalle}</span>
          </div>
        )}
      </div>
    </MarcoGrafico>
  );
}

// ------------------------------------------------------------------ barras simples

export function BarrasSimples({ titulo, subtitulo, items, sufijo = "", maximo }: {
  titulo: string; subtitulo?: string; items: { etiqueta: string; valor: number; detalle?: string }[]; sufijo?: string; maximo?: number;
}) {
  const max = maximo ?? Math.max(1, ...items.map((i) => i.valor));
  const [foco, setFoco] = useState<number | null>(null);
  return (
    <MarcoGrafico titulo={titulo} subtitulo={subtitulo}
      tabla={
        <table className={claseTabla}>
          <tbody>{items.map((i) => <tr key={i.etiqueta}><td>{i.etiqueta}</td><td className="text-right tabular-nums">{i.valor}{sufijo}</td><td className="text-tinta-suave">{i.detalle}</td></tr>)}</tbody>
        </table>
      }>
      <ul className="space-y-2.5" onMouseLeave={() => setFoco(null)}>
        {items.map((i, k) => (
          <li key={i.etiqueta} onMouseEnter={() => setFoco(k)} title={i.detalle}>
            <div className="mb-1 flex justify-between gap-2 text-xs">
              <span className={cx("truncate", foco === k ? "font-bold" : "font-semibold")}>{i.etiqueta}</span>
              <span className="shrink-0 tabular-nums text-tinta">{i.valor}{sufijo}{i.detalle && foco === k && <span className="ml-1 text-tinta-suave">· {i.detalle}</span>}</span>
            </div>
            <div className="h-2.5 rounded-[4px] bg-white/55">
              <div className="h-full rounded-[4px] transition-all" style={{ width: `${Math.max(i.valor > 0 ? 2 : 0, (i.valor / max) * 100)}%`, background: MARCA }} />
            </div>
          </li>
        ))}
      </ul>
    </MarcoGrafico>
  );
}
