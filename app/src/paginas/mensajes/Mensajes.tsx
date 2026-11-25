// Mensajes directos entre el personal (docente, tutor, dirección) y la familia de un estudiante.
// Cada conversación es sobre un estudiante; solo la leen sus participantes. Funciona sin conexión.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, MessageSquare, Plus, Send } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { anioActivo, matriculaActual, nombreCompleto, seccionesDetalle } from "@/datos/consultas";
import { useHijos } from "@/datos/familia";
import { nuevoId } from "@/db/local";
import { guardar, vivas } from "@/db/repositorio";
import type { Estudiante, Mensaje, Usuario } from "@/db/tipos";
import { ahoraServidor } from "@/sync/reloj";
import { useAvisar } from "@/ui/avisos";
import { Boton, Contenido, Dialogo, Encabezado, Tarjeta, cx } from "@/ui/componentes";
import { Buscador, Vacio } from "@/ui/formulario";

interface Conversacion { estudianteId: string; personalId: string }
const corto = (u?: Usuario) => (u ? `${u.nombres.split(" ")[0]} ${u.apellidos.split(" ")[0]}` : "");
const hora = (iso: string) => new Date(iso).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function Mensajes() {
  const { usuario } = useApp();
  const { hijos } = useHijos(usuario);
  const esFamilia = !!usuario?.roles.includes("apoderado");
  const [abierta, setAbierta] = useState<Conversacion | null>(null);
  const [nueva, setNueva] = useState(false);

  const datos = useLiveQuery(async () => {
    if (!usuario) return null;
    const mensajes = vivas(await db.tabla("mensaje").toArray());
    const usuarios = new Map((await db.tabla("usuario").toArray()).map((u) => [u.id, u]));
    const estudiantes = new Map((await db.tabla("estudiante").toArray()).map((e) => [e.id, e]));
    // Contactos de la familia: tutor y docentes de la sección de cada hijo.
    const contactos: { estudiante: Estudiante; personal: Usuario; rol: string }[] = [];
    if (esFamilia) {
      const anio = await anioActivo();
      const secciones = anio ? await seccionesDetalle(anio.id) : [];
      const asig = vivas(await db.tabla("docente_asignacion").toArray());
      const areas = new Map((await db.tabla("area").toArray()).map((a) => [a.id, a.nombre]));
      for (const h of hijos ?? []) {
        const m = await matriculaActual(h.id);
        const sec = secciones.find((s) => s.id === m?.seccion_id);
        if (!sec) continue;
        if (sec.tutor_id && usuarios.get(sec.tutor_id)) contactos.push({ estudiante: h, personal: usuarios.get(sec.tutor_id)!, rol: "Tutor(a)" });
        for (const a of asig.filter((x) => x.seccion_id === sec.id && x.docente_id !== sec.tutor_id)) {
          const u = usuarios.get(a.docente_id);
          if (u && !contactos.some((c) => c.estudiante.id === h.id && c.personal.id === u.id)) contactos.push({ estudiante: h, personal: u, rol: areas.get(a.area_id) ?? "Docente" });
        }
      }
    }
    return { mensajes, usuarios, estudiantes, contactos };
  }, [usuario?.id, esFamilia, hijos?.map((h) => h.id).join()]);

  const conversaciones = useMemo(() => {
    if (!datos || !usuario) return [];
    const grupos = new Map<string, Mensaje[]>();
    for (const m of datos.mensajes) {
      const k = `${m.estudiante_id}|${m.personal_id}`;
      grupos.set(k, [...(grupos.get(k) ?? []), m]);
    }
    return [...grupos.entries()].map(([k, ms]) => {
      const [estudianteId, personalId] = k.split("|");
      const ultimo = ms.sort((a, b) => a.enviado_en.localeCompare(b.enviado_en))[ms.length - 1];
      return { estudianteId, personalId, ultimo, sinLeer: ms.filter((m) => m.autor_id !== usuario.id && !m.leido_en).length };
    }).sort((a, b) => b.ultimo.enviado_en.localeCompare(a.ultimo.enviado_en));
  }, [datos, usuario]);

  if (!datos || !usuario) return null;
  if (abierta) return <Hilo conv={abierta} datos={datos} onVolver={() => setAbierta(null)} />;

  const titulo = (c: Conversacion) => {
    const est = datos.estudiantes.get(c.estudianteId);
    return esFamilia ? `${corto(datos.usuarios.get(c.personalId))} · sobre ${est?.nombres.split(" ")[0] ?? ""}` : `Familia de ${est ? nombreCompleto(est) : "estudiante"}`;
  };
  const sinConversacion = esFamilia ? datos.contactos.filter((c) => !conversaciones.some((x) => x.estudianteId === c.estudiante.id && x.personalId === c.personal.id)) : [];

  return (
    <>
      <Encabezado etiqueta="Comunicación" titulo="Mensajes" subtitulo={esFamilia ? "Escriba directamente al tutor o a los docentes de su hijo(a)." : "Converse con las familias de sus estudiantes."}
        accion={!esFamilia ? <Boton icono={Plus} onClick={() => setNueva(true)}>Nuevo mensaje</Boton> : undefined} />
      <Contenido ancho="max-w-3xl">
        {conversaciones.length > 0 && (
          <Tarjeta className="aparecer divide-y divide-white/70 overflow-hidden">
            {conversaciones.map((c) => (
              <button key={`${c.estudianteId}|${c.personalId}`} onClick={() => setAbierta(c)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/40">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/70 ring-1 ring-white"><MessageSquare className="h-5 w-5 text-teal-700" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{titulo(c)}</span>
                  <span className="block truncate text-sm text-tinta-suave">{c.ultimo.autor_id === usuario.id ? "Usted: " : ""}{c.ultimo.texto}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="text-[0.65rem] text-tinta-suave">{hora(c.ultimo.enviado_en)}</span>
                  {c.sinLeer > 0 && <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[0.65rem] font-bold text-white">{c.sinLeer}</span>}
                </span>
              </button>
            ))}
          </Tarjeta>
        )}
        {esFamilia && sinConversacion.length > 0 && (
          <section className="space-y-2">
            <h2 className="etiqueta px-1">Escribir a</h2>
            <Tarjeta className="divide-y divide-white/70 overflow-hidden">
              {sinConversacion.map((c) => (
                <button key={`${c.estudiante.id}|${c.personal.id}`} onClick={() => setAbierta({ estudianteId: c.estudiante.id, personalId: c.personal.id })}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/40">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{c.personal.nombres} {c.personal.apellidos}</span>
                    <span className="block text-xs text-tinta-suave">{c.rol} de {c.estudiante.nombres.split(" ")[0]}</span>
                  </span>
                  <Send className="h-4 w-4 text-tinta-suave" aria-hidden />
                </button>
              ))}
            </Tarjeta>
          </section>
        )}
        {conversaciones.length === 0 && (!esFamilia || sinConversacion.length === 0) && (
          <Vacio icono={MessageSquare} tono="tono-cielo" titulo="Todavía no hay mensajes">
            {esFamilia ? "Cuando su hijo(a) tenga tutor y docentes asignados, podrá escribirles desde aquí." : "Use \"Nuevo mensaje\" para escribir a la familia de un estudiante."}
          </Vacio>
        )}
      </Contenido>
      {nueva && <ElegirEstudiante onElegir={(id) => { setNueva(false); setAbierta({ estudianteId: id, personalId: usuario.id }); }} onCerrar={() => setNueva(false)} />}
    </>
  );
}

function Hilo({ conv, datos, onVolver }: {
  conv: Conversacion; datos: { mensajes: Mensaje[]; usuarios: Map<string, Usuario>; estudiantes: Map<string, Estudiante> }; onVolver(): void;
}) {
  const { usuario, colegioId } = useApp();
  const avisar = useAvisar();
  const [texto, setTexto] = useState("");
  const fin = useRef<HTMLDivElement>(null);
  const mensajes = datos.mensajes.filter((m) => m.estudiante_id === conv.estudianteId && m.personal_id === conv.personalId)
    .sort((a, b) => a.enviado_en.localeCompare(b.enviado_en));
  const est = datos.estudiantes.get(conv.estudianteId);
  const otro = usuario?.id === conv.personalId ? `Familia de ${est?.nombres ?? ""}` : `${datos.usuarios.get(conv.personalId)?.nombres ?? ""} ${datos.usuarios.get(conv.personalId)?.apellidos ?? ""}`;

  // Al abrir, los mensajes recibidos quedan como leídos.
  useEffect(() => {
    const pendientes = mensajes.filter((m) => m.autor_id !== usuario?.id && !m.leido_en);
    if (pendientes.length) void Promise.all(pendientes.map((m) => guardar(db, "mensaje", { id: m.id, leido_en: new Date(ahoraServidor()).toISOString() }, colegioId)));
    fin.current?.scrollIntoView({ block: "end" });
  }, [mensajes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!texto.trim() || !usuario) return;
    try {
      await guardar(db, "mensaje", {
        id: nuevoId(), estudiante_id: conv.estudianteId, personal_id: conv.personalId, autor_id: usuario.id,
        texto: texto.trim(), enviado_en: new Date(ahoraServidor()).toISOString(), leido_en: null,
      }, colegioId);
      setTexto("");
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    }
  };

  return (
    <>
      <Encabezado etiqueta={est ? `Sobre ${nombreCompleto(est)}` : "Mensajes"} titulo={otro}
        accion={<Boton variante="vidrio" icono={ArrowLeft} onClick={onVolver}>Mensajes</Boton>} />
      <Contenido ancho="max-w-3xl">
        <Tarjeta className="aparecer space-y-2 p-4">
          {mensajes.length === 0 && <p className="py-6 text-center text-sm text-tinta-suave">Escriba el primer mensaje. Solo lo verán usted y {usuario?.id === conv.personalId ? "la familia del estudiante" : "esta persona"}.</p>}
          {mensajes.map((m) => {
            const mio = m.autor_id === usuario?.id;
            return (
              <div key={m.id} className={cx("flex", mio ? "justify-end" : "justify-start")}>
                <div className={cx("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm", mio ? "rounded-br-md bg-teal-600 text-white" : "rounded-bl-md bg-white/85 text-tinta ring-1 ring-white")}>
                  {!mio && <p className="text-[0.7rem] font-bold opacity-70">{corto(datos.usuarios.get(m.autor_id))}</p>}
                  <p className="whitespace-pre-line">{m.texto}</p>
                  <p className={cx("mt-0.5 text-right text-[0.65rem]", mio ? "text-white/75" : "text-tinta-suave")}>{hora(m.enviado_en)}{mio && m.leido_en ? " · Leído" : ""}</p>
                </div>
              </div>
            );
          })}
          <div ref={fin} />
        </Tarjeta>
        <form onSubmit={enviar} className="vidrio sticky bottom-24 flex items-end gap-2 p-2 lg:bottom-4">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={1} maxLength={2000} placeholder="Escriba un mensaje"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
            className="campo max-h-40 min-h-11 flex-1 resize-y !py-2.5" aria-label="Mensaje" />
          <Boton type="submit" icono={Send} disabled={!texto.trim()}>Enviar</Boton>
        </form>
      </Contenido>
    </>
  );
}

function ElegirEstudiante({ onElegir, onCerrar }: { onElegir(id: string): void; onCerrar(): void }) {
  const { usuario } = useApp();
  const [buscar, setBuscar] = useState("");
  const lista = useLiveQuery(async () => {
    if (!usuario) return [];
    const anio = await anioActivo();
    const secciones = anio ? await seccionesDetalle(anio.id) : [];
    const gestion = usuario.roles.some((r) => r === "director" || r === "subdirector");
    const asig = vivas(await db.tabla("docente_asignacion").where("docente_id").equals(usuario.id).toArray());
    const mias = secciones.filter((s) => gestion || s.tutor_id === usuario.id || asig.some((a) => a.seccion_id === s.id));
    const mats = vivas(await db.tabla("matricula").toArray()).filter((m) => m.estado === "matriculado" && mias.some((s) => s.id === m.seccion_id));
    const ests = vivas((await db.tabla("estudiante").bulkGet(mats.map((m) => m.estudiante_id))).filter((e): e is Estudiante => !!e));
    return ests.map((e) => ({ e, seccion: mias.find((s) => s.id === mats.find((m) => m.estudiante_id === e.id)?.seccion_id)?.nombre ?? "" }))
      .sort((a, b) => a.e.apellidos.localeCompare(b.e.apellidos));
  }, [usuario?.id]);
  const filtrados = (lista ?? []).filter((x) => nombreCompleto(x.e).toLowerCase().includes(buscar.toLowerCase()));
  return (
    <Dialogo abierto titulo="¿A qué familia escribe?" onCerrar={onCerrar} acciones={<Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>}>
      <div className="space-y-2 pt-2 text-tinta">
        <Buscador valor={buscar} onCambio={setBuscar} placeholder="Buscar estudiante" />
        <div className="max-h-80 divide-y divide-white/70 overflow-y-auto rounded-2xl bg-white/40">
          {filtrados.map(({ e, seccion }) => (
            <button key={e.id} onClick={() => onElegir(e.id)} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-white/60">
              <span className="font-semibold">{nombreCompleto(e)}</span><span className="text-xs text-tinta-suave">{seccion}</span>
            </button>
          ))}
          {!filtrados.length && <p className="px-3 py-4 text-sm text-tinta-suave">No hay estudiantes con ese nombre.</p>}
        </div>
      </div>
    </Dialogo>
  );
}
