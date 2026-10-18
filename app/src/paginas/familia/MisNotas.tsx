import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpenCheck, FileDown, StickyNote } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { useHijos } from "@/datos/familia";
import { descargarLibretas } from "@/datos/libreta";
import { anioActivo } from "@/datos/consultas";
import { vivas } from "@/db/repositorio";
import { DESCRIPCION_NIVEL, NIVELES, armarLibreta } from "@/dominio/notas";
import { useAvisar } from "@/ui/avisos";
import { Boton, Contenido, Encabezado, Gema, Tarjeta, orden } from "@/ui/componentes";
import { Segmentado, Vacio } from "@/ui/formulario";
import { SelectorHijo } from "@/ui/SelectorHijo";
import { NIVEL_HEX, NIVEL_TEXTO } from "@/ui/graficos";

export function MisNotas() {
  const { usuario } = useApp();
  const avisar = useAvisar();
  const { hijos, hijo } = useHijos(usuario);
  const [periodoId, setPeriodoId] = useState("");
  const [generando, setGenerando] = useState(false);

  const datos = useLiveQuery(async () => {
    if (!hijo) return null;
    const anio = await anioActivo();
    const periodos = anio ? vivas(await db.tabla("periodo").where("anio_id").equals(anio.id).toArray()).sort((a, b) => a.numero - b.numero) : [];
    const mat = vivas(await db.tabla("matricula").where("estudiante_id").equals(hijo.id).toArray()).find((m) => m.anio_id === anio?.id);
    const sec = mat ? await db.tabla("seccion").get(mat.seccion_id) : undefined;
    const grado = sec ? await db.tabla("grado").get(sec.grado_id) : undefined;
    const areas = vivas(await db.tabla("area").toArray()).filter((a) => a.nivel === grado?.nivel);
    const competencias = await db.tabla("competencia").toArray();
    const califs = await db.tabla("calificacion").where("estudiante_id").equals(hijo.id).toArray();
    const obs = vivas(await db.tabla("observacion").where("estudiante_id").equals(hijo.id).toArray()).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);
    return { periodos, areas, competencias, califs, obs };
  }, [hijo?.id]);

  // Por defecto, el último periodo con notas.
  useEffect(() => {
    if (!datos || (periodoId && datos.periodos.some((p) => p.id === periodoId))) return;
    const conNotas = [...datos.periodos].reverse().find((p) => datos.califs.some((c) => c.periodo_id === p.id && c.nivel_logro));
    setPeriodoId((conNotas ?? datos.periodos[0])?.id ?? "");
  }, [datos, periodoId]);

  if (hijos && hijos.length === 0) {
    return (
      <>
        <Encabezado etiqueta="Familia" titulo="Notas y libreta" />
        <Contenido ancho="max-w-md"><Vacio icono={BookOpenCheck} titulo="No hay estudiantes vinculados a su cuenta">Comuníquese con la dirección del colegio.</Vacio></Contenido>
      </>
    );
  }
  if (!datos || !hijo) return null;

  const indice = datos.periodos.findIndex((p) => p.id === periodoId);
  const filas = armarLibreta({ estudianteId: hijo.id, areas: datos.areas, competencias: datos.competencias, periodos: datos.periodos, calificaciones: datos.califs });
  const delPeriodo = filas
    .map((f) => ({ ...f, competencias: f.competencias.filter((c) => c.niveles[indice]) }))
    .filter((f) => f.competencias.length);
  const conteo = NIVELES.map((n) => delPeriodo.reduce((s, f) => s + f.competencias.filter((c) => c.niveles[indice] === n).length, 0));
  // La conclusión que se muestra es la del periodo elegido.
  const conclusion = (competenciaId: string) =>
    datos.califs.find((c) => c.competencia_id === competenciaId && c.periodo_id === periodoId)?.conclusion?.trim();

  const libreta = async () => {
    setGenerando(true);
    try {
      await descargarLibretas([hijo.id], `libreta_${hijo.nombres}_${hijo.apellidos}.pdf`.replace(/\s+/g, "_"));
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <>
      <Encabezado etiqueta={usuario?.roles.includes("apoderado") ? `Notas de ${hijo.nombres.split(" ")[0]}` : "Mis notas"} titulo="Notas y libreta"
        accion={<Boton variante="vidrio" icono={FileDown} onClick={libreta} cargando={generando} className="hidden sm:inline-flex">Libreta PDF</Boton>} />
      <Contenido ancho="max-w-3xl">
        <SelectorHijo hijos={hijos ?? []} hijo={hijo} />
        <Tarjeta className="aparecer space-y-4 p-4" style={orden(1)}>
          <div className="flex flex-wrap items-center gap-2">
            <Segmentado etiqueta="Periodo" valor={periodoId} onCambio={setPeriodoId} opciones={datos.periodos.map((p) => ({ valor: p.id, texto: p.nombre.split(" ")[0] }))} />
            <Boton variante="vidrio" icono={FileDown} onClick={libreta} cargando={generando} className="ml-auto sm:hidden">Libreta</Boton>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {NIVELES.map((n, i) => (
              <div key={n} className="rounded-2xl bg-white/45 py-2 ring-1 ring-white/80">
                <p className="titulo-display text-2xl font-bold">{conteo[i]}</p>
                <p className="text-[0.65rem] font-semibold text-tinta-suave">{n} · {DESCRIPCION_NIVEL[n].nombre}</p>
              </div>
            ))}
          </div>
        </Tarjeta>

        {delPeriodo.length === 0 ? (
          <Vacio icono={BookOpenCheck} tono="tono-cielo" titulo="Aún no hay notas en este periodo">Aparecerán cuando los docentes las registren y se sincronicen.</Vacio>
        ) : delPeriodo.map((f, i) => (
          <Tarjeta key={f.area.id} className="aparecer overflow-hidden" style={orden(Math.min(i + 2, 8))}>
            <h2 className="border-b border-white/70 px-5 py-3 font-bold">{f.area.nombre}</h2>
            <ul className="divide-y divide-white/70">
              {f.competencias.map((c) => {
                const n = c.niveles[indice]!;
                const texto = conclusion(c.competencia.id);
                return (
                  <li key={c.competencia.id} className="flex gap-3 px-5 py-3">
                    <span className="titulo-display flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold shadow-sm" style={{ background: NIVEL_HEX[n], color: NIVEL_TEXTO[n] }}
                      aria-label={`${n}: ${DESCRIPCION_NIVEL[n].nombre}`}>{n}</span>
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold leading-snug">{c.competencia.nombre}</p>
                      {texto && <p className="mt-1 text-tinta-suave">{texto}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Tarjeta>
        ))}

        {datos.obs.length > 0 && (
          <section className="space-y-2">
            <h2 className="etiqueta px-1">Observaciones de los docentes</h2>
            {datos.obs.map((o) => (
              <Tarjeta key={o.id} className="flex gap-3 p-4">
                <Gema icono={StickyNote} tono={o.tipo === "felicitacion" ? "tono-musgo" : o.tipo === "conducta" ? "tono-ambar" : "tono-cielo"} tam="sm" />
                <div className="text-sm">
                  <p className="text-xs text-tinta-suave">{new Date(`${o.fecha}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long" })}</p>
                  <p>{o.texto}</p>
                </div>
              </Tarjeta>
            ))}
          </section>
        )}
      </Contenido>
    </>
  );
}
