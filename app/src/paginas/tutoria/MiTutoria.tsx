import { useLiveQuery } from "dexie-react-hooks";
import { HandHeart, StickyNote } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { vivas } from "@/db/repositorio";
import type { Observacion } from "@/db/tipos";
import { Contenido, Encabezado, Gema, Tarjeta, orden } from "@/ui/componentes";
import { Vacio } from "@/ui/formulario";

const TIPO: Record<Observacion["tipo"], { texto: string; tono: string }> = {
  academica: { texto: "Académica", tono: "tono-cielo" },
  conducta: { texto: "Conducta", tono: "tono-ambar" },
  felicitacion: { texto: "Felicitación", tono: "tono-musgo" },
  otra: { texto: "Observación", tono: "tono-pizarra" },
};

/** Vista del estudiante: su tutor(a) y las observaciones que le han registrado. */
export function MiTutoria() {
  const { usuario } = useApp();
  const datos = useLiveQuery(async () => {
    if (!usuario) return null;
    const yo = (await db.tabla("estudiante").where("usuario_id").equals(usuario.id).toArray()).find((e) => !e.eliminado);
    if (!yo) return { tutor: undefined, obs: [] as Observacion[] };
    const mat = vivas(await db.tabla("matricula").where("estudiante_id").equals(yo.id).toArray()).find((m) => m.estado === "matriculado");
    const sec = mat ? await db.tabla("seccion").get(mat.seccion_id) : undefined;
    const tutor = sec?.tutor_id ? await db.tabla("usuario").get(sec.tutor_id) : undefined;
    const obs = vivas(await db.tabla("observacion").where("estudiante_id").equals(yo.id).toArray()).sort((a, b) => b.fecha.localeCompare(a.fecha));
    return { tutor, obs };
  }, [usuario?.id]);
  if (!datos) return null;

  return (
    <>
      <Encabezado etiqueta="Tutoría" titulo="Mi tutoría" />
      <Contenido ancho="max-w-2xl">
        <Tarjeta className="aparecer flex items-center gap-4 p-5" style={orden(1)}>
          <Gema icono={HandHeart} tono="tono-rosa" tam="lg" />
          <div>
            <p className="etiqueta">Tu tutor(a)</p>
            <p className="titulo-display text-xl font-bold">{datos.tutor ? `${datos.tutor.nombres} ${datos.tutor.apellidos}` : "Sin asignar"}</p>
            <p className="text-sm text-tinta-suave">Puedes acercarte cuando necesites orientación.</p>
          </div>
        </Tarjeta>
        <h2 className="etiqueta px-1">Observaciones sobre ti</h2>
        {datos.obs.length === 0 ? <Vacio icono={StickyNote} titulo="Aún no hay observaciones" /> : (
          <div className="space-y-3">
            {datos.obs.map((o) => (
              <Tarjeta key={o.id} className="flex gap-3 p-4">
                <Gema icono={StickyNote} tono={TIPO[o.tipo].tono} tam="sm" />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">{TIPO[o.tipo].texto} · <span className="font-normal text-tinta-suave">{new Date(`${o.fecha}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long" })}</span></p>
                  <p className="mt-0.5">{o.texto}</p>
                </div>
              </Tarjeta>
            ))}
          </div>
        )}
      </Contenido>
    </>
  );
}
