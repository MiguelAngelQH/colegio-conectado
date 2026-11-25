import { createPortal } from "react-dom";
import { Moon, Sun, Sunrise, Sunset } from "lucide-react";
import { fijarTema, posponerSugerencia, useSugerenciaTema } from "./tema";
import { cx } from "./componentes";

/**
 * Aviso a pantalla completa cuando oscurece (o amanece) y el modo no va con la hora:
 * propone cambiar, dejarlo como está hasta el próximo tramo o pasar a automático.
 */
export function SugerenciaTema() {
  const sugerencia = useSugerenciaTema();
  if (!sugerencia) return null;
  const noche = sugerencia === "oscuro";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="sugerencia-tema">
      <div className={cx("absolute inset-0 backdrop-blur-sm", noche ? "bg-[#060d1c]/70" : "bg-[#fff7e6]/60")} onClick={posponerSugerencia} />

      <div className={cx("aparecer relative w-full max-w-sm overflow-hidden rounded-[2rem] p-6 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)]",
        noche ? "bg-gradient-to-b from-[#132a57] to-[#0b1630] text-white" : "bg-gradient-to-b from-[#fff4d6] to-[#ffffff] text-[#0f1e36]")}>
        {/* Cielo: estrellas de noche, resplandor de sol de día. */}
        {noche ? (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {[[12, 18], [28, 8], [70, 14], [84, 30], [58, 6], [40, 26], [90, 10], [20, 34]].map(([x, y], i) => (
              <span key={i} className="estrella absolute h-1 w-1 rounded-full bg-white" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.35}s` }} />
            ))}
          </div>
        ) : (
          <div aria-hidden className="pointer-events-none absolute -top-20 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-[#ffc94d]/40 blur-3xl" />
        )}

        <div className={cx("astro relative mx-auto mt-2 grid h-24 w-24 place-items-center rounded-full",
          noche ? "bg-gradient-to-br from-[#dbe8ff] to-[#8fb2f0] text-[#132a57] shadow-[0_0_50px_10px_rgba(143,178,240,.35)]"
                : "bg-gradient-to-br from-[#ffd76a] to-[#f59e0b] text-white shadow-[0_0_60px_14px_rgba(255,190,60,.45)]")}>
          {noche ? <Moon className="h-11 w-11" strokeWidth={1.8} aria-hidden /> : <Sun className="h-12 w-12" strokeWidth={1.8} aria-hidden />}
        </div>

        <p className={cx("relative mt-5 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em]", noche ? "text-[#9ec5ff]" : "text-[#b45309]")}>
          {noche ? <Sunset className="h-4 w-4" aria-hidden /> : <Sunrise className="h-4 w-4" aria-hidden />}
          {noche ? "Ya es de noche" : "Ya amaneció"}
        </p>
        <h2 id="sugerencia-tema" className="titulo-display relative mt-1 text-2xl font-bold leading-tight">
          {noche ? "¿Cambiar a modo nocturno?" : "¿Volver al modo claro?"}
        </h2>
        <p className={cx("relative mt-2 text-sm leading-relaxed", noche ? "text-white/75" : "text-[#4a5a72]")}>
          {noche
            ? "Con poca luz, la pantalla oscura cansa menos la vista y gasta menos batería."
            : "Con luz de día, el modo claro se lee mejor."}
        </p>

        <div className="relative mt-6 space-y-2">
          <button type="button" autoFocus onClick={() => fijarTema(sugerencia)}
            className={cx("flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold outline-none transition hover:brightness-110 focus-visible:ring-4 active:scale-[0.98]",
              noche ? "bg-[#9ec5ff] text-[#0b1630] focus-visible:ring-[#9ec5ff]/30" : "bg-[#1e3a8a] text-white focus-visible:ring-[#1e3a8a]/25")}>
            {noche ? <Moon className="h-4 w-4" aria-hidden /> : <Sun className="h-4 w-4" aria-hidden />}
            {noche ? "Sí, modo nocturno" : "Sí, modo claro"}
          </button>
          <button type="button" onClick={posponerSugerencia}
            className={cx("min-h-11 w-full rounded-full text-sm font-semibold transition", noche ? "text-white/80 hover:bg-white/10" : "text-[#1e3a8a] hover:bg-[#1e3a8a]/5")}>
            Ahora no
          </button>
          <button type="button" onClick={() => fijarTema("auto")}
            className={cx("w-full pt-1 text-xs underline-offset-2 hover:underline", noche ? "text-white/55" : "text-[#4a5a72]")}>
            Cambiar solo cada día (de 6:00 p. m. a 6:00 a. m.)
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
