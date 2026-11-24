// Áreas del currículo nacional (solo lectura) y áreas o talleres propios del colegio, con sus
// competencias. Los talleres se asignan a docentes y se califican como cualquier área (sin
// capacidades del CNEB: la nota se pone directamente por competencia).
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BookMarked, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { NIVEL_TEXTO, useEstructura } from "@/datos/consultas";
import { nuevoId } from "@/db/local";
import { guardarLote, vivas, type Escritura } from "@/db/repositorio";
import type { Area, Competencia } from "@/db/tipos";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Boton, BotonRegresar, Contenido, Dialogo, Encabezado, Gema, Tarjeta } from "@/ui/componentes";
import { Campo, Entrada, Segmentado, Vacio } from "@/ui/formulario";

type Nivel = Area["nivel"];

export function AreasPropias() {
  const e = useEstructura();
  const [editando, setEditando] = useState<Area | "nueva" | null>(null);
  const datos = useLiveQuery(async () => {
    const areas = vivas(await db.tabla("area").toArray());
    const comps = vivas(await db.tabla("competencia").toArray());
    return { areas, comps };
  }, []);
  if (!datos || !e) return null;
  const niveles = [...new Set(e.grados.map((g) => g.nivel))] as Nivel[];
  const propias = datos.areas.filter((a) => a.colegio_id).sort((a, b) => a.nivel.localeCompare(b.nivel) || a.orden - b.orden);
  const compsDe = (id: string) => datos.comps.filter((c) => c.area_id === id).sort((a, b) => a.orden - b.orden);

  return (
    <>
      <Encabezado etiqueta="Configuración" titulo="Áreas y talleres" subtitulo="Las del currículo nacional ya están cargadas. Aquí agrega los talleres o áreas propias del colegio."
        accion={<BotonRegresar a="/configuracion" />} />
      <Contenido ancho="max-w-3xl">
        <Tarjeta className="aparecer space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex-1 font-bold">Talleres y áreas propias</h2>
            <Boton icono={Plus} onClick={() => setEditando("nueva")} disabled={!niveles.length}>Nuevo taller</Boton>
          </div>
          {propias.length === 0 ? (
            <Vacio icono={BookMarked} tono="tono-lila" titulo="Todavía no hay talleres propios">
              Por ejemplo: "Taller de Oratoria" o "Robótica", con las competencias que el colegio evalúa en ellos.
            </Vacio>
          ) : (
            <div className="divide-y divide-white/70">
              {propias.map((a) => (
                <div key={a.id} className="flex items-start gap-3 py-3">
                  <Gema icono={BookMarked} tono="tono-lila" tam="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.nombre} <span className="text-xs font-normal text-tinta-suave">· {NIVEL_TEXTO[a.nivel]}</span></p>
                    <ul className="mt-1 list-disc pl-4 text-xs text-tinta-suave">{compsDe(a.id).map((c) => <li key={c.id}>{c.nombre}</li>)}</ul>
                  </div>
                  <Boton variante="vidrio" icono={Pencil} className="!min-h-9 !px-3" onClick={() => setEditando(a)}>Editar</Boton>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-tinta-suave">Después de crearlo, asígnelo a un docente en Configuración, Personal. Se califica por competencia, igual que las demás áreas.</p>
        </Tarjeta>

        {niveles.map((n) => (
          <Tarjeta key={n} className="aparecer space-y-2 p-5">
            <h2 className="font-bold">Currículo nacional · {NIVEL_TEXTO[n]}</h2>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {datos.areas.filter((a) => !a.colegio_id && a.nivel === n).sort((a, b) => a.orden - b.orden).map((a) => (
                <p key={a.id} className="rounded-xl bg-white/45 px-3 py-2 text-sm ring-1 ring-white/80">
                  <span className="font-semibold">{a.nombre}</span>
                  <span className="text-xs text-tinta-suave"> · {compsDe(a.id).length} {compsDe(a.id).length === 1 ? "competencia" : "competencias"}</span>
                </p>
              ))}
            </div>
          </Tarjeta>
        ))}
      </Contenido>
      {editando && <EditorTaller area={editando} niveles={niveles} competencias={editando === "nueva" ? [] : compsDe(editando.id)}
        ordenSiguiente={100 + propias.length} onCerrar={() => setEditando(null)} />}
    </>
  );
}

function EditorTaller({ area, niveles, competencias, ordenSiguiente, onCerrar }: {
  area: Area | "nueva"; niveles: Nivel[]; competencias: Competencia[]; ordenSiguiente: number; onCerrar(): void;
}) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const base = area === "nueva" ? null : area;
  const [nombre, setNombre] = useState(base?.nombre ?? "");
  const [nivel, setNivel] = useState<Nivel>(base?.nivel ?? niveles[niveles.length - 1] ?? "secundaria");
  const [comps, setComps] = useState<{ id?: string; nombre: string }[]>(competencias.length ? competencias.map((c) => ({ id: c.id, nombre: c.nombre })) : [{ nombre: "" }]);
  const [guardando, setGuardando] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const valido = nombre.trim().length >= 3 && comps.some((c) => c.nombre.trim());

  const guardarTodo = async () => {
    setGuardando(true);
    try {
      const id = base?.id ?? nuevoId();
      const siglas = nombre.normalize("NFD").replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean).map((p) => p[0]).join("").toUpperCase().slice(0, 6);
      const codigo = base?.codigo ?? (siglas || "TALLER");
      const escrituras: Escritura[] = [{ tabla: "area", datos: { id, nivel, codigo, nombre: nombre.trim(), opcional: true, orden: base?.orden ?? ordenSiguiente } }];
      const vivasNuevas = comps.filter((c) => c.nombre.trim());
      // Los números 101+ no chocan con las 31 competencias del CNEB (no tienen capacidades oficiales).
      vivasNuevas.forEach((c, i) => escrituras.push({ tabla: "competencia", datos: { id: c.id ?? nuevoId(), area_id: id, numero: 101 + i, nombre: c.nombre.trim(), orden: i + 1 } }));
      for (const c of competencias) if (!vivasNuevas.some((x) => x.id === c.id)) escrituras.push({ tabla: "competencia", datos: { id: c.id, eliminado: true } });
      await guardarLote(db, escrituras, colegioId);
      avisar(textoGuardado(base ? "Taller actualizado" : "Taller creado"));
      onCerrar();
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!base) return;
    await guardarLote(db, [{ tabla: "area", datos: { id: base.id, eliminado: true } }, ...competencias.map((c) => ({ tabla: "competencia" as const, datos: { id: c.id, eliminado: true } }))], colegioId);
    avisar(textoGuardado("Taller eliminado"));
    onCerrar();
  };

  if (borrar) {
    return (
      <Dialogo abierto titulo="Eliminar taller" onCerrar={() => setBorrar(false)}
        acciones={<><Boton variante="fantasma" onClick={() => setBorrar(false)}>Cancelar</Boton><Boton icono={Trash2} onClick={eliminar}>Eliminar</Boton></>}>
        <p className="pt-1 text-sm text-tinta">"{base?.nombre}" dejará de aparecer para asignar y calificar. Las notas ya registradas se conservan en el historial.</p>
      </Dialogo>
    );
  }

  return (
    <Dialogo abierto titulo={base ? "Editar taller" : "Nuevo taller o área propia"} onCerrar={onCerrar}
      acciones={<>
        {base && <Boton variante="fantasma" icono={Trash2} onClick={() => setBorrar(true)}>Eliminar</Boton>}
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        <Boton icono={Save} cargando={guardando} disabled={!valido} onClick={guardarTodo}>Guardar</Boton>
      </>}>
      <div className="space-y-3 pt-2 text-tinta">
        <Campo etiqueta="Nombre"><Entrada value={nombre} onChange={(ev) => setNombre(ev.target.value)} placeholder="Taller de Oratoria" autoFocus /></Campo>
        {niveles.length > 1 && !base && (
          <Segmentado etiqueta="Nivel" valor={nivel} onCambio={setNivel} opciones={niveles.map((n) => ({ valor: n, texto: NIVEL_TEXTO[n] }))} />
        )}
        <div className="space-y-2">
          <p className="text-sm font-semibold">Competencias que se evalúan</p>
          {comps.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-xs font-bold text-tinta-suave">{i + 1}.</span>
              <Entrada value={c.nombre} onChange={(ev) => setComps(comps.map((x, k) => (k === i ? { ...x, nombre: ev.target.value } : x)))}
                placeholder="Se expresa en público con claridad y seguridad" aria-label={`Competencia ${i + 1}`} />
              {comps.length > 1 && (
                <button type="button" onClick={() => setComps(comps.filter((_, k) => k !== i))} className="rounded-full p-2 text-red-700 hover:bg-white/70" aria-label={`Quitar competencia ${i + 1}`}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          ))}
          <Boton variante="vidrio" icono={Plus} onClick={() => setComps([...comps, { nombre: "" }])}>Agregar competencia</Boton>
        </div>
      </div>
    </Dialogo>
  );
}
