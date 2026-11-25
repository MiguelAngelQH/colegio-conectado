import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown, Search, type LucideIcon } from "lucide-react";
import { Gema, cx } from "./componentes";

export function Campo({ etiqueta, ayuda, error, children, className }: {
  etiqueta: string; ayuda?: string; error?: string | null; children: ReactNode; className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-sm font-semibold">{etiqueta}</span>
      {children}
      {error ? <span className="mt-1 block text-xs font-semibold text-red-700">{error}</span>
        : ayuda && <span className="mt-1 block text-xs text-tinta-suave">{ayuda}</span>}
    </label>
  );
}

export function Entrada(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx("campo", props.className)} />;
}

export function Selector({ children, className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx("relative block", className)}>
      <select {...props} className="campo appearance-none pr-10">{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-suave" aria-hidden />
    </span>
  );
}

export function Buscador({ valor, onCambio, placeholder = "Buscar..." }: { valor: string; onCambio(v: string): void; placeholder?: string }) {
  return (
    <span className="relative block">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-suave" aria-hidden />
      <input type="search" value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="campo !rounded-full pl-10" />
    </span>
  );
}

/** Control segmentado (2 a 4 opciones). */
export function Segmentado<T extends string>({ opciones, valor, onCambio, etiqueta }: {
  opciones: { valor: NoInfer<T>; texto: string }[]; valor: T; onCambio(v: NoInfer<T>): void; etiqueta: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex rounded-full bg-sup/45 p-1 ring-1 ring-sup/80 shadow-[inset_0_1px_3px_rgba(11,46,51,.12)]">
      {opciones.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={valor === o.valor} onClick={() => onCambio(o.valor)}
          className={cx("min-h-10 rounded-full px-4 text-sm font-semibold transition", valor === o.valor ? "vidrio-laguna" : "text-tinta-suave hover:text-tinta")}>
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function Casilla({ marcada, onCambio, children }: { marcada: boolean; onCambio(v: boolean): void; children: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl bg-sup/40 px-3 py-2 ring-1 ring-sup/80">
      <input type="checkbox" checked={marcada} onChange={(e) => onCambio(e.target.checked)} className="h-5 w-5 accent-blue-600" />
      <span className="text-sm font-semibold">{children}</span>
    </label>
  );
}

/** Estado vacío con llamado a la acción. */
export function Vacio({ icono, tono = "tono-pizarra", titulo, children, accion }: {
  icono: LucideIcon; tono?: string; titulo: string; children?: ReactNode; accion?: ReactNode;
}) {
  return (
    <div className="vidrio flex flex-col items-center gap-3 px-6 py-10 text-center">
      <Gema icono={icono} tono={tono} tam="lg" />
      <h3 className="titulo-display text-xl font-bold">{titulo}</h3>
      {children && <p className="max-w-md text-sm text-tinta-suave">{children}</p>}
      {accion}
    </div>
  );
}

/** Fila de lista dentro de una tarjeta de vidrio. */
export function FilaLista({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  const base = "flex w-full items-center gap-3 px-4 py-3 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={cx(base, "transition hover:bg-sup/40 active:bg-sup/60", className)}>{children}</button>
  ) : (
    <div className={cx(base, className)}>{children}</div>
  );
}
