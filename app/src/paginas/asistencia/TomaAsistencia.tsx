import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { CircleCheck, CircleAlert, ClipboardCheck, IdCard, Maximize, Minimize, QrCode, UserCheck, X } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { NOMBRE_ESTADO, confirmarSesion, marcar } from "@/datos/asistencia";
import { nombreCompleto, nombreSeccion } from "@/datos/consultas";
import { vivas } from "@/db/repositorio";
import type { Asistencia, EstadoAsistencia, Estudiante } from "@/db/tipos";
import { VENTANA_MS, crearTokenQr, leerCarne } from "@/dominio/qr";
import { ahoraServidor } from "@/sync/reloj";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Aviso, Boton, BotonRegresar, Contenido, Dialogo, Encabezado, Gema, Tarjeta, cx, orden } from "@/ui/componentes";
import { Segmentado, Vacio } from "@/ui/formulario";
import { CodigoQr, Escaner } from "@/ui/qr";

const ESTADOS: EstadoAsistencia[] = ["P", "T", "F", "J"];
const COLOR_ESTADO: Record<EstadoAsistencia, string> = {
  P: "bg-gradient-to-b from-emerald-400 to-emerald-600 text-white",
  T: "bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950",
  F: "bg-gradient-to-b from-red-400 to-red-600 text-white",
  J: "bg-gradient-to-b from-sky-400 to-sky-600 text-white",
};
const ORIGEN = { qr: "QR", carne: "Carné", manual: "" } as const;

type Modo = "lista" | "qr" | "carne";

