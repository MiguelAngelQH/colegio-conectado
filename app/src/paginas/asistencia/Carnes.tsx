import { useState } from "react";
import { IdCard, Printer } from "lucide-react";
import { descargarCarnes } from "@/datos/carnes";
import { useEstructura } from "@/datos/consultas";
import { useAvisar } from "@/ui/avisos";
import { Boton, BotonRegresar, Contenido, Encabezado, Gema, Tarjeta, orden } from "@/ui/componentes";
import { Casilla, Vacio } from "@/ui/formulario";

export function Carnes() {
  const e = useEstructura();
  const avisar = useAvisar();
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [generando, setGenerando] = useState(false);
  if (!e) return null;
  const total = e.secciones.filter((s) => elegidas.includes(s.id)).reduce((n, s) => n + s.estudiantes, 0);

  const generar = async () => {
    setGenerando(true);
    try {
      await descargarCarnes(elegidas, elegidas.length === 1 ? `carnes_${e.secciones.find((s) => s.id === elegidas[0])!.nombre.replace(/[^\w]+/g, "_")}.pdf` : "carnes.pdf");
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <>
      <Encabezado etiqueta="Asistencia" titulo="Carnés con QR" subtitulo="Para escanear la asistencia de estudiantes sin celular. 10 carnés por hoja A4." />
      <Contenido ancho="max-w-3xl">
        {e.secciones.length === 0 ? (
          <Vacio icono={IdCard} titulo="No hay secciones" />
        ) : (
          <Tarjeta className="aparecer space-y-4 p-5" style={orden(1)}>
            <div className="flex items-center gap-3">
              <Gema icono={IdCard} tono="tono-ambar" />
              <p className="text-sm text-tinta-suave">Elija las secciones. Imprima en cartulina y plastifique si es posible: el QR debe verse limpio.</p>
            </div>
            <div className="flex justify-end">
              <Boton variante="fantasma" onClick={() => setElegidas(elegidas.length === e.secciones.length ? [] : e.secciones.map((s) => s.id))}>
                {elegidas.length === e.secciones.length ? "Quitar todas" : "Elegir todas"}
              </Boton>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {e.secciones.map((s) => (
                <Casilla key={s.id} marcada={elegidas.includes(s.id)} onCambio={(v) => setElegidas(v ? [...elegidas, s.id] : elegidas.filter((x) => x !== s.id))}>
                  {s.nombreLargo} <span className="font-normal text-tinta-suave">({s.estudiantes})</span>
                </Casilla>
              ))}
            </div>
            <Boton icono={Printer} className="w-full" onClick={generar} cargando={generando} disabled={!total}>
              Generar {total} carnés (PDF)
            </Boton>
          </Tarjeta>
        )}
        <div className="flex justify-center pt-2"><BotonRegresar a="/asistencia" /></div>
      </Contenido>
    </>
  );
}
