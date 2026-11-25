import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, CloudOff, CloudUpload, FileText, Paperclip, Trash2 } from "lucide-react";
import { almacen, db, useApp } from "@/app/contexto";
import { adjuntarEvidencia, tamano } from "@/datos/evidencias";
import { guardar, vivas } from "@/db/repositorio";
import type { EntidadEvidencia, Evidencia } from "@/db/tipos";
import { obtenerArchivo } from "@/sync/archivos";
import { textoGuardado, useAvisar } from "./avisos";
import { Boton, Dialogo, cx } from "./componentes";

/** Lista de evidencias (fotos y archivos) de un registro, con opción de adjuntar. */
export function Evidencias({ entidad, entidadId, estudianteId = null, editable = true }: {
  entidad: EntidadEvidencia; entidadId: string; estudianteId?: string | null; editable?: boolean;
}) {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const foto = useRef<HTMLInputElement>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [viendo, setViendo] = useState<Evidencia | null>(null);

  const datos = useLiveQuery(async () => {
    const evs = vivas(await db.tabla("evidencia").where("[entidad+entidad_id]").equals([entidad, entidadId]).toArray());
    const locales = await db.archivo.bulkGet(evs.map((e) => e.id));
    return evs.map((e, i) => ({ e, local: locales[i] }));
  }, [entidad, entidadId], []);

  const adjuntar = async (ev: ChangeEvent<HTMLInputElement>) => {
    const archivos = [...(ev.target.files ?? [])];
    ev.target.value = "";
    if (!archivos.length || !usuario) return;
    setSubiendo(true);
    try {
      for (const a of archivos) {
        await adjuntarEvidencia({ archivo: a, entidad, entidadId, estudianteId, autorId: usuario.id, colegioId });
      }
      avisar(textoGuardado(archivos.length === 1 ? "Evidencia adjuntada" : `${archivos.length} evidencias adjuntadas`));
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="space-y-2">
      {datos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {datos.map(({ e, local }) => (
            <Miniatura key={e.id} ev={e} blob={local?.blob ?? null} pendiente={local?.subido === 0} onAbrir={() => setViendo(e)} />
          ))}
        </div>
      )}
      {editable && (
        <div className="flex flex-wrap gap-2">
          <input ref={foto} type="file" accept="image/*" capture="environment" className="sr-only" onChange={adjuntar} aria-hidden tabIndex={-1} />
          <input ref={archivo} type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={adjuntar} aria-hidden tabIndex={-1} />
          <Boton type="button" variante="vidrio" icono={Camera} className="!min-h-10 !px-4 text-xs" cargando={subiendo} onClick={() => foto.current?.click()}>Tomar foto</Boton>
          <Boton type="button" variante="fantasma" icono={Paperclip} className="!min-h-10 !px-3 text-xs" disabled={subiendo} onClick={() => archivo.current?.click()}>Adjuntar archivo</Boton>
        </div>
      )}
      {viendo && <Visor ev={viendo} puedeBorrar={viendo.autor_id === usuario?.id} onCerrar={() => setViendo(null)}
        onBorrar={async () => { await guardar(db, "evidencia", { id: viendo.id, eliminado: true }, colegioId); setViendo(null); avisar(textoGuardado("Evidencia quitada")); }} />}
    </div>
  );
}

function useUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

function Miniatura({ ev, blob, pendiente, onAbrir }: { ev: Evidencia; blob: Blob | null; pendiente: boolean; onAbrir(): void }) {
  const url = useUrl(ev.tipo.startsWith("image/") ? blob : null);
  return (
    <button type="button" onClick={onAbrir} aria-label={`Ver ${ev.nombre}`}
      className="group relative aspect-square overflow-hidden rounded-2xl bg-white/60 ring-1 ring-white transition hover:ring-blue-400">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" />
        : <span className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-[0.65rem] text-tinta-suave">
            <FileText className="h-6 w-6" aria-hidden /> <span className="line-clamp-2 break-all">{ev.nombre}</span>
          </span>}
      {pendiente && (
        <span className="absolute bottom-1 right-1 rounded-full bg-sky-500 p-1 text-white shadow" title="Se subirá al haber conexión">
          <CloudUpload className="h-3 w-3" aria-hidden />
        </span>
      )}
    </button>
  );
}

function Visor({ ev, puedeBorrar, onCerrar, onBorrar }: { ev: Evidencia; puedeBorrar: boolean; onCerrar(): void; onBorrar(): void }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "sin-conexion" | "no-subido">("cargando");
  useEffect(() => {
    let vivo = true;
    obtenerArchivo(db, almacen, ev)
      .then((b) => vivo && (b ? (setBlob(b), setEstado("listo")) : setEstado(ev.ruta ? "sin-conexion" : "no-subido")))
      .catch(() => vivo && setEstado("sin-conexion"));
    return () => { vivo = false; };
  }, [ev]);
  const url = useUrl(blob);

  return (
    <Dialogo abierto titulo={ev.nombre} onCerrar={onCerrar}
      acciones={<>
        {puedeBorrar && <Boton variante="fantasma" icono={Trash2} className="mr-auto text-red-700" onClick={onBorrar}>Quitar</Boton>}
        {url && !ev.tipo.startsWith("image/") && <a href={url} target="_blank" rel="noreferrer"><Boton variante="vidrio">Abrir</Boton></a>}
        <Boton onClick={onCerrar}>Cerrar</Boton>
      </>}>
      <p className="mb-2 text-xs">{tamano(ev.bytes)}</p>
      {estado === "cargando" && <div className="aspect-video animate-pulse rounded-2xl bg-white/60" />}
      {estado === "listo" && url && ev.tipo.startsWith("image/") && <img src={url} alt={ev.nombre} className="max-h-[60dvh] w-full rounded-2xl object-contain" />}
      {estado === "listo" && !ev.tipo.startsWith("image/") && <p className="flex items-center gap-2"><FileText className="h-5 w-5" aria-hidden /> Archivo listo para abrir.</p>}
      {(estado === "sin-conexion" || estado === "no-subido") && (
        <p className={cx("flex items-center gap-2 rounded-2xl bg-amber-50/70 p-3 text-amber-900 ring-1 ring-amber-200")}>
          <CloudOff className="h-5 w-5" aria-hidden />
          {estado === "no-subido" ? "Aún no se sube desde el equipo de quien la adjuntó." : "Conéctese a internet para descargarla."}
        </p>
      )}
    </Dialogo>
  );
}
