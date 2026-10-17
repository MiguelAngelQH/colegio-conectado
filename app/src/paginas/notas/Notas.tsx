import { useState } from "react";
import { useApp } from "@/app/contexto";
import { Encabezado } from "@/ui/componentes";
import { Segmentado } from "@/ui/formulario";
import { PanelNotas } from "./PanelNotas";
import { RegistroNotas } from "./RegistroNotas";

/** Docentes registran notas; la dirección ve el avance, cierra periodos y emite libretas. */
export function Notas() {
  const { usuario } = useApp();
  const esDocente = !!usuario?.roles.some((r) => r === "docente" || r === "tutor");
  const esDireccion = !!usuario?.roles.some((r) => r === "director" || r === "subdirector");
  const [vista, setVista] = useState<"registro" | "panel">(esDireccion ? "panel" : "registro");

  return (
    <>
      <Encabezado
        etiqueta="Evaluación por competencias"
        titulo={vista === "panel" ? "Notas y libretas" : "Registro de notas"}
        accion={esDocente && esDireccion ? (
          <Segmentado etiqueta="Vista" valor={vista} onCambio={setVista} opciones={[{ valor: "registro", texto: "Mis cursos" }, { valor: "panel", texto: "Dirección" }]} />
        ) : undefined}
      />
      {vista === "panel" && esDireccion ? <PanelNotas /> : <RegistroNotas />}
    </>
  );
}
