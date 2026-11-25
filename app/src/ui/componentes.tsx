import { createPortal } from "react-dom";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LoaderCircle, type LucideIcon } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** Retraso escalonado para la animación de entrada. */
export const orden = (i: number) => ({ "--i": i }) as CSSProperties;

/** Gema de color con un ícono (tono = clase tono-*). */
export function Gema({ icono: Icono, tono, tam = "md" }: { icono: LucideIcon; tono: string; tam?: "sm" | "md" | "lg" }) {
  const t = { sm: "h-9 w-9", md: "h-12 w-12", lg: "h-16 w-16" }[tam];
  const i = { sm: "h-[18px] w-[18px]", md: "h-6 w-6", lg: "h-8 w-8" }[tam];
  return (
    <span className={cx("gema shrink-0", tono, t)}>
      <Icono className={cx(i, "relative z-10")} strokeWidth={2.1} aria-hidden />
    </span>
  );
}

/** Título de pantalla: grande, tipográfico, sin franja de color. */
export function Encabezado({ titulo, subtitulo, etiqueta, accion }: {
  titulo: string; subtitulo?: string; etiqueta?: string; accion?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl items-end justify-between gap-3 px-4 pb-2 pt-5 aparecer">
      <div className="min-w-0">
        {etiqueta && <p className="etiqueta mb-1">{etiqueta}</p>}
        <h1 className="titulo-display text-[1.75rem] font-bold leading-tight text-tinta sm:text-4xl">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-tinta-suave">{subtitulo}</p>}
      </div>
      {accion}
    </div>
  );
}

export function Contenido({ children, ancho = "max-w-5xl" }: { children: ReactNode; ancho?: string }) {
  return <div className={cx("mx-auto w-full space-y-4 px-4 pb-32 pt-3 lg:pb-10", ancho)}>{children}</div>;
}

type Variante = "primario" | "vidrio" | "peligro" | "fantasma";
const VARIANTES: Record<Variante, string> = {
  primario: "vidrio-laguna hover:brightness-110",
  vidrio: "vidrio !rounded-full text-tinta hover:bg-sup/60",
  peligro: "bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_10px_20px_-10px_rgba(220,38,38,.8)] hover:brightness-110",
  fantasma: "text-tinta hover:bg-sup/40",
};

export function Boton({
  variante = "primario", icono: Icono, cargando, children, className, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; icono?: LucideIcon; cargando?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || cargando}
      className={cx(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition",
        "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-laguna",
        VARIANTES[variante],
        className,
      )}
    >
      {cargando ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : Icono && <Icono className="h-[18px] w-[18px]" aria-hidden />}
      {children}
    </button>
  );
}

export function BotonRegresar({ a }: { a?: string }) {
  const navegar = useNavigate();
  return (
    <Boton variante="vidrio" icono={ArrowLeft} onClick={() => (a ? navegar(a) : navegar(-1))}>
      Regresar
    </Boton>
  );
}

export function Tarjeta({ children, className, style, fuerte }: { children: ReactNode; className?: string; style?: CSSProperties; fuerte?: boolean }) {
  return <div style={style} className={cx(fuerte ? "vidrio-fuerte" : "vidrio", className)}>{children}</div>;
}

/** Fila "etiqueta / valor" dentro de una tarjeta. */
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="px-5 py-3.5">
      <p className="etiqueta">{etiqueta}</p>
      <div className="mt-0.5 text-[0.95rem] font-semibold text-tinta">{children}</div>
    </div>
  );
}

export function Aviso({ tipo = "info", titulo, children, icono: Icono }: {
  tipo?: "info" | "alerta" | "error" | "ok"; titulo?: string; children: ReactNode; icono?: LucideIcon;
}) {
  const estilos = {
    info: "bg-sky-50/60 text-sky-950 ring-sky-200/70",
    alerta: "bg-amber-50/70 text-amber-950 ring-amber-200/80",
    error: "bg-red-50/75 text-red-950 ring-red-200/80",
    ok: "bg-emerald-50/70 text-emerald-950 ring-emerald-200/80",
  }[tipo];
  const tono = { info: "tono-cielo", alerta: "tono-ambar", error: "tono-coral", ok: "tono-musgo" }[tipo];
  return (
    <div className={cx("flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ring-1 backdrop-blur-md", estilos)} role={tipo === "error" ? "alert" : undefined}>
      {Icono && <Gema icono={Icono} tono={tono} tam="sm" />}
      <div className="pt-0.5">
        {titulo && <p className="font-semibold">{titulo}</p>}
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export function Dialogo({ abierto, titulo, children, acciones, onCerrar }: {
  abierto: boolean; titulo: string; children: ReactNode; acciones: ReactNode; onCerrar(): void;
}) {
  if (!abierto) return null;
  // En el body: dentro de una tarjeta de vidrio (contexto de apilamiento propio) quedaría tapado.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-noche/40 p-3 backdrop-blur-[2px] sm:items-center" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="vidrio-solido hoja max-h-[90dvh] w-full max-w-md overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="titulo-display text-xl font-bold text-tinta">{titulo}</h2>
        <div className="mt-2 text-sm leading-relaxed text-tinta-suave">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">{acciones}</div>
      </div>
    </div>,
    document.body,
  );
}

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

export function iniciales(nombres: string, apellidos: string) {
  return `${nombres.trim()[0] ?? ""}${apellidos.trim()[0] ?? ""}`.toUpperCase();
}
