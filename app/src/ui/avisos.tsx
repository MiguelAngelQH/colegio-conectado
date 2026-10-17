import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CircleCheck, CloudOff, TriangleAlert, X } from "lucide-react";
import { hayConexion } from "@/sync/red";
import { cx } from "./componentes";

type Tipo = "ok" | "error";
interface Aviso { id: number; tipo: Tipo; texto: string }

const Ctx = createContext<(texto: string, tipo?: Tipo) => void>(() => undefined);

/** Avisos breves ("Guardado") que desaparecen solos. */
export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((texto: string, tipo: Tipo = "ok") => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a.slice(-2), { id, tipo, texto }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === "error" ? 6000 : 3200);
  }, []);
  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {avisos.map((a) => {
          const Icono = a.tipo === "error" ? TriangleAlert : hayConexion() ? CircleCheck : CloudOff;
          return (
            <div key={a.id} className={cx("vidrio-fuerte aparecer pointer-events-auto flex max-w-md items-center gap-2.5 !rounded-full py-2.5 pl-4 pr-2 text-sm font-semibold",
              a.tipo === "error" ? "text-red-800" : "text-tinta")}>
              <Icono className={cx("h-[18px] w-[18px] shrink-0", a.tipo === "error" ? "text-red-600" : "text-teal-600")} aria-hidden />
              <span>{a.texto}</span>
              <button onClick={() => setAvisos((x) => x.filter((y) => y.id !== a.id))} className="rounded-full p-1 hover:bg-white/60" aria-label="Cerrar aviso">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useAvisar = () => useContext(Ctx);

/** Mensaje estándar tras guardar: aclara si quedó solo en el equipo. */
export const textoGuardado = (que = "Guardado") => (hayConexion() ? `${que}` : `${que} en este equipo. Se enviará al volver la señal.`);
