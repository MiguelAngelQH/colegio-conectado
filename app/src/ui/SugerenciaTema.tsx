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

      <div className={cx("tarjeta-astro relative w-full max-w-sm overflow-hidden rounded-[2rem] p-6 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)]",
        noche ? "bg-gradient-to-b from-[#132a57] to-[#0b1630] text-white" : "bg-gradient-to-b from-[#fff4d6] to-[#ffffff] text-[#0f1e36]")}>
        {/* Cielo: estrellas que titilan y una estrella fugaz de noche; resplandor y nubes de día. */}
        {noche ? (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {[[12, 18], [28, 8], [70, 14], [84, 30], [58, 6], [40, 26], [90, 10], [20, 34], [6, 40], [76, 40]].map(([x, y], i) => (
              <span key={i} className="estrella absolute h-1 w-1 rounded-full bg-white" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.3}s` }} />
            ))}
            <span className="fugaz absolute left-[8%] top-[10%] h-[2px] w-20 rounded-full bg-gradient-to-r from-transparent via-white to-white" />
          </div>
        ) : (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="resplandor absolute -top-20 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-[#ffc94d]/45 blur-3xl" />
            <span className="nube absolute left-[-20%] top-[14%] h-5 w-16 rounded-full bg-white/90 shadow-[14px_-6px_0_2px_rgba(255,255,255,.9)]" />
            <span className="nube nube-lenta absolute left-[-30%] top-[32%] h-4 w-12 rounded-full bg-white/80 shadow-[10px_-5px_0_1px_rgba(255,255,255,.8)]" />
          </div>
        )}

        {/* El astro cae y rebota; al aterrizar suelta destellos. El sol gira sus rayos; la luna se mece. */}
        <div className="relative mx-auto mt-2 h-28 w-28">
          {!noche && (
            <div aria-hidden className="rayos absolute -inset-5">
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} className="absolute left-[calc(50%-3px)] top-0 h-1/2 w-[6px] origin-bottom" style={{ transform: `rotate(${i * 30}deg)` }}>
                  <span className={cx("block w-full rounded-full bg-gradient-to-b from-[#ffb300] via-[#ffc93d] to-transparent", i % 2 ? "h-5" : "h-7")} />
                </span>
              ))}
            </div>
          )}
          <div className={cx("astro-salto absolute inset-2 grid place-items-center rounded-full",
            noche ? "bg-gradient-to-br from-[#eef4ff] to-[#8fb2f0] text-[#132a57] shadow-[0_0_50px_12px_rgba(143,178,240,.4)]"
                  : "bg-gradient-to-br from-[#ffe08a] to-[#f59e0b] text-white shadow-[0_0_60px_16px_rgba(255,190,60,.5)]")}>
            <span className={noche ? "luna-mece" : "sol-late"}>
              {noche ? <Moon className="h-11 w-11" strokeWidth={1.8} aria-hidden /> : <Sun className="h-12 w-12" strokeWidth={1.8} aria-hidden />}
            </span>
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {[[-8, 10, 0], [102, 4, 1], [110, 62, 2], [-14, 70, 3], [48, -16, 4], [50, 112, 5], [86, -6, 6], [8, 100, 7]].map(([x, y, i]) => (
              <svg key={i} viewBox="0 0 24 24" className={cx("destello absolute h-4 w-4", noche ? "text-white" : "text-[#ffb000]")}
                style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${0.75 + i * 0.09}s, ${1.6 + i * 0.4}s` }}>
                <path fill="currentColor" d="M12 0 L14.2 9.8 L24 12 L14.2 14.2 L12 24 L9.8 14.2 L0 12 L9.8 9.8 Z" />
              </svg>
            ))}
          </div>
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
