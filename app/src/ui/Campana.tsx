import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { useApp } from "@/app/contexto";
import { useAvisos } from "@/datos/familia";
import { cx } from "./componentes";

/**
 * Campana con la cantidad de avisos nuevos. Si el usuario activó las notificaciones y la app está en
 * segundo plano, muestra una notificación del sistema cuando llegan avisos nuevos con la sincronización.
 */
export function Campana() {
  const { usuario } = useApp();
  const datos = useAvisos(usuario);
  const conocidos = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!datos) return;
    const nuevos = datos.avisos.filter((a) => a.nuevo);
    if (conocidos.current === null) {
      conocidos.current = new Set(nuevos.map((a) => a.id));
      return;
    }
    const recientes = nuevos.filter((a) => !conocidos.current!.has(a.id));
    recientes.forEach((a) => conocidos.current!.add(a.id));
    if (!recientes.length || typeof Notification === "undefined" || Notification.permission !== "granted" || document.visibilityState === "visible") return;
    const titulo = recientes.length === 1 ? recientes[0].titulo : `${recientes.length} avisos nuevos`;
    const cuerpo = recientes.length === 1 ? recientes[0].detalle : recientes.slice(0, 3).map((a) => a.titulo).join(" · ");
    void navigator.serviceWorker?.getRegistration().then(async (reg) => {
      // Con service worker la notificación funciona también con la app en segundo plano (Android).
      if (reg) await reg.showNotification(titulo, { body: cuerpo, icon: "/icon.svg", tag: "avisos" });
      else new Notification(titulo, { body: cuerpo, icon: "/icon.svg" });
    }).catch(() => undefined);
  }, [datos]);

  const n = datos?.nuevos ?? 0;
  return (
    <Link to="/avisos" aria-label={n ? `${n} avisos nuevos` : "Avisos"}
      className="vidrio !rounded-full relative inline-flex h-10 w-10 items-center justify-center transition active:scale-95">
      <Bell className="h-[18px] w-[18px]" aria-hidden />
      {n > 0 && (
        <span className={cx("titulo-display absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.65rem] font-bold text-white",
          "bg-gradient-to-b from-red-400 to-red-600 shadow-[0_2px_6px_rgba(220,38,38,.6)]")}>
          {n > 99 ? "99+" : n}
        </span>
      )}
    </Link>
  );
}
