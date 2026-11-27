// Gráficos de los paneles, sobre Recharts. Reglas (skill dataviz): un solo eje de valores, marcas finas
// con extremos redondeados de 4 px y respiro de 2 px entre rellenos, cuadrícula tenue, leyenda,
// etiquetas directas selectivas, tooltip en cada gráfico y vista de tabla.
// Los niveles AD/A/B/C usan un par divergente azul / rojo-anaranjado validado para daltonismo
// (protan ΔE 16,9); el contraste bajo de A y B se compensa con etiquetas y la tabla.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type TooltipProps,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus, Table2, type LucideIcon } from "lucide-react";
import type { NivelLogro } from "@/db/tipos";
import { DESCRIPCION_NIVEL, NIVELES } from "@/dominio/notas";
import { cx } from "./componentes";
import { useTemaOscuro } from "./tema";

import { NIVEL_HEX, NIVEL_TEXTO } from "./colores-niveles";

export { NIVEL_HEX, NIVEL_TEXTO };

// Colores neutros según el tema. Cada gráfico llama a usarPaleta() al renderizar para tomar los del tema actual.
let TINTA = "#0f1e36";
let SUAVE = "#5b7478";
let REJILLA = "rgba(15, 30, 54, 0.08)";
let SUPERFICIE = "#ffffff";
let CURSOR = "rgba(15, 30, 54, 0.04)";
/** Serie única (asistencia, avance, conteos). */
export const MARCA = "#2563eb";
/** Estado: por debajo de la meta (siempre acompañado de texto). */
const BAJO_META = "#c2410c";
/** Rampa secuencial de un solo tono para la inasistencia diaria (claro = poca, oscuro = mucha). */
const RAMPA = ["#fdf1ea", "#fbd3bd", "#f5a982", "#e0703f", "#a63a17"];

const eje = { fontSize: 11, fill: SUAVE };

function usarPaleta() {
  const oscuro = useTemaOscuro();
  TINTA = oscuro ? "#e6ecf5" : "#0f1e36";
  SUAVE = oscuro ? "#a3b1c6" : "#5b7478";
  REJILLA = oscuro ? "rgba(230, 236, 245, 0.1)" : "rgba(15, 30, 54, 0.08)";
  SUPERFICIE = oscuro ? "#1c2740" : "#ffffff";
  CURSOR = oscuro ? "rgba(230, 236, 245, 0.06)" : "rgba(15, 30, 54, 0.04)";
  eje.fill = SUAVE;
}
const idSeguro = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "");

// ------------------------------------------------------------------ marco común

function BotonTabla({ activa, onClick }: { activa: boolean; onClick(): void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa}
      className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
        activa ? "bg-noche text-white ring-noche" : "text-tinta-suave ring-slate-200 hover:bg-slate-50")}>
      <Table2 className="h-3.5 w-3.5" aria-hidden /> {activa ? "Ver gráfico" : "Ver tabla"}
    </button>
  );
}

export function MarcoGrafico({ titulo, subtitulo, children, tabla, leyenda, acciones, className }: {
  titulo: string; subtitulo?: string; children: ReactNode; tabla: ReactNode; leyenda?: ReactNode; acciones?: ReactNode; className?: string;
}) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <figure className={cx("vidrio-solido flex min-w-0 flex-col gap-4 p-4 sm:p-5", className)}>
      <figcaption className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-[0.95rem] font-bold leading-tight text-tinta">{titulo}</span>
          {subtitulo && <span className="mt-0.5 block text-xs text-tinta-suave">{subtitulo}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {!verTabla && acciones}
          <BotonTabla activa={verTabla} onClick={() => setVerTabla(!verTabla)} />
        </span>
      </figcaption>
      {!verTabla && leyenda}
      {verTabla ? <div className="max-h-80 overflow-auto">{tabla}</div> : children}
    </figure>
  );
}

export const claseTabla = "w-full text-left text-sm [&_td]:px-2 [&_td]:py-1.5 [&_th]:sticky [&_th]:top-0 [&_th]:bg-sup [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-xs [&_th]:font-semibold [&_th]:text-tinta-suave [&_tbody_tr]:border-t [&_tbody_tr]:border-slate-100";

