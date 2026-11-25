import { Link } from "react-router-dom";
import { CircleCheck, CloudOff, CloudUpload, LoaderCircle, TriangleAlert } from "lucide-react";
import { useApp } from "@/app/contexto";
import { cx } from "./componentes";

/** Píldora de estado de conexión y cambios pendientes, siempre visible. */
export function EstadoSync({ compacto }: { compacto?: boolean }) {
  const { sync } = useApp();
  let Icono = CircleCheck;
  let texto = "Sincronizado";
  let punto = "bg-emerald-500";
  let tinte = "text-tinta";

  if (!sync.conectado) {
    Icono = CloudOff;
    texto = sync.pendientes ? `Sin conexión (${sync.pendientes})` : "Sin conexión";
    punto = "bg-amber-500";
    tinte = "text-amber-900";
  } else if (sync.sincronizando) {
    Icono = LoaderCircle;
    texto = "Sincronizando";
    punto = "bg-sky-500";
  } else if (sync.rechazados) {
    Icono = TriangleAlert;
    texto = `${sync.rechazados} por revisar`;
    punto = "bg-red-500";
    tinte = "text-red-800";
  } else if (sync.pendientes) {
    Icono = CloudUpload;
    texto = sync.pendientes === 1 ? "1 pendiente" : `${sync.pendientes} pendientes`;
    punto = "bg-sky-500";
  }

  return (
    <Link
      to="/sincronizacion"
      aria-label={`Estado de sincronización: ${texto}`}
      className={cx("vidrio !rounded-full inline-flex h-10 items-center gap-2 px-3.5 text-xs font-semibold transition active:scale-95", tinte)}
    >
      <span className="relative flex h-2.5 w-2.5">
        {!sync.conectado || sync.rechazados ? (
          <span className={cx("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", punto)} />
        ) : null}
        <span className={cx("relative inline-flex h-2.5 w-2.5 rounded-full", punto)} />
      </span>
      <Icono className={cx("h-4 w-4", Icono === LoaderCircle && "animate-spin")} aria-hidden />
      {!compacto && <span className="max-w-[8.5rem] truncate">{texto}</span>}
    </Link>
  );
}
