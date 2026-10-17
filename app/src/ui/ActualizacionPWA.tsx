import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw } from "lucide-react";
import { Boton } from "./componentes";

/** Avisa cuando hay una versión nueva de la app (el service worker ya la descargó). */
export function ActualizacionPWA() {
  const {
    needRefresh: [hayNueva, setHayNueva],
    updateServiceWorker,
  } = useRegisterSW();
  if (!hayNueva) return null;
  return (
    <div className="vidrio-fuerte fixed inset-x-3 top-3 z-50 mx-auto flex max-w-lg flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-semibold">
      <span>Hay una nueva versión de la aplicación.</span>
      <span className="flex gap-2">
        <Boton variante="fantasma" onClick={() => setHayNueva(false)}>Después</Boton>
        <Boton icono={RefreshCw} onClick={() => updateServiceWorker(true)}>Actualizar</Boton>
      </span>
    </div>
  );
}
