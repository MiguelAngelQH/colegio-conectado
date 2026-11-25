import { useEffect, useState } from "react";
import { DatabaseBackup, FileSpreadsheet, Info, Lock, TriangleAlert } from "lucide-react";
import { useEstructura } from "@/datos/consultas";
import { descargarRespaldo, descargarSiagie, hojasSiagie } from "@/datos/exportar";
import type { HojaSiagie } from "@/dominio/siagie";
import { useAvisar } from "@/ui/avisos";
import { Aviso, Boton, Contenido, Encabezado, Gema, Tarjeta, cx, orden } from "@/ui/componentes";
import { Casilla, Segmentado, Vacio } from "@/ui/formulario";

export function Exportar() {
  const e = useEstructura();
  const avisar = useAvisar();
  const [periodoId, setPeriodoId] = useState("");
  const [elegidas, setElegidas] = useState<string[] | null>(null);
  const [hojas, setHojas] = useState<HojaSiagie[] | null>(null);
  const [trabajando, setTrabajando] = useState<"revisar" | "excel" | "respaldo" | null>(null);

  useEffect(() => {
    if (!e) return;
    if (!periodoId && e.periodos.length) {
      const hoy = new Date().toISOString().slice(0, 10);
      setPeriodoId(([...e.periodos].reverse().find((p) => p.inicio <= hoy) ?? e.periodos[0]).id);
    }
    if (elegidas === null) setElegidas(e.secciones.map((s) => s.id));
  }, [e, periodoId, elegidas]);
  useEffect(() => setHojas(null), [periodoId, elegidas]);

  if (!e) return null;
  const periodo = e.periodos.find((p) => p.id === periodoId);
  const faltantes = hojas?.reduce((s, h) => s + h.faltantes, 0) ?? 0;
  const sinConclusion = hojas?.reduce((s, h) => s + h.sinConclusion, 0) ?? 0;

  const ejecutar = async (accion: "revisar" | "excel" | "respaldo", fn: () => Promise<void>) => {
    setTrabajando(accion);
    try {
      await fn();
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setTrabajando(null);
    }
  };

  return (
    <>
      <Encabezado etiqueta="Dirección" titulo="Exportar" subtitulo="Archivos para la carga al SIAGIE y respaldo del colegio. Se generan en este equipo, sin internet." />
      <Contenido ancho="max-w-3xl">
        <Tarjeta className="aparecer space-y-4 p-5" style={orden(1)}>
          <div className="flex items-start gap-3">
            <Gema icono={FileSpreadsheet} tono="tono-musgo" />
            <div>
              <h2 className="font-bold">Notas para el SIAGIE</h2>
              <p className="text-sm text-tinta-suave">Un Excel con una hoja por sección y área: calificativo y conclusión descriptiva por competencia.</p>
            </div>
          </div>
          <Aviso tipo="info" icono={Info}>
            El SIAGIE no permite conexión directa: la carga se hace con Excel. Antes de la primera carga, compare este archivo con la plantilla que descarga del SIAGIE de su IE (orden de columnas y códigos).
          </Aviso>
          {e.periodos.length === 0 ? <Vacio icono={FileSpreadsheet} titulo="Configure primero el año escolar" /> : (
            <>
              <div>
                <span className="mb-1.5 block text-sm font-semibold">Periodo</span>
                <Segmentado etiqueta="Periodo" valor={periodoId} onCambio={setPeriodoId} opciones={e.periodos.map((p) => ({ valor: p.id, texto: p.nombre.split(" ")[0] }))} />
                {periodo && periodo.estado !== "cerrado" && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800"><Lock className="h-3.5 w-3.5" aria-hidden /> El {periodo.nombre} sigue abierto: las notas aún pueden cambiar.</p>
                )}
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-semibold">Secciones</span>
                  <Boton variante="fantasma" className="!min-h-8 !px-3 text-xs"
                    onClick={() => setElegidas(elegidas?.length === e.secciones.length ? [] : e.secciones.map((s) => s.id))}>
                    {elegidas?.length === e.secciones.length ? "Quitar todas" : "Elegir todas"}
                  </Boton>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {e.secciones.map((s) => (
                    <Casilla key={s.id} marcada={!!elegidas?.includes(s.id)} onCambio={(v) => setElegidas(v ? [...(elegidas ?? []), s.id] : (elegidas ?? []).filter((x) => x !== s.id))}>
                      {s.nombreLargo}
                    </Casilla>
                  ))}
                </div>
              </div>
              <Boton variante="vidrio" className="w-full" cargando={trabajando === "revisar"} disabled={!elegidas?.length}
                onClick={() => void ejecutar("revisar", async () => setHojas(await hojasSiagie(periodoId, elegidas ?? [])))}>
                Revisar antes de descargar
              </Boton>
            </>
          )}

          {hojas && (
            <div className="space-y-3">
              {hojas.length === 0 ? <Aviso tipo="alerta" icono={TriangleAlert}>No hay áreas con docentes o notas en las secciones elegidas.</Aviso> : (
                <>
                  {(faltantes > 0 || sinConclusion > 0) ? (
                    <Aviso tipo="alerta" icono={TriangleAlert} titulo="Revise antes de cargar">
                      {faltantes > 0 && <p>Faltan {faltantes} calificativos.</p>}
                      {sinConclusion > 0 && <p>{sinConclusion} notas B o C no tienen conclusión descriptiva.</p>}
                    </Aviso>
                  ) : <Aviso tipo="ok">Todo completo: {hojas.length} hojas listas.</Aviso>}
                  <div className="max-h-64 overflow-y-auto rounded-2xl bg-white/40 ring-1 ring-white/80">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-white/85 text-xs text-tinta-suave backdrop-blur"><tr><th className="px-3 py-2">Hoja</th><th className="px-3 py-2 text-right">Estudiantes</th><th className="px-3 py-2 text-right">Faltan</th></tr></thead>
                      <tbody className="divide-y divide-white/70">
                        {hojas.map((h) => (
                          <tr key={h.nombre}>
                            <td className="px-3 py-1.5 font-semibold">{h.nombre}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{h.filas.length - 7}</td>
                            <td className={cx("px-3 py-1.5 text-right tabular-nums", (h.faltantes > 0 || h.sinConclusion > 0) && "font-semibold text-amber-800")}>
                              {h.faltantes || h.sinConclusion ? `${h.faltantes} notas · ${h.sinConclusion} concl.` : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Boton icono={FileSpreadsheet} className="w-full" cargando={trabajando === "excel"}
                    onClick={() => void ejecutar("excel", () => descargarSiagie(hojas, `siagie_${(periodo?.nombre ?? "periodo").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`))}>
                    Descargar Excel
                  </Boton>
                </>
              )}
            </div>
          )}
        </Tarjeta>

        <Tarjeta className="aparecer space-y-4 p-5" style={orden(2)}>
          <div className="flex items-start gap-3">
            <Gema icono={DatabaseBackup} tono="tono-cielo" />
            <div>
              <h2 className="font-bold">Respaldo del colegio</h2>
              <p className="text-sm text-tinta-suave">Un archivo JSON con toda la información de este equipo y un Excel legible con estudiantes, notas y asistencia. Descárguelo al cerrar cada bimestre y guárdelo fuera de esta computadora (USB o Drive).</p>
            </div>
          </div>
          <Aviso tipo="alerta" icono={TriangleAlert}>Contiene datos personales de menores de edad (Ley N.° 29733). Guárdelo en un lugar seguro y no lo comparta.</Aviso>
          <Boton variante="vidrio" icono={DatabaseBackup} className="w-full" cargando={trabajando === "respaldo"} onClick={() => void ejecutar("respaldo", descargarRespaldo)}>
            Descargar respaldo
          </Boton>
        </Tarjeta>
      </Contenido>
    </>
  );
}
