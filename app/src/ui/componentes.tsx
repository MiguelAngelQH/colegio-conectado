import { createPortal } from "react-dom";
import { useEffect, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LoaderCircle, X, type LucideIcon } from "lucide-react";

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
    <div className={cx("mx-auto flex w-full items-end justify-between gap-3 px-4 pb-2 pt-5 aparecer lg:px-6", ANCHO_PAGINA)}>
      <div className="min-w-0">
        {etiqueta && <p className="etiqueta mb-1">{etiqueta}</p>}
        <h1 className="titulo-display text-[1.75rem] font-bold leading-tight text-tinta sm:text-4xl">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-tinta-suave">{subtitulo}</p>}
      </div>
      {accion}
    </div>
  );
}

/** Ancho de todas las páginas: ocupa la pantalla (con un tope para monitores muy anchos). */
export const ANCHO_PAGINA = "max-w-[100rem]";

/** Cuerpo de la página. "angosto" solo para mensajes sueltos (p. ej. una página vacía). */
export function Contenido({ children, angosto }: { children: ReactNode; angosto?: boolean }) {
  return <div className={cx("mx-auto w-full space-y-4 px-4 pb-32 pt-3 lg:px-6 lg:pb-10", angosto ? "max-w-md" : ANCHO_PAGINA)}>{children}</div>;
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
    <div className={cx("flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ring-1", estilos)} role={tipo === "error" ? "alert" : undefined}>
      {Icono && <Gema icono={Icono} tono={tono} tam="sm" />}
      <div className="pt-0.5">
        {titulo && <p className="font-semibold">{titulo}</p>}
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

const ANCHO_DIALOGO = {
  chico: "sm:max-w-lg",     // confirmaciones y avisos cortos
  mediano: "sm:max-w-2xl",  // formularios
  grande: "sm:max-w-4xl",   // listas, fichas y formularios con varias secciones
  completo: "sm:max-w-6xl", // tablas (p. ej. el horario)
} as const;

/**
 * Ventana sobre la pantalla: cabecera fija con botón de cerrar, contenido con desplazamiento propio
 * y botones siempre visibles abajo. En el celular sube desde abajo y usa todo el ancho.
 */
export function Dialogo({ abierto, titulo, children, acciones, onCerrar, tam = "mediano" }: {
  abierto: boolean; titulo: string; children: ReactNode; acciones: ReactNode; onCerrar(): void;
  tam?: keyof typeof ANCHO_DIALOGO;
}) {
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  // En el body: dentro de una tarjeta de vidrio (contexto de apilamiento propio) quedaría tapado.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-noche/45 p-2 sm:items-center sm:p-6" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}
        className={cx("vidrio-solido hoja flex max-h-[92dvh] w-full flex-col overflow-hidden", ANCHO_DIALOGO[tam])}>
        <header className="flex items-start gap-3 border-b border-tinta/10 px-5 py-4 sm:px-7">
          <h2 className="titulo-display min-w-0 flex-1 text-xl font-bold leading-snug text-tinta">{titulo}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="-mr-2 rounded-full p-2 text-tinta-suave transition hover:bg-tinta/5 hover:text-tinta">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 text-sm leading-relaxed text-tinta-suave sm:px-7">{children}</div>
        {acciones && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-tinta/10 bg-tinta/[.025] px-5 py-3.5 sm:px-7">{acciones}</footer>}
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