export function TomaAsistencia() {
  const { id } = useParams();
  const { colegioId, sincronizarAhora, sync } = useApp();
  const avisar = useAvisar();
  const [modo, setModo] = useState<Modo>("lista");
  const [confirmando, setConfirmando] = useState(false);

  const datos = useLiveQuery(async () => {
    const sesion = await db.tabla("asistencia_sesion").get(id!);
    if (!sesion) return null;
    const [seccion, area, secreto] = await Promise.all([
      db.tabla("seccion").get(sesion.seccion_id),
      sesion.area_id ? db.tabla("area").get(sesion.area_id) : undefined,
      db.tabla("asistencia_secreto").where("sesion_id").equals(sesion.id).first(),
    ]);
    const grado = seccion ? await db.tabla("grado").get(seccion.grado_id) : undefined;
    const mats = vivas(await db.tabla("matricula").where("seccion_id").equals(sesion.seccion_id).toArray()).filter((m) => m.estado === "matriculado");
    const estudiantes = vivas((await db.tabla("estudiante").bulkGet(mats.map((m) => m.estudiante_id))).filter((e): e is Estudiante => !!e))
      .sort((a, b) => a.apellidos.localeCompare(b.apellidos));
    const marcas = new Map(vivas(await db.tabla("asistencia").where("sesion_id").equals(sesion.id).toArray()).map((m) => [m.estudiante_id, m]));
    return { sesion, titulo: seccion ? nombreSeccion(grado, seccion) : "Sección", area: area?.nombre, secreto: secreto?.secreto, estudiantes, marcas };
  }, [id]);

  if (datos === null) return <Contenido><Vacio icono={ClipboardCheck} titulo="No se encontró la sesión" accion={<BotonRegresar a="/asistencia" />} /></Contenido>;
  if (!datos) return null;
  const { sesion, estudiantes, marcas } = datos;

  const cuenta = (e: EstadoAsistencia) => estudiantes.filter((x) => marcas.get(x.id)?.estado === e).length;
  const sinMarca = estudiantes.filter((x) => !marcas.has(x.id));
  const porRevisar = estudiantes.filter((x) => marcas.get(x.id)?.por_revisar);

  const marcarUno = async (est: Estudiante, estado: EstadoAsistencia, origen: Asistencia["origen"] = "manual") => {
    try {
      await marcar(sesion.id, est.id, estado, origen, colegioId);
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    }
  };
  const todosPresentes = async () => {
    for (const e of sinMarca) await marcar(sesion.id, e.id, "P", "manual", colegioId);
    avisar(textoGuardado(`${sinMarca.length} marcados como presentes`));
  };
  const confirmar = async () => {
    await confirmarSesion(sesion.id, sinMarca.map((e) => e.id), colegioId);
    setConfirmando(false);
    avisar(textoGuardado("Asistencia confirmada"));
  };

  return (
    <>
      <Encabezado etiqueta={`Asistencia · ${new Date(`${sesion.fecha}T12:00:00`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}`}
        titulo={`${datos.titulo}${datos.area ? ` · ${datos.area}` : ""}`} />
      <Contenido ancho="max-w-4xl">
        <Tarjeta className="aparecer p-4" style={orden(1)}>
          <div className="grid grid-cols-5 gap-2 text-center">
            {ESTADOS.map((e) => (
              <div key={e} className="rounded-2xl bg-white/45 py-2 ring-1 ring-white/80">
                <p className="titulo-display text-2xl font-bold">{cuenta(e)}</p>
                <p className="text-[0.65rem] font-semibold text-tinta-suave">{NOMBRE_ESTADO[e]}</p>
              </div>
            ))}
            <div className={cx("rounded-2xl py-2 ring-1", sinMarca.length ? "bg-white/30 ring-white/60" : "bg-emerald-50/70 ring-emerald-200")}>
              <p className="titulo-display text-2xl font-bold">{sinMarca.length}</p>
              <p className="text-[0.65rem] font-semibold text-tinta-suave">Sin marcar</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Segmentado etiqueta="Modo" valor={modo} onCambio={setModo} opciones={[
              { valor: "lista", texto: "Lista" }, { valor: "qr", texto: "QR" }, { valor: "carne", texto: "Carnés" },
            ]} />
            <span className={cx("ml-auto rounded-full px-3 py-1 text-xs font-bold", sesion.estado === "confirmada" ? "bg-emerald-100/80 text-emerald-800" : "bg-sky-100/80 text-sky-800")}>
              {sesion.estado === "confirmada" ? "Confirmada" : "Abierta"}
            </span>
          </div>
        </Tarjeta>

        {porRevisar.length > 0 && (
          <Aviso tipo="alerta" icono={CircleAlert} titulo={`${porRevisar.length} ${porRevisar.length === 1 ? "marca" : "marcas"} por revisar`}>
            Marcas con QR que llegaron con alguna duda (hora o celular). Revíselas en la lista: acepte o marque falta.
          </Aviso>
        )}

        {estudiantes.length === 0 && <Vacio icono={UserCheck} titulo="La sección no tiene estudiantes matriculados" />}

        {modo === "lista" && estudiantes.length > 0 && (
          <>
            {sinMarca.length > 0 && (
              <div className="flex justify-end">
                <Boton variante="vidrio" icono={UserCheck} onClick={todosPresentes}>Marcar presentes a los {sinMarca.length} restantes</Boton>
              </div>
            )}
            <Tarjeta className="divide-y divide-white/70 overflow-hidden">
              {estudiantes.map((e, i) => {
                const m = marcas.get(e.id);
                return (
                  <div key={e.id} className={cx("px-3 py-3 sm:px-4", m?.por_revisar && "bg-amber-50/60")}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="w-5 text-right text-xs text-tinta-suave">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{nombreCompleto(e)}</p>
                        {m && ORIGEN[m.origen] && <p className="text-[0.7rem] text-tinta-suave">Marcó con {ORIGEN[m.origen]}{m.marcado_en && ` · ${new Date(m.marcado_en).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`}</p>}
                      </div>
                      <div className="flex w-full gap-2 pl-8 sm:w-auto sm:pl-0" role="radiogroup" aria-label={`Asistencia de ${e.nombres}`}>
                        {ESTADOS.map((st) => (
                          <button key={st} role="radio" aria-checked={m?.estado === st} aria-label={NOMBRE_ESTADO[st]} onClick={() => void marcarUno(e, st)}
                            className={cx("titulo-display h-11 w-11 rounded-xl text-sm font-bold transition active:scale-90",
                              m?.estado === st ? COLOR_ESTADO[st] : "bg-white/60 text-tinta-suave ring-1 ring-white hover:bg-white")}>
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                    {m?.por_revisar && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-8 text-xs">
                        <span className="flex-1 font-semibold text-amber-800">{m.motivo_revision ?? "Por revisar"}</span>
                        <Boton variante="vidrio" className="!min-h-9 !px-3 text-xs" onClick={() => void marcarUno(e, m.estado)}>Aceptar</Boton>
                        <Boton variante="fantasma" className="!min-h-9 !px-3 text-xs text-red-700" onClick={() => void marcarUno(e, "F")}>Falta</Boton>
                      </div>
                    )}
                  </div>
                );
              })}
            </Tarjeta>
          </>
        )}

        {modo === "qr" && (
          datos.secreto
            ? <VistaQr sesionId={sesion.id} secreto={datos.secreto} recibidas={[...marcas.values()].filter((m) => m.origen === "qr").length}
                total={estudiantes.length} conectado={sync.conectado} sincronizar={sincronizarAhora} />
            : <Aviso tipo="alerta" icono={QrCode}>El código QR solo se puede mostrar desde el equipo de quien abrió esta asistencia.</Aviso>
        )}

        {modo === "carne" && (
          <VistaCarnes estudiantes={estudiantes} marcas={marcas} onMarcar={(e) => marcarUno(e, "P", "carne")} />
        )}

        {estudiantes.length > 0 && (
          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <BotonRegresar a="/asistencia" />
            <Boton icono={ClipboardCheck} onClick={() => setConfirmando(true)}>
              {sesion.estado === "confirmada" ? "Volver a confirmar" : "Confirmar asistencia"}
            </Boton>
          </div>
        )}
      </Contenido>

      <Dialogo abierto={confirmando} titulo="Confirmar la asistencia" onCerrar={() => setConfirmando(false)}
        acciones={<>
          <Boton variante="fantasma" onClick={() => setConfirmando(false)}>Seguir revisando</Boton>
          <Boton icono={ClipboardCheck} onClick={confirmar}>Confirmar</Boton>
        </>}>
        <p>La lista confirmada es la asistencia oficial de esta clase. Puede corregirla después si hace falta.</p>
        {sinMarca.length > 0 && <p className="mt-2 font-semibold text-red-700">{sinMarca.length} {sinMarca.length === 1 ? "estudiante sin marca quedará" : "estudiantes sin marca quedarán"} con falta.</p>}
        {porRevisar.length > 0 && <p className="mt-2 font-semibold text-amber-800">Quedan {porRevisar.length} marcas por revisar.</p>}
      </Dialogo>
    </>
  );
}

function VistaQr({ sesionId, secreto, recibidas, total, conectado, sincronizar }: {
  sesionId: string; secreto: string; recibidas: number; total: number; conectado: boolean; sincronizar(): Promise<unknown>;
}) {
  const [token, setToken] = useState("");
  const [restante, setRestante] = useState(15);
  const [grande, setGrande] = useState(false);
  const ventanaActual = useRef(-1);

  useEffect(() => {
    let vivo = true;
    const tic = async () => {
      const ahora = ahoraServidor();
      const v = Math.floor(ahora / VENTANA_MS);
      setRestante(Math.ceil((VENTANA_MS - (ahora % VENTANA_MS)) / 1000));
      if (v !== ventanaActual.current) {
        ventanaActual.current = v;
        const t = await crearTokenQr(sesionId, secreto, ahora);
        if (vivo) setToken(t);
      }
    };
    void tic();
    const i = setInterval(() => void tic(), 1000);
    return () => { vivo = false; clearInterval(i); };
  }, [sesionId, secreto]);

  // Mientras el QR está en pantalla se sincroniza seguido para ver llegar las marcas.
  useEffect(() => {
    if (!conectado) return;
    const i = setInterval(() => void sincronizar(), 10_000);
    return () => clearInterval(i);
  }, [conectado, sincronizar]);

  const circ = 2 * Math.PI * 22;
  const panel = (
    <div className={cx("flex flex-col items-center gap-4", grande ? "w-full max-w-[min(90vw,80dvh)]" : "")}>
      <div className="w-full rounded-[1.75rem] bg-white p-4 shadow-[0_24px_60px_-24px_rgba(11,46,51,.6)]">
        {token ? <CodigoQr texto={token} className="aspect-square w-full" /> : <div className="aspect-square w-full animate-pulse rounded-2xl bg-slate-100" />}
      </div>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 52 52" className="h-12 w-12 -rotate-90" aria-hidden>
          <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(11,46,51,.12)" strokeWidth="5" />
          <circle cx="26" cy="26" r="22" fill="none" stroke="#0fb5a6" strokeWidth="5" strokeLinecap="round" className="anillo"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - restante / 15)} />
        </svg>
        <p className="text-sm font-semibold" aria-live="off">El código cambia en {restante} s</p>
      </div>
    </div>
  );

  return (
    <>
      <Tarjeta className="aparecer flex flex-col items-center gap-4 p-5 sm:p-8">
        <div className="mx-auto w-full max-w-sm">{panel}</div>
        <div className="flex w-full flex-wrap items-center justify-center gap-3">
          <span className="rounded-full bg-emerald-100/80 px-4 py-2 text-sm font-bold text-emerald-800">{recibidas} de {total} marcaron con QR</span>
          <Boton variante="vidrio" icono={Maximize} onClick={() => { setGrande(true); void document.documentElement.requestFullscreen?.().catch(() => undefined); }}>Pantalla completa</Boton>
        </div>
        <p className="max-w-md text-center text-xs text-tinta-suave">
          {conectado
            ? "Las marcas aparecen aquí a medida que llegan. Quien no tenga señal quedará registrado cuando su celular se conecte."
            : "Sin conexión: los estudiantes pueden marcar igual. Sus marcas llegarán cuando ustedes se conecten; luego confirme la lista."}
        </p>
      </Tarjeta>
      {grande && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-white p-6">
          {panel}
          <p className="text-lg font-bold text-tinta">{recibidas} de {total} marcaron</p>
          <Boton variante="vidrio" icono={Minimize} className="absolute right-4 top-4" onClick={() => { setGrande(false); void document.exitFullscreen?.().catch(() => undefined); }}>Salir</Boton>
        </div>
      )}
    </>
  );
}

