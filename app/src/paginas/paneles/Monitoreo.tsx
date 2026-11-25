import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CircleCheck, Eye, Plus, Send } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { guardar, vivas } from "@/db/repositorio";
import type { CategoriaMonitoreo, ObservacionMonitoreo } from "@/db/tipos";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Boton, Contenido, Dialogo, Encabezado, Gema, Tarjeta, cx, orden } from "@/ui/componentes";
import { Campo, Segmentado, Selector, Vacio } from "@/ui/formulario";

const CATEGORIA: Record<CategoriaMonitoreo, string> = {
  pedagogica: "Pedagógica", gestion: "Gestión", convivencia: "Convivencia", asistencia: "Asistencia", infraestructura: "Infraestructura",
};
const fecha = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });

/** Observaciones de monitoreo: la UGEL las registra y la dirección responde. */
export function Monitoreo() {
  const { usuario } = useApp();
  const esUgel = !!usuario?.roles.includes("ugel");
  const [filtro, setFiltro] = useState<"pendiente" | "atendida" | "todas">("pendiente");
  const [creando, setCreando] = useState(false);
  const datos = useLiveQuery(async () => ({
    lista: vivas(await db.tabla("observacion_monitoreo").toArray()).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    usuarios: new Map((await db.tabla("usuario").toArray()).map((u) => [u.id, u])),
  }));
  if (!datos) return null;
  const lista = datos.lista.filter((o) => filtro === "todas" || o.estado === filtro);
  const pendientes = datos.lista.filter((o) => o.estado === "pendiente").length;

  return (
    <>
      <Encabezado etiqueta={esUgel ? "Supervisión UGEL" : "Dirección"} titulo="Monitoreo"
        subtitulo={esUgel ? "Registre observaciones para la dirección del colegio." : "Observaciones de la UGEL y sus respuestas."}
        accion={esUgel ? <Boton icono={Plus} onClick={() => setCreando(true)}>Nueva</Boton> : undefined} />
      <Contenido ancho="max-w-3xl">
        <Segmentado etiqueta="Filtro" valor={filtro} onCambio={setFiltro} opciones={[
          { valor: "pendiente", texto: `Pendientes (${pendientes})` }, { valor: "atendida", texto: "Atendidas" }, { valor: "todas", texto: "Todas" },
        ]} />
        {lista.length === 0 ? (
          <Vacio icono={Eye} tono="tono-lila" titulo={filtro === "pendiente" ? "No hay observaciones pendientes" : "Sin observaciones"} />
        ) : lista.map((o, i) => <TarjetaMonitoreo key={o.id} o={o} i={i} esUgel={esUgel} autor={datos.usuarios.get(o.autor_id)?.nombres} />)}
      </Contenido>
      {creando && <DialogoMonitoreo onCerrar={() => setCreando(false)} />}
    </>
  );
}

function TarjetaMonitoreo({ o, i, esUgel, autor }: { o: ObservacionMonitoreo; i: number; esUgel: boolean; autor?: string }) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [respuesta, setRespuesta] = useState("");
  const responder = async () => {
    await guardar(db, "observacion_monitoreo", { id: o.id, respuesta: respuesta.trim(), estado: "atendida" }, colegioId);
    avisar(textoGuardado("Respuesta enviada a la UGEL"));
  };
  return (
    <Tarjeta className="aparecer space-y-3 p-4" style={orden(Math.min(i + 1, 6))}>
      <div className="flex items-start gap-3">
        <Gema icono={o.estado === "atendida" ? CircleCheck : Eye} tono={o.estado === "atendida" ? "tono-musgo" : "tono-lila"} tam="sm" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sup/70 px-2.5 py-0.5 text-[0.65rem] font-bold ring-1 ring-sup">{CATEGORIA[o.categoria] ?? o.categoria}</span>
            <span className={cx("rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold", o.estado === "atendida" ? "bg-emerald-100/80 text-emerald-800" : "bg-amber-100/80 text-amber-800")}>
              {o.estado === "atendida" ? "Atendida" : "Pendiente"}
            </span>
          </div>
          <p className="mt-1 text-xs text-tinta-suave">{fecha(o.fecha)}{autor && ` · ${autor} (UGEL)`}</p>
          <p className="mt-1.5 whitespace-pre-line">{o.texto}</p>
          {o.respuesta && (
            <div className="mt-2 rounded-2xl bg-sup/55 p-3 ring-1 ring-sup">
              <p className="text-xs font-semibold text-blue-700">Respuesta de la dirección{o.respondido_en && ` · ${new Date(o.respondido_en).toLocaleDateString("es-PE")}`}</p>
              <p className="whitespace-pre-line">{o.respuesta}</p>
            </div>
          )}
        </div>
      </div>
      {!esUgel && o.estado === "pendiente" && (
        <div className="space-y-2">
          <textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={3} className="campo" placeholder="Acciones tomadas por la dirección" aria-label="Respuesta a la UGEL" />
          <div className="flex justify-end"><Boton icono={Send} onClick={responder} disabled={respuesta.trim().length < 5}>Responder y marcar atendida</Boton></div>
        </div>
      )}
    </Tarjeta>
  );
}

function DialogoMonitoreo({ onCerrar }: { onCerrar(): void }) {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const [categoria, setCategoria] = useState<CategoriaMonitoreo>("pedagogica");
  const [texto, setTexto] = useState("");
  const registrar = async () => {
    await guardar(db, "observacion_monitoreo", {
      autor_id: usuario!.id, fecha: new Date().toISOString().slice(0, 10), texto: texto.trim(), estado: "pendiente", categoria, respuesta: null,
    }, colegioId);
    avisar(textoGuardado("Observación enviada a la dirección"));
    onCerrar();
  };
  return (
    <Dialogo abierto titulo="Nueva observación de monitoreo" onCerrar={onCerrar}
      acciones={<><Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton><Boton icono={Send} onClick={registrar} disabled={texto.trim().length < 10}>Enviar</Boton></>}>
      <div className="space-y-3 pt-2 text-tinta">
        <Campo etiqueta="Categoría">
          <Selector value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaMonitoreo)}>
            {Object.entries(CATEGORIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selector>
        </Campo>
        <Campo etiqueta="Observación"><textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} className="campo" autoFocus /></Campo>
      </div>
    </Dialogo>
  );
}
