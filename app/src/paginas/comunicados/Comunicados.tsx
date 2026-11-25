import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCheck, Megaphone, Plus, Send } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { anioActivo, seccionesDetalle } from "@/datos/consultas";
import { guardar, guardarLote, vivas } from "@/db/repositorio";
import type { Comunicado } from "@/db/tipos";
import { idDeterministico } from "@/dominio/notas";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Boton, Contenido, Dialogo, Encabezado, Gema, Tarjeta, cx, orden } from "@/ui/componentes";
import { Campo, Entrada, Segmentado, Selector, Vacio } from "@/ui/formulario";

const fecha = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });

export function Comunicados() {
  const { usuario, colegioId } = useApp();
  const [creando, setCreando] = useState(false);
  const [lectoresDe, setLectoresDe] = useState<Comunicado | null>(null);
  const nuevosAlAbrir = useRef<Set<string> | null>(null);
  const esGestion = !!usuario?.roles.some((r) => r === "director" || r === "subdirector");
  const puedePublicar = esGestion || !!usuario?.roles.includes("tutor");

  const datos = useLiveQuery(async () => {
    if (!usuario) return null;
    const lista = vivas(await db.tabla("comunicado").toArray()).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
    const lecturas = vivas(await db.tabla("comunicado_lectura").toArray());
    const anio = await anioActivo();
    const secciones = anio ? await seccionesDetalle(anio.id) : [];
    const usuarios = new Map((await db.tabla("usuario").toArray()).map((u) => [u.id, u]));
    return { lista, lecturas, secciones, usuarios };
  }, [usuario?.id]);

  // Al abrir la página se registran como leídos los comunicados que el usuario no había visto.
  useEffect(() => {
    if (!datos || !usuario || nuevosAlAbrir.current) return;
    const leidos = new Set(datos.lecturas.filter((l) => l.usuario_id === usuario.id).map((l) => l.comunicado_id));
    const nuevos = datos.lista.filter((c) => c.autor_id !== usuario.id && !leidos.has(c.id));
    nuevosAlAbrir.current = new Set(nuevos.map((c) => c.id));
    if (!nuevos.length) return;
    const t = setTimeout(async () => {
      const ahora = new Date().toISOString();
      const escrituras = await Promise.all(nuevos.map(async (c) => ({
        tabla: "comunicado_lectura" as const,
        datos: { id: await idDeterministico("lectura", c.id, usuario.id), comunicado_id: c.id, usuario_id: usuario.id, leido_en: ahora },
      })));
      await guardarLote(db, escrituras, colegioId);
    }, 1500);
    return () => clearTimeout(t);
  }, [datos, usuario, colegioId]);

  if (!datos || !usuario) return null;
  const nombreSeccion = (id: string | null) => datos.secciones.find((s) => s.id === id)?.nombre ?? "Sección";

  return (
    <>
      <Encabezado etiqueta="Comunicación" titulo="Comunicados"
        accion={puedePublicar ? <Boton icono={Plus} onClick={() => setCreando(true)}>Nuevo</Boton> : undefined} />
      <Contenido ancho="max-w-3xl">
        {datos.lista.length === 0 ? <Vacio icono={Megaphone} tono="tono-ambar" titulo="No hay comunicados" /> : (
          <div className="space-y-3">
            {datos.lista.map((c, i) => {
              const autor = datos.usuarios.get(c.autor_id);
              const lectores = datos.lecturas.filter((l) => l.comunicado_id === c.id).length;
              const verLecturas = c.autor_id === usuario.id || esGestion;
              const nuevo = nuevosAlAbrir.current?.has(c.id);
              return (
                <Tarjeta key={c.id} className={cx("aparecer p-5", nuevo && "ring-2 ring-amber-300/80")} style={orden(Math.min(i + 1, 6))}>
                  <div className="flex items-start gap-3">
                    <Gema icono={Megaphone} tono="tono-ambar" tam="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold">{c.titulo}</h2>
                        {nuevo && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold text-amber-800">Nuevo</span>}
                      </div>
                      <p className="text-xs text-tinta-suave">
                        {fecha(c.fecha)} · {autor ? `${autor.nombres} ${autor.apellidos}` : ""} · {c.destino === "todos" ? "Para todo el colegio" : `Para ${nombreSeccion(c.seccion_id)}`}
                      </p>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.cuerpo}</p>
                      {verLecturas && (
                        <button onClick={() => setLectoresDe(c)} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold ring-1 ring-white hover:bg-white">
                          <CheckCheck className="h-3.5 w-3.5 text-blue-600" aria-hidden /> Leído por {lectores} {lectores === 1 ? "persona" : "personas"}
                        </button>
                      )}
                    </div>
                  </div>
                </Tarjeta>
              );
            })}
          </div>
        )}
      </Contenido>
      {creando && <DialogoComunicado esGestion={esGestion} secciones={datos.secciones.filter((s) => esGestion || s.tutor_id === usuario.id)} onCerrar={() => setCreando(false)} />}
      {lectoresDe && (
        <Dialogo abierto titulo="Quiénes lo leyeron" onCerrar={() => setLectoresDe(null)} acciones={<Boton onClick={() => setLectoresDe(null)}>Cerrar</Boton>}>
          <ul className="max-h-[50dvh] space-y-1 overflow-y-auto text-tinta">
            {datos.lecturas.filter((l) => l.comunicado_id === lectoresDe.id).sort((a, b) => a.leido_en.localeCompare(b.leido_en)).map((l) => {
              const u = datos.usuarios.get(l.usuario_id);
              return <li key={l.id} className="flex justify-between gap-2 text-sm"><span>{u ? `${u.apellidos}, ${u.nombres}` : "Usuario"}</span><span className="text-xs text-tinta-suave">{new Date(l.leido_en).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}</span></li>;
            })}
          </ul>
        </Dialogo>
      )}
    </>
  );
}

