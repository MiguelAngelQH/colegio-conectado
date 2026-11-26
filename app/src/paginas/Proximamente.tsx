import { Construction } from "lucide-react";
import type { Modulo } from "@/app/modulos";
import { BotonRegresar, Contenido, Encabezado, Gema, Tarjeta, orden } from "@/ui/componentes";

/** Pantalla de un módulo que aún no se construye: indica en qué fase llega. */
export function Proximamente({ modulo }: { modulo: Modulo }) {
  return (
    <>
      <Encabezado etiqueta={`Fase ${modulo.fase}`} titulo={modulo.titulo} />
      <Contenido>
        <Tarjeta className="aparecer flex flex-col items-center gap-4 px-6 py-10 text-center" style={orden(1)}>
          <Gema icono={modulo.icono} tono={modulo.tono} tam="lg" />
          <h2 className="titulo-display max-w-md text-2xl font-bold">{modulo.descripcion}</h2>
          <p className="flex items-center gap-2 rounded-full bg-sup/50 px-4 py-2 text-sm text-tinta-suave ring-1 ring-sup">
            <Construction className="h-4 w-4" aria-hidden /> Se construye en la Fase {modulo.fase} del plan
          </p>
        </Tarjeta>
        <div className="flex justify-center pt-2"><BotonRegresar a="/" /></div>
      </Contenido>
    </>
  );
}
