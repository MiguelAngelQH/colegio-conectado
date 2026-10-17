import type { Estudiante } from "@/db/tipos";
import { elegirHijo } from "@/datos/familia";
import { cx, iniciales } from "./componentes";

/** Para apoderados con varios hijos: elige de quién ver la información. */
export function SelectorHijo({ hijos, hijo }: { hijos: Estudiante[]; hijo: Estudiante | undefined }) {
  if (hijos.length < 2) return null;
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Elegir hijo">
      <div className="flex w-max gap-2">
        {hijos.map((h) => {
          const activo = h.id === hijo?.id;
          return (
            <button key={h.id} role="radio" aria-checked={activo} onClick={() => elegirHijo(h.id)}
              className={cx("flex min-h-12 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-semibold transition",
                activo ? "vidrio-laguna" : "vidrio !rounded-full text-tinta-suave")}>
              <span className={cx("gema titulo-display h-9 w-9 !rounded-full text-xs font-bold", activo ? "tono-musgo" : "tono-pizarra")}>
                <span className="relative z-10">{iniciales(h.nombres, h.apellidos)}</span>
              </span>
              {h.nombres.split(" ")[0]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