function VistaCarnes({ estudiantes, marcas, onMarcar }: { estudiantes: Estudiante[]; marcas: Map<string, Asistencia>; onMarcar(e: Estudiante): Promise<void> }) {
  const [ultimo, setUltimo] = useState<{ texto: string; ok: boolean; t: number } | null>(null);
  const porCarne = useMemo(() => new Map(estudiantes.map((e) => [e.codigo_carne.toUpperCase(), e])), [estudiantes]);
  const escaneados = estudiantes.filter((e) => marcas.get(e.id)?.origen === "carne").length;

  const leer = async (texto: string) => {
    const codigo = leerCarne(texto);
    const est = codigo ? porCarne.get(codigo.toUpperCase()) : undefined;
    if (!est) {
      setUltimo({ texto: codigo ? "Ese carné no es de esta sección" : "No es un carné del colegio", ok: false, t: Date.now() });
      return;
    }
    const ya = marcas.get(est.id)?.estado === "P";
    await onMarcar(est);
    setUltimo({ texto: `${est.nombres} ${est.apellidos.split(" ")[0]}${ya ? " (ya estaba presente)" : ""}`, ok: true, t: Date.now() });
  };

  return (
    <Tarjeta className="aparecer space-y-4 p-5">
      <div className="flex items-center gap-3">
        <Gema icono={IdCard} tono="tono-ambar" />
        <div>
          <h2 className="font-bold">Escanear carnés</h2>
          <p className="text-sm text-tinta-suave">Funciona sin internet. Ideal para primaria y estudiantes sin celular.</p>
        </div>
        <span className="ml-auto rounded-full bg-white/60 px-3 py-1 text-xs font-bold">{escaneados} escaneados</span>
      </div>
      <Escaner onLeer={(t) => void leer(t)} textoManual="Escribir el código del carné" />
      {ultimo && (
        <div key={ultimo.t} className={cx("aparecer flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ring-1",
          ultimo.ok ? "bg-emerald-50/80 text-emerald-900 ring-emerald-200" : "bg-red-50/80 text-red-900 ring-red-200")} role="status">
          {ultimo.ok ? <CircleCheck className="h-6 w-6 text-emerald-600" aria-hidden /> : <X className="h-6 w-6 text-red-600" aria-hidden />}
          {ultimo.texto}
        </div>
      )}
    </Tarjeta>
  );
}