function DialogoComunicado({ esGestion, secciones, onCerrar }: { esGestion: boolean; secciones: { id: string; nombreLargo: string }[]; onCerrar(): void }) {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const [destino, setDestino] = useState<Comunicado["destino"]>(esGestion ? "todos" : "seccion");
  const [seccionId, setSeccionId] = useState(secciones[0]?.id ?? "");
  const [f, setF] = useState({ titulo: "", cuerpo: "" });
  const publicar = async () => {
    await guardar(db, "comunicado", {
      autor_id: usuario!.id, titulo: f.titulo.trim(), cuerpo: f.cuerpo.trim(), destino,
      seccion_id: destino === "seccion" ? seccionId : null, fecha: new Date().toISOString().slice(0, 10),
    }, colegioId);
    avisar(textoGuardado("Comunicado publicado"));
    onCerrar();
  };
  return (
    <Dialogo abierto titulo="Nuevo comunicado" onCerrar={onCerrar}
      acciones={<><Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton><Boton icono={Send} onClick={publicar} disabled={!f.titulo.trim() || !f.cuerpo.trim() || (destino === "seccion" && !seccionId)}>Publicar</Boton></>}>
      <div className="space-y-3 pt-2 text-tinta">
        {esGestion && <Segmentado etiqueta="Destino" valor={destino} onCambio={setDestino} opciones={[{ valor: "todos", texto: "Todo el colegio" }, { valor: "seccion", texto: "Una sección" }]} />}
        {destino === "seccion" && (
          <Campo etiqueta="Sección">
            <Selector value={seccionId} onChange={(e) => setSeccionId(e.target.value)}>{secciones.map((s) => <option key={s.id} value={s.id}>{s.nombreLargo}</option>)}</Selector>
          </Campo>
        )}
        <Campo etiqueta="Título"><Entrada value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} maxLength={120} autoFocus /></Campo>
        <Campo etiqueta="Mensaje"><textarea value={f.cuerpo} onChange={(e) => setF({ ...f, cuerpo: e.target.value })} rows={6} className="campo" /></Campo>
        <p className="text-xs">Lo verán {destino === "todos" ? "todos los usuarios del colegio" : "el personal, los estudiantes y las familias de la sección"} en su siguiente sincronización.</p>
      </div>
    </Dialogo>
  );
}
