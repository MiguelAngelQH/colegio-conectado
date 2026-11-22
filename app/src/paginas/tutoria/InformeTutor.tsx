// Informe del tutor para quien reciba al estudiante el próximo año. Interno: solo lo lee el personal.
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FilePen, Lock, Save } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { anioActivo, matriculaActual } from "@/datos/consultas";
import { guardar } from "@/db/repositorio";
import type { InformeTutor } from "@/db/tipos";
import { idDeterministico } from "@/dominio/notas";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Boton, Dialogo, Gema, Tarjeta } from "@/ui/componentes";
import { Campo } from "@/ui/formulario";

type Campos = Pick<InformeTutor, "fortalezas" | "dificultades" | "recomendaciones" | "apoyos" | "intereses">;

export const CAMPOS_INFORME: { clave: keyof Campos; titulo: string; ayuda: string }[] = [
  { clave: "fortalezas", titulo: "Fortalezas", ayuda: "En qué destaca, qué le sale bien, cómo aprende mejor." },
  { clave: "dificultades", titulo: "Dificultades", ayuda: "Lo que le cuesta en lo académico, la conducta o la convivencia." },
  { clave: "recomendaciones", titulo: "Recomendaciones para el próximo docente", ayuda: "Lo que funcionó: dónde sentarlo, cómo motivarlo, con quién trabaja bien." },
  { clave: "apoyos", titulo: "Apoyos que necesita", ayuda: "Necesidades educativas especiales, salud, situación familiar relevante, coordinaciones con SAANEE o psicología." },
  { clave: "intereses", titulo: "Intereses", ayuda: "Lo que le gusta: deportes, arte, temas, talleres." },
];

const vacio = (i: Partial<Campos> | undefined) => !i || CAMPOS_INFORME.every((c) => !i[c.clave]?.trim());

function DialogoInforme({ informe, onGuardar, onCerrar }: { informe: Partial<Campos>; onGuardar(c: Campos): Promise<void>; onCerrar(): void }) {
  const [f, setF] = useState<Campos>({
    fortalezas: informe.fortalezas ?? "", dificultades: informe.dificultades ?? "", recomendaciones: informe.recomendaciones ?? "",
    apoyos: informe.apoyos ?? "", intereses: informe.intereses ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  return (
    <Dialogo abierto titulo="Informe para el próximo año" onCerrar={onCerrar}
      acciones={<>
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        <Boton icono={Save} cargando={guardando} onClick={async () => { setGuardando(true); await onGuardar(f); }}>Guardar</Boton>
      </>}>
      <div className="space-y-3 pt-2 text-tinta">
        <p className="text-xs text-tinta-suave">Lo leerán los docentes y el tutor que tengan al estudiante el próximo año, y la dirección. La familia y el estudiante no lo ven.</p>
        {CAMPOS_INFORME.map((c) => (
          <Campo key={c.clave} etiqueta={c.titulo} ayuda={c.ayuda}>
            <textarea value={f[c.clave] ?? ""} onChange={(e) => setF({ ...f, [c.clave]: e.target.value })} rows={2} className="campo" />
          </Campo>
        ))}
      </div>
    </Dialogo>
  );
}

/** Tarjeta en la ficha de seguimiento: el informe de este año (pendiente, completo o cerrado). */
export function TarjetaInforme({ estudianteId }: { estudianteId: string }) {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const [editando, setEditando] = useState(false);

  const datos = useLiveQuery(async () => {
    const anio = await anioActivo();
    if (!anio || !usuario) return null;
    const informe = (await db.tabla("informe_tutor").where("estudiante_id").equals(estudianteId).toArray()).find((i) => i.anio_id === anio.id && !i.eliminado);
    const mat = await matriculaActual(estudianteId);
    const sec = mat ? await db.tabla("seccion").get(mat.seccion_id) : undefined;
    const gestion = usuario.roles.some((r) => r === "director" || r === "subdirector");
    return { anio, informe, puedeEditar: !anio.cerrado_en && (gestion || sec?.tutor_id === usuario.id) };
  }, [estudianteId, usuario?.id]);
  if (!datos) return null;
  const { anio, informe, puedeEditar } = datos;

  const guardarInforme = async (c: Campos) => {
    const limpio = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v?.trim() || null])) as Campos;
    await guardar(db, "informe_tutor", {
      id: informe?.id ?? (await idDeterministico("informe", estudianteId, anio.id)),
      estudiante_id: estudianteId, anio_id: anio.id, tutor_id: informe?.tutor_id ?? usuario!.id, ...limpio,
    }, colegioId);
    avisar(textoGuardado("Informe guardado"));
    setEditando(false);
  };

  return (
    <>
    <Tarjeta className="aparecer p-5">
      <div className="flex flex-wrap items-start gap-3">
        <Gema icono={FilePen} tono="tono-lila" tam="sm" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">Informe para el próximo año</h2>
          <p className="text-xs text-tinta-suave">
            {anio.cerrado_en ? `Año ${anio.anio} cerrado: el informe ya no se modifica.` : "Para que el próximo tutor y docentes sepan cómo acompañarlo. Solo lo ve el personal."}
          </p>
        </div>
        {vacio(informe) ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-900 ring-1 ring-amber-200">Pendiente</span>
        ) : anio.cerrado_en ? <Lock className="h-4 w-4 text-tinta-suave" aria-label="Cerrado" /> : null}
      </div>
      {!vacio(informe) && (
        <dl className="mt-3 space-y-2 text-sm">
          {CAMPOS_INFORME.filter((c) => informe?.[c.clave]).map((c) => (
            <div key={c.clave}>
              <dt className="etiqueta">{c.titulo}</dt>
              <dd className="whitespace-pre-line text-tinta">{informe![c.clave]}</dd>
            </div>
          ))}
        </dl>
      )}
      {puedeEditar && (
        <div className="mt-3">
          <Boton variante="vidrio" icono={FilePen} onClick={() => setEditando(true)}>{vacio(informe) ? "Escribir informe" : "Editar informe"}</Boton>
        </div>
      )}
    </Tarjeta>
    {/* Fuera de la tarjeta: el vidrio crea su propio contexto y el diálogo quedaría debajo de lo que sigue. */}
    {editando && <DialogoInforme informe={informe ?? {}} onGuardar={guardarInforme} onCerrar={() => setEditando(false)} />}
    </>
  );
}