/** Caja del tooltip: oscura, con muestra de color por fila; el texto nunca usa el color de la serie. */
function Caja({ titulo, filas, pie }: { titulo: ReactNode; filas: { color?: string; etiqueta: ReactNode; valor: ReactNode }[]; pie?: ReactNode }) {
  return (
    <div className="min-w-40 rounded-xl bg-noche px-3 py-2 text-xs text-white shadow-xl">
      <p className="mb-1 font-semibold">{titulo}</p>
      <ul className="space-y-0.5">
        {filas.map((f, i) => (
          <li key={i} className="flex items-center gap-2">
            {f.color && <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: f.color }} aria-hidden />}
            <span className="text-white/80">{f.etiqueta}</span>
            <span className="ml-auto pl-3 font-semibold tabular-nums">{f.valor}</span>
          </li>
        ))}
      </ul>
      {pie && <p className="mt-1.5 border-t border-sup/15 pt-1.5 text-white/70">{pie}</p>}
    </div>
  );
}

export function Leyenda({ items }: { items: { color: string; texto: ReactNode; trazo?: "linea" | "discontinua" }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta-suave" aria-label="Leyenda">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-1.5">
          {it.trazo ? (
            <svg width="16" height="8" aria-hidden><line x1="0" x2="16" y1="4" y2="4" stroke={it.color} strokeWidth={2} strokeDasharray={it.trazo === "discontinua" ? "3 3" : undefined} /></svg>
          ) : (
            <span className="h-3 w-3 rounded-[4px]" style={{ background: it.color }} aria-hidden />
          )}
          <span>{it.texto}</span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ KPI con variación y mini gráfico

export function Sparkline({ valores, color = MARCA, alto = 36 }: { valores: (number | null)[]; color?: string; alto?: number }) {
  usarPaleta();
  const gid = idSeguro(useId());
  const datos = valores.map((v, i) => ({ i, v }));
  if (valores.filter((v) => v !== null).length < 2) return <div style={{ height: alto }} aria-hidden />;
  return (
    <div style={{ height: alto }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={datos} margin={{ top: 3, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin - 2", "dataMax + 2"]} />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gid})`} connectNulls dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface Variacion {
  /** Diferencia respecto al periodo anterior, en las unidades del indicador. */
  delta: number;
  unidad: string;
  /** Si subir es bueno (asistencia) o malo (incidencias). */
  mejorSiSube: boolean;
  referencia: string;
}

function ChipVariacion({ v }: { v: Variacion }) {
  const igual = v.delta === 0;
  const bueno = igual ? null : (v.delta > 0) === v.mejorSiSube;
  const Icono = igual ? Minus : v.delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-[0.72rem]">
      <span className={cx("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums",
        bueno === null ? "bg-slate-100 text-slate-700" : bueno ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>
        <Icono className="h-3.5 w-3.5" aria-hidden />
        {igual ? "Sin cambio" : `${v.delta > 0 ? "+" : "−"}${Math.abs(v.delta)}${v.unidad}`}
      </span>
      <span className="text-tinta-suave">{v.referencia}</span>
    </span>
  );
}

export function TarjetaKpi({ icono: Icono, titulo, valor, unidad, variacion, estado, serie, colorSerie, enlace, pie, className }: {
  icono: LucideIcon; titulo: string; valor: string | number; unidad?: string; variacion?: Variacion | null;
  estado?: { texto: string; tipo: "alerta" | "ok" } | null; serie?: (number | null)[]; colorSerie?: string; enlace?: string; pie?: ReactNode; className?: string;
}) {
  usarPaleta();
  const contenido = (
    <>
      <p className="flex min-h-[2rem] min-w-0 items-start gap-2 text-xs font-semibold leading-tight text-tinta-suave">
        <Icono className="mt-px h-4 w-4 shrink-0" aria-hidden /> <span>{titulo}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="flex items-baseline gap-1">
          <span className="titulo-display text-[2rem] font-bold leading-none tabular-nums text-tinta">{valor}</span>
          {unidad && <span className="text-sm font-semibold text-tinta-suave">{unidad}</span>}
        </p>
        {estado && (
          <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-bold",
            estado.tipo === "alerta" ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200")}>
            {estado.texto}
          </span>
        )}
      </div>
      <div className="mt-2 min-h-[1.25rem]">{variacion ? <ChipVariacion v={variacion} /> : pie && <span className="text-[0.72rem] text-tinta-suave">{pie}</span>}</div>
      {serie && <div className="-mx-1 mt-2"><Sparkline valores={serie} color={colorSerie} /></div>}
    </>
  );
  const clase = cx("vidrio-solido block p-4 transition", className);
  return enlace ? <Link to={enlace} className={cx(clase, "hover:-translate-y-0.5 hover:shadow-lg")}>{contenido}</Link> : <div className={clase}>{contenido}</div>;
}

// ------------------------------------------------------------------ asistencia en el tiempo

export interface PuntoAsistencia { etiqueta: string; detalle: string; porcentaje: number | null; P: number; T: number; F: number; J: number }

export function AreaAsistencia({ titulo, subtitulo, puntos, meta, acciones , className }: { className?: string; 
  titulo: string; subtitulo?: string; puntos: PuntoAsistencia[]; meta: number; acciones?: ReactNode;
}) {
  usarPaleta();
  const gid = idSeguro(useId());
  const valores = puntos.map((p) => p.porcentaje).filter((v): v is number => v !== null);
  // Área (no barras): el eje puede no empezar en cero para que se vean las variaciones.
  const minimo = Math.max(0, Math.floor((Math.min(meta, ...valores) - 6) / 5) * 5);
  const paso = Math.max(5, Math.ceil((100 - minimo) / 4 / 5) * 5);
  const marcasY = Array.from({ length: Math.floor((100 - minimo) / paso) + 1 }, (_, i) => 100 - i * paso).reverse();
  const Tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as PuntoAsistencia;
    return (
      <Caja titulo={p.detalle} pie={p.porcentaje === null ? "Sin registros" : p.porcentaje < meta ? `Bajo la meta de ${meta}%` : `En la meta de ${meta}%`}
        filas={[
          { color: MARCA, etiqueta: "Asistencia", valor: p.porcentaje === null ? "-" : `${p.porcentaje}%` },
          { etiqueta: "Presentes", valor: p.P }, { etiqueta: "Tardanzas", valor: p.T },
          { etiqueta: "Faltas", valor: p.F }, { etiqueta: "Justificadas", valor: p.J },
        ]} />
    );
  };
  return (
    <MarcoGrafico className={className} titulo={titulo} subtitulo={subtitulo} acciones={acciones}
      leyenda={<Leyenda items={[{ color: MARCA, texto: "Asistencia semanal", trazo: "linea" }, { color: SUAVE, texto: `Meta ${meta}%`, trazo: "discontinua" }]} />}
      tabla={
        <table className={claseTabla}>
          <thead><tr><th>Semana</th><th className="text-right">Asistencia</th><th className="text-right">P</th><th className="text-right">T</th><th className="text-right">F</th><th className="text-right">J</th></tr></thead>
          <tbody>{puntos.map((p) => (
            <tr key={p.etiqueta}><td>{p.detalle}</td><td className="text-right font-semibold tabular-nums">{p.porcentaje === null ? "-" : `${p.porcentaje}%`}</td>
              {(["P", "T", "F", "J"] as const).map((k) => <td key={k} className="text-right tabular-nums text-tinta-suave">{p[k]}</td>)}</tr>
          ))}</tbody>
        </table>
      }>
      {valores.length === 0 ? <p className="py-16 text-center text-sm text-tinta-suave">Aún no hay registros de asistencia en estas semanas.</p> : (
        <div className="h-64 sm:h-72" role="img" aria-label={`${titulo}: ${puntos.map((p) => `${p.detalle} ${p.porcentaje ?? "sin datos"}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={puntos} margin={{ top: 12, right: 8, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={MARCA} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={MARCA} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={REJILLA} />
              <XAxis dataKey="etiqueta" tick={eje} tickLine={false} axisLine={{ stroke: REJILLA }} minTickGap={18} tickMargin={8} />
              <YAxis domain={[minimo, 100]} ticks={marcasY} tick={eje} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} width={44} />
              <ReferenceLine y={meta} stroke={SUAVE} strokeDasharray="4 4" strokeOpacity={0.8}
                label={{ value: `Meta ${meta}%`, position: "insideTopRight", fill: SUAVE, fontSize: 11 }} />
              <Tooltip content={<Tip />} cursor={{ stroke: TINTA, strokeOpacity: 0.25, strokeWidth: 1 }} />
              <Area type="monotone" dataKey="porcentaje" stroke={MARCA} strokeWidth={2} fill={`url(#${gid})`}
                dot={{ r: 3, fill: MARCA, stroke: SUPERFICIE, strokeWidth: 2 }} activeDot={{ r: 6, fill: MARCA, stroke: SUPERFICIE, strokeWidth: 2 }}
                connectNulls={false} animationDuration={500} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </MarcoGrafico>
  );
}

// ------------------------------------------------------------------ logros por área (barras divergentes)

export interface FilaNiveles { etiqueta: string; conteo: Record<NivelLogro, number>; total: number }

const pct = (f: FilaNiveles, n: NivelLogro) => (f.total ? Math.round((f.conteo[n] / f.total) * 100) : 0);

/** Leyenda en el mismo orden en que se leen las barras: de izquierda (inicio) a derecha (destacado). */
export function LeyendaNiveles() {
  return <Leyenda items={(["C", "B", "A", "AD"] as const).map((n) => ({ color: NIVEL_HEX[n], texto: <><strong className="text-tinta">{n}</strong> {DESCRIPCION_NIVEL[n].nombre}</> }))} />;
}

function TablaNiveles({ filas, primera }: { filas: FilaNiveles[]; primera: string }) {
  return (
    <table className={claseTabla}>
      <thead><tr><th>{primera}</th>{NIVELES.map((n) => <th key={n} className="text-right">{n}</th>)}<th className="text-right">Notas</th></tr></thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.etiqueta}><td className="font-semibold">{f.etiqueta}</td>
            {NIVELES.map((n) => <td key={n} className="text-right tabular-nums">{f.conteo[n]} <span className="text-tinta-suave">({pct(f, n)}%)</span></td>)}
            <td className="text-right tabular-nums">{f.total}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export function BarrasDivergentesNiveles({ titulo, subtitulo, filas , className }: { className?: string;  titulo: string; subtitulo?: string; filas: FilaNiveles[] }) {
  usarPaleta();
  // Logrado (A, AD) hacia la derecha; en proceso o inicio (B, C) hacia la izquierda.
  const datos = filas.map((f) => ({ etiqueta: f.etiqueta, A: pct(f, "A"), AD: pct(f, "AD"), B: -pct(f, "B"), C: -pct(f, "C"), fila: f }));
  const alto = Math.max(140, datos.length * 40 + 40);
  const anchoEtiquetas = typeof window !== "undefined" && window.innerWidth < 640 ? 104 : 150;
  const Tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const f = (payload[0].payload as { fila: FilaNiveles }).fila;
    return (
      <Caja titulo={f.etiqueta} pie={`${f.total} calificaciones · logrado ${pct(f, "AD") + pct(f, "A")}%`}
        filas={(["AD", "A", "B", "C"] as const).map((n) => ({ color: NIVEL_HEX[n], etiqueta: `${n} ${DESCRIPCION_NIVEL[n].nombre}`, valor: `${f.conteo[n]} (${pct(f, n)}%)` }))} />
    );
  };
  const etiqueta = (n: NivelLogro) => (props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: number | string }) => {
    const v = Math.abs(Number(props.value ?? 0));
    const w = Math.abs(Number(props.width ?? 0));
    if (v < 9 || w < 26) return null;
    const x = Number(props.x) + Number(props.width) / 2;
    const y = Number(props.y) + Number(props.height) / 2;
    return <text x={x} y={y} dy={4} textAnchor="middle" fontSize={11} fontWeight={700} fill={NIVEL_TEXTO[n]} className="tabular-nums">{v}%</text>;
  };
  return (
    <MarcoGrafico className={className} titulo={titulo} subtitulo={subtitulo} leyenda={<LeyendaNiveles />} tabla={<TablaNiveles filas={filas} primera="Área" />}>
      <div>
        <div className="mb-1 flex justify-between text-[0.7rem] font-semibold text-tinta-suave" style={{ paddingLeft: anchoEtiquetas }} aria-hidden>
          <span>En proceso o inicio</span><span>Logrado</span>
        </div>
        <div style={{ height: alto }} role="img" aria-label={`${titulo}: ${filas.map((f) => `${f.etiqueta} logrado ${pct(f, "AD") + pct(f, "A")}%`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datos} layout="vertical" stackOffset="sign" barCategoryGap={10} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke={REJILLA} />
              <XAxis type="number" domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} tick={eje} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${Math.abs(v)}%`} />
              <YAxis type="category" dataKey="etiqueta" width={anchoEtiquetas} tick={{ ...eje, fill: TINTA, fontWeight: 600 }} tickLine={false} axisLine={false} />
              <Tooltip content={<Tip />} cursor={{ fill: CURSOR }} />
              <ReferenceLine x={0} stroke={TINTA} strokeOpacity={0.35} />
              {(["A", "AD", "B", "C"] as const).map((n) => (
                <Bar key={n} dataKey={n} stackId="n" fill={NIVEL_HEX[n]} stroke={SUPERFICIE} strokeWidth={1}
                  radius={n === "AD" ? [0, 4, 4, 0] : n === "C" ? [4, 0, 0, 4] : 0} animationDuration={500}>
                  <LabelList dataKey={n} content={etiqueta(n)} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </MarcoGrafico>
  );
}

// ------------------------------------------------------------------ distribución total (dona)

export function DonaNiveles({ titulo, subtitulo, conteo , className }: { className?: string;  titulo: string; subtitulo?: string; conteo: Record<NivelLogro, number> }) {
  usarPaleta();
  const total = NIVELES.reduce((s, n) => s + conteo[n], 0);
  const datos = NIVELES.map((n) => ({ nivel: n, valor: conteo[n] })).filter((d) => d.valor > 0);
  const p = (n: NivelLogro) => (total ? Math.round((conteo[n] / total) * 100) : 0);
  const fila: FilaNiveles = { etiqueta: "Total", conteo, total };
  const Tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const n = (payload[0].payload as { nivel: NivelLogro }).nivel;
    return <Caja titulo={`${n} ${DESCRIPCION_NIVEL[n].nombre}`} filas={[{ color: NIVEL_HEX[n], etiqueta: "Calificaciones", valor: `${conteo[n]} (${p(n)}%)` }]} />;
  };
  return (
    <MarcoGrafico className={className} titulo={titulo} subtitulo={subtitulo} tabla={<TablaNiveles filas={[fila]} primera="" />}>
      {total === 0 ? <p className="py-16 text-center text-sm text-tinta-suave">Sin calificaciones en este periodo.</p> : (
        <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col">
          <div className="relative h-48 w-48 shrink-0" role="img" aria-label={`${titulo}: ${NIVELES.map((n) => `${n} ${p(n)}%`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<Tip />} />
                <Pie data={datos} dataKey="valor" nameKey="nivel" innerRadius="68%" outerRadius="100%" paddingAngle={1.5} cornerRadius={4}
                  stroke={SUPERFICIE} strokeWidth={2} startAngle={90} endAngle={-270} animationDuration={500}>
                  {datos.map((d) => <Cell key={d.nivel} fill={NIVEL_HEX[d.nivel]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="titulo-display text-3xl font-bold tabular-nums text-tinta">{total.toLocaleString("es-PE")}</span>
              <span className="text-[0.7rem] text-tinta-suave">calificaciones</span>
            </div>
          </div>
          <ul className="w-full min-w-0 space-y-2">
            {NIVELES.map((n) => (
              <li key={n} className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: NIVEL_HEX[n] }} aria-hidden />
                <span className="font-bold text-tinta">{n}</span>
                <span className="truncate text-tinta-suave">{DESCRIPCION_NIVEL[n].nombre}</span>
                <span className="ml-auto font-semibold tabular-nums text-tinta">{p(n)}%</span>
                <span className="w-10 text-right text-xs tabular-nums text-tinta-suave">{conteo[n]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </MarcoGrafico>
  );
}

// ------------------------------------------------------------------ ranking con meta (barras horizontales)

export interface ItemRanking { etiqueta: string; valor: number | null; detalle?: string }

export function BarrasRanking({ titulo, subtitulo, items, meta, sufijo = "", maximo, nombreValor , className }: { className?: string; 
  titulo: string; subtitulo?: string; items: ItemRanking[]; meta?: { valor: number; etiqueta: string }; sufijo?: string; maximo?: number; nombreValor: string;
}) {
  usarPaleta();
  const conValor = items.filter((i): i is ItemRanking & { valor: number } => i.valor !== null);
  const max = maximo ?? Math.max(1, ...conValor.map((i) => i.valor));
  const bajo = (v: number) => !!meta && v < meta.valor;
  const alto = Math.max(120, conValor.length * 36 + 30);
  const Tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const it = payload[0].payload as ItemRanking & { valor: number };
    return <Caja titulo={it.etiqueta} pie={meta ? (bajo(it.valor) ? `Bajo la ${meta.etiqueta.toLowerCase()}` : `Cumple la ${meta.etiqueta.toLowerCase()}`) : undefined}
      filas={[{ color: bajo(it.valor) ? BAJO_META : MARCA, etiqueta: nombreValor, valor: `${it.valor}${sufijo}` }, ...(it.detalle ? [{ etiqueta: "Detalle", valor: it.detalle }] : [])]} />;
  };
  return (
    <MarcoGrafico className={className} titulo={titulo} subtitulo={subtitulo}
      leyenda={meta ? <Leyenda items={[{ color: MARCA, texto: "Cumple la meta" }, { color: BAJO_META, texto: "Bajo la meta" }, { color: SUAVE, texto: meta.etiqueta, trazo: "discontinua" }]} /> : undefined}
      tabla={
        <table className={claseTabla}>
          <thead><tr><th></th><th className="text-right">{nombreValor}</th><th>Detalle</th></tr></thead>
          <tbody>{items.map((i) => (
            <tr key={i.etiqueta}><td className="font-semibold">{i.etiqueta}</td>
              <td className="text-right tabular-nums">{i.valor === null ? "-" : `${i.valor}${sufijo}`}{i.valor !== null && bajo(i.valor) && <span className="ml-1 text-xs font-semibold text-red-800">bajo la meta</span>}</td>
              <td className="text-tinta-suave">{i.detalle}</td></tr>
          ))}</tbody>
        </table>
      }>
      {conValor.length === 0 ? <p className="py-12 text-center text-sm text-tinta-suave">Sin datos.</p> : (
        <div style={{ height: alto }} role="img" aria-label={`${titulo}: ${conValor.map((i) => `${i.etiqueta} ${i.valor}${sufijo}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={conValor} layout="vertical" barCategoryGap={12} margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke={REJILLA} />
              <XAxis type="number" domain={[0, max]} tick={eje} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}${sufijo}`} tickCount={5} />
              <YAxis type="category" dataKey="etiqueta" width={128} tick={{ ...eje, fill: TINTA, fontWeight: 600 }} tickLine={false} axisLine={false} />
              <Tooltip content={<Tip />} cursor={{ fill: CURSOR }} />
              {meta && <ReferenceLine x={meta.valor} stroke={SUAVE} strokeDasharray="4 4" />}
              <Bar dataKey="valor" radius={[0, 4, 4, 0]} maxBarSize={18} animationDuration={500}>
                {conValor.map((i) => <Cell key={i.etiqueta} fill={bajo(i.valor) ? BAJO_META : MARCA} />)}
                <LabelList dataKey="valor" position="right" formatter={(v: number) => `${v}${sufijo}`} style={{ fontSize: 11, fontWeight: 700, fill: TINTA }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </MarcoGrafico>
  );
}

// ------------------------------------------------------------------ columnas por mes

export interface PuntoColumna { etiqueta: string; detalle: string; valor: number; desglose: Record<string, number> }

export function ColumnasConteo({ titulo, subtitulo, puntos, nombreValor , className }: { className?: string;  titulo: string; subtitulo?: string; puntos: PuntoColumna[]; nombreValor: string }) {
  usarPaleta();
  const Tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as PuntoColumna;
    const partes = Object.entries(p.desglose).sort((a, b) => b[1] - a[1]);
    return <Caja titulo={p.detalle} filas={[{ color: MARCA, etiqueta: nombreValor, valor: p.valor }, ...partes.map(([k, v]) => ({ etiqueta: k, valor: v }))]} />;
  };
  return (
    <MarcoGrafico className={className} titulo={titulo} subtitulo={subtitulo}
      tabla={
        <table className={claseTabla}>
          <thead><tr><th>Mes</th><th className="text-right">{nombreValor}</th><th>Tipos</th></tr></thead>
          <tbody>{puntos.map((p) => (
            <tr key={p.etiqueta}><td>{p.detalle}</td><td className="text-right tabular-nums">{p.valor}</td>
              <td className="text-tinta-suave">{Object.entries(p.desglose).map(([k, v]) => `${k} (${v})`).join(", ") || "-"}</td></tr>
          ))}</tbody>
        </table>
      }>
      <div className="h-56" role="img" aria-label={`${titulo}: ${puntos.map((p) => `${p.detalle} ${p.valor}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={puntos} margin={{ top: 18, right: 4, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke={REJILLA} />
            <XAxis dataKey="etiqueta" tick={eje} tickLine={false} axisLine={{ stroke: REJILLA }} tickMargin={8} />
            <YAxis allowDecimals={false} tick={eje} tickLine={false} axisLine={false} width={40} />
            <Tooltip content={<Tip />} cursor={{ fill: CURSOR }} />
            <Bar dataKey="valor" fill={MARCA} radius={[4, 4, 0, 0]} maxBarSize={36} animationDuration={500}>
              <LabelList dataKey="valor" position="top" style={{ fontSize: 11, fontWeight: 700, fill: TINTA }} formatter={(v: number) => (v ? v : "")} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </MarcoGrafico>
  );
}

// ------------------------------------------------------------------ mapa de calor de inasistencia diaria

export interface PuntoDiaCalor { fecha: string; porcentaje: number | null; registros: number }

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

const CORTES = [5, 10, 15, 25]; // % de inasistencia que separan los 5 tonos
/** Solo la primera letra en mayúscula ("Jueves, 26 de noviembre"). */
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const RANGOS = ["Menos de 5%", "5 a 9%", "10 a 14%", "15 a 24%", "25% o más"];
/** Texto legible sobre cada tono (los dos más oscuros llevan letra blanca). */
const TEXTO_TONO = ["#7c3a1d", "#7c3a1d", "#5c2410", "#ffffff", "#ffffff"];
const indiceTono = (inasistencia: number) => (CORTES.findIndex((c) => inasistencia < c) === -1 ? 4 : CORTES.findIndex((c) => inasistencia < c));
const tono = (inasistencia: number) => RAMPA[CORTES.findIndex((c) => inasistencia < c) === -1 ? 4 : CORTES.findIndex((c) => inasistencia < c)];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const fechaLarga = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

export function MapaCalor({ titulo, subtitulo, dias, desde, hasta , className }: { className?: string;  titulo: string; subtitulo?: string; dias: PuntoDiaCalor[]; desde: string; hasta: string }) {
  usarPaleta();
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [foco, setFoco] = useState<{ d: PuntoDiaCalor | string; x: number; y: number } | null>(null);
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  // Columnas = semanas (lunes), filas = lunes a viernes.
  const lunes: string[] = [];
  const inicio = new Date(`${desde}T12:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - ((inicio.getUTCDay() + 6) % 7));
  for (let d = inicio; d.toISOString().slice(0, 10) <= hasta; d = new Date(d.getTime() + 7 * 86_400_000)) lunes.push(d.toISOString().slice(0, 10));
  const izq = 34, arr = 18, hueco = 4;
  const celda = Math.min(52, Math.floor((ancho - izq - (lunes.length - 1) * hueco) / Math.max(1, lunes.length)));
  const conNumeros = celda >= 30;
  const altoSvg = arr + 5 * celda + 4 * hueco;
  const fechaDe = (col: number, fila: number) => new Date(Date.parse(`${lunes[col]}T12:00:00Z`) + fila * 86_400_000).toISOString().slice(0, 10);
  const mes = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { month: "short" }).replace(".", "");
  const conDatos = dias.filter((d) => d.porcentaje !== null);
  const falta = (d: PuntoDiaCalor) => 100 - (d.porcentaje ?? 100);
  const promedio = conDatos.length ? Math.round(conDatos.reduce((t, d) => t + falta(d), 0) / conDatos.length) : 0;
  const peor = conDatos.reduce<PuntoDiaCalor | null>((p, d) => (!p || falta(d) > falta(p) ? d : p), null);
  const porDiaSemana = DIAS.map((nombre, i) => {
    const del = conDatos.filter((d) => (new Date(`${d.fecha}T12:00:00`).getDay() + 6) % 7 === i);
    return { nombre, prom: del.length ? del.reduce((t, d) => t + falta(d), 0) / del.length : 0, n: del.length };
  });
  const peorDiaSemana = porDiaSemana.filter((x) => x.n).sort((a, b) => b.prom - a.prom)[0];
  const NOMBRE_DIA: Record<string, string> = { Lun: "los lunes", Mar: "los martes", Mié: "los miércoles", Jue: "los jueves", Vie: "los viernes" };

  return (
    <MarcoGrafico className={className} titulo={titulo} subtitulo={subtitulo}
      leyenda={
        <div className="space-y-2">
          <p className="text-xs text-tinta-suave">
            Cada cuadro es un día de clases. El número de arriba es el día del mes y el de abajo, el porcentaje de estudiantes que faltó. Mientras más oscuro, más faltas.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-tinta-suave" aria-label="Leyenda">
            <span className="font-semibold text-tinta">Estudiantes que faltaron:</span>
            {RAMPA.map((c, i) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className="h-3.5 w-3.5 rounded-[4px] ring-1 ring-black/10" style={{ background: c }} /> {RANGOS[i]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-[4px] border border-dashed border-slate-400" /> Sin clases o sin registro</span>
          </div>
        </div>
      }
      tabla={
        <table className={claseTabla}>
          <thead><tr><th>Día</th><th className="text-right">Asistencia</th><th className="text-right">Inasistencia</th><th className="text-right">Registros</th></tr></thead>
          <tbody>{[...conDatos].reverse().map((d) => (
            <tr key={d.fecha}><td>{mayuscula(fechaLarga(d.fecha))}</td><td className="text-right tabular-nums">{d.porcentaje}%</td>
              <td className="text-right tabular-nums">{100 - (d.porcentaje ?? 0)}%</td><td className="text-right tabular-nums text-tinta-suave">{d.registros}</td></tr>
          ))}</tbody>
        </table>
      }>
      <div ref={ref} className="relative" onMouseLeave={() => setFoco(null)}>
        {conDatos.length === 0 ? <p className="py-12 text-center text-sm text-tinta-suave">Aún no hay registros diarios.</p> : (
          <svg width={ancho} height={altoSvg} role="img" aria-label={`${titulo}. Use Ver tabla para leer cada día.`}>
            {DIAS.map((d, fila) => (
              <text key={d} x={0} y={arr + fila * (celda + hueco) + celda / 2 + 4} fontSize={10} fill={SUAVE}>{d}</text>
            ))}
            {lunes.map((l, col) => {
              const x = izq + col * (celda + hueco);
              const cambioMes = col === 0 || mes(l) !== mes(lunes[col - 1]);
              return (
                <g key={l}>
                  {cambioMes && <text x={x} y={11} fontSize={10} fill={SUAVE} className="capitalize">{mes(l)}</text>}
                  {DIAS.map((_, fila) => {
                    const f = fechaDe(col, fila);
                    const d = porFecha.get(f);
                    const y = arr + fila * (celda + hueco);
                    if (f > hasta || f < desde) return null;
                    const conValor = d && d.porcentaje !== null;
                    const enFoco = !!foco && typeof foco.d !== "string" && foco.d.fecha === f;
                    const it = conValor ? indiceTono(100 - d.porcentaje!) : -1;
                    const colorTexto = conValor ? TEXTO_TONO[it] : SUAVE;
                    return (
                      <g key={f} onMouseEnter={() => setFoco({ d: d ?? f, x: x + celda / 2, y })} onClick={() => setFoco({ d: d ?? f, x: x + celda / 2, y })} style={{ cursor: "pointer" }}>
                        <rect x={x} y={y} width={celda} height={celda} rx={5}
                          fill={conValor ? RAMPA[it] : "transparent"}
                          stroke={conValor ? (enFoco ? TINTA : REJILLA) : SUAVE}
                          strokeDasharray={conValor ? undefined : "2 2"} strokeWidth={enFoco ? 2 : 1} />
                        {conNumeros && (
                          <>
                            <text x={x + 5} y={y + 12} fontSize={9.5} fill={colorTexto} opacity={0.75}>{Number(f.slice(8))}</text>
                            {conValor && (
                              <text x={x + celda / 2} y={y + celda - 8} fontSize={celda >= 40 ? 12 : 10.5} fontWeight={700} textAnchor="middle" fill={colorTexto}>
                                {100 - d.porcentaje!}%
                              </text>
                            )}
                          </>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        )}
        {conDatos.length > 0 && (
          <p className="mt-3 text-sm text-tinta">
            En promedio faltó el <b>{promedio}%</b> de los estudiantes por día.
            {peor && falta(peor) > 0 && <> El día con más faltas fue el <b>{mayuscula(fechaLarga(peor.fecha))}</b> ({falta(peor)}%).</>}
            {peorDiaSemana && peorDiaSemana.prom >= 1 && <> Suelen faltar más <b>{NOMBRE_DIA[peorDiaSemana.nombre]}</b> ({Math.round(peorDiaSemana.prom)}% en promedio).</>}
          </p>
        )}
        {foco && (
          <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full" style={{ left: Math.min(Math.max(foco.x, 90), ancho - 90), top: foco.y - 6 }}>
            {typeof foco.d === "string" ? (
              <Caja titulo={<span>{mayuscula(fechaLarga(foco.d))}</span>} filas={[{ etiqueta: "Sin clases o sin registro", valor: "" }]} />
            ) : (
              <Caja titulo={<span>{mayuscula(fechaLarga(foco.d.fecha))}</span>}
                filas={[
                  { color: tono(100 - (foco.d.porcentaje ?? 0)), etiqueta: "Faltaron", valor: `${100 - (foco.d.porcentaje ?? 0)}%` },
                  { etiqueta: "Asistieron", valor: `${foco.d.porcentaje}%` },
                  { etiqueta: "Marcas de asistencia", valor: foco.d.registros },
                ]} />
            )}
          </div>
        )}
      </div>
    </MarcoGrafico>
  );
}
