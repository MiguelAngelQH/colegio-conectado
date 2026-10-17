import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CircleCheck, CloudOff, CloudUpload, RefreshCw, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import type { EntradaOutbox } from "@/db/local";
import type { NombreTabla } from "@/db/tipos";
import { descartarCambio, reintentarRechazado } from "@/sync/motor";
import { Boton, BotonRegresar, Contenido, Dialogo, Encabezado, Gema, Tarjeta, fechaHora, orden } from "@/ui/componentes";

const NOMBRE_TABLA: Partial<Record<NombreTabla, string>> = {
  calificacion: "Nota", asistencia: "Asistencia", asistencia_sesion: "Sesión de asistencia", observacion: "Observación",
  estudiante: "Estudiante", matricula: "Matrícula", comunicado: "Comunicado", incidencia: "Incidencia",
  sesion_tutoria: "Sesión de tutoría", periodo: "Periodo", seccion: "Sección", usuario: "Usuario",
};

export function Sincronizacion() {
  const { sync, sincronizarAhora } = useApp();
  const [resultado, setResultado] = useState<string | null>(null);
  const [aDescartar, setADescartar] = useState<EntradaOutbox | null>(null);
  const entradas = useLiveQuery(() => db.outbox.orderBy("id").toArray(), [], []);
  const rechazados = entradas.filter((e) => e.estado === "rechazado");
  const pendientes = entradas.filter((e) => e.estado !== "rechazado");

  const sincronizar = async () => {
    const r = await sincronizarAhora();
    if (!r) return;
    setResultado(r.error ? `No se pudo sincronizar: ${r.error}` : `Listo: ${r.enviados} enviados y ${r.recibidos} recibidos${r.rechazados ? `, ${r.rechazados} por revisar` : ""}.`);
  };

  const estado = !sync.conectado
    ? { icono: CloudOff, tono: "tono-ambar", titulo: "Sin conexión", texto: "Puede seguir trabajando. Todo se guarda en este equipo y se enviará solo cuando vuelva la señal." }
    : sync.pendientes
      ? { icono: CloudUpload, tono: "tono-cielo", titulo: `${sync.pendientes} cambios por enviar`, texto: "Se envían automáticamente en unos segundos." }
      : { icono: CircleCheck, tono: "tono-musgo", titulo: "Todo sincronizado", texto: "Este equipo y el servidor tienen la misma información." };

  return (
    <>
      <Encabezado etiqueta="Datos de este equipo" titulo="Sincronización" />
      <Contenido ancho="max-w-3xl">
        <Tarjeta fuerte className="aparecer p-6" style={orden(1)}>
          <div className="flex items-start gap-4">
            <Gema icono={estado.icono} tono={estado.tono} tam="lg" />
            <div className="min-w-0">
              <h2 className="titulo-display text-2xl font-bold">{estado.titulo}</h2>
              <p className="mt-1 text-sm text-tinta-suave">{estado.texto}</p>
              <p className="mt-2 text-xs text-tinta-suave">Última sincronización: <strong className="text-tinta">{fechaHora(sync.ultima)}</strong></p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Boton icono={RefreshCw} onClick={sincronizar} cargando={sync.sincronizando} disabled={!sync.conectado}>Sincronizar ahora</Boton>
            {resultado && <p className="text-sm text-tinta-suave" role="status">{resultado}</p>}
          </div>
        </Tarjeta>

        {rechazados.length > 0 && (
          <section className="aparecer" style={orden(2)}>
            <h2 className="mb-1 flex items-center gap-2 px-1 text-sm font-bold text-red-700">
              <TriangleAlert className="h-4 w-4" aria-hidden /> El servidor no aceptó {rechazados.length === 1 ? "1 cambio" : `${rechazados.length} cambios`}
            </h2>
            <p className="mb-3 px-1 text-sm text-tinta-suave">
              No se perdieron: siguen en este equipo. Puede reintentar (por ejemplo, cuando el director reabra el bimestre) o descartar.
            </p>
            <div className="space-y-3">
              {rechazados.map((e) => (
                <Tarjeta key={e.id} className="p-4 ring-1 ring-red-200/80">
                  <div className="flex items-start gap-3">
                    <Gema icono={TriangleAlert} tono="tono-coral" tam="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{NOMBRE_TABLA[e.tabla] ?? e.tabla}</p>
                      <p className="text-sm text-red-800">{e.error}</p>
                      <p className="mt-1 text-xs text-tinta-suave">Hecho el {fechaHora(new Date(e.creado).toISOString())}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Boton variante="fantasma" icono={Trash2} onClick={() => setADescartar(e)}>Descartar</Boton>
                    <Boton variante="vidrio" icono={RotateCcw} onClick={() => reintentarRechazado(db, e.id!)}>Reintentar</Boton>
                  </div>
                </Tarjeta>
              ))}
            </div>
          </section>
        )}

        {pendientes.length > 0 && (
          <section className="aparecer" style={orden(3)}>
            <h2 className="etiqueta mb-2 px-1">En cola ({pendientes.length})</h2>
            <Tarjeta className="divide-y divide-white/70">
              {pendientes.slice(0, 50).map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="font-semibold">{NOMBRE_TABLA[e.tabla] ?? e.tabla}</span>
                  <span className="text-right text-xs text-tinta-suave">
                    {fechaHora(new Date(e.creado).toISOString())}
                    {e.intentos > 0 && <span className="block text-amber-800">{e.intentos} intentos · {e.error}</span>}
                  </span>
                </div>
              ))}
              {pendientes.length > 50 && <p className="px-5 py-3 text-xs text-tinta-suave">y {pendientes.length - 50} más...</p>}
            </Tarjeta>
          </section>
        )}

        <div className="flex justify-center pt-2"><BotonRegresar a="/" /></div>
      </Contenido>

      <Dialogo
        abierto={aDescartar !== null}
        titulo="¿Descartar este cambio?"
        onCerrar={() => setADescartar(null)}
        acciones={
          <>
            <Boton variante="fantasma" onClick={() => setADescartar(null)}>Cancelar</Boton>
            <Boton variante="peligro" icono={Trash2} onClick={async () => { await descartarCambio(db, aDescartar!.id!); setADescartar(null); }}>Descartar</Boton>
          </>
        }
      >
        Se volverá al último valor que tiene el servidor. Esta acción no se puede deshacer.
      </Dialogo>
    </>
  );
}
