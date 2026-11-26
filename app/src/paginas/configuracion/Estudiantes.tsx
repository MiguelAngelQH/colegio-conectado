import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, FileDown, FileSpreadsheet, GraduationCap, HeartHandshake, History, IdCard, KeyRound, LayoutGrid, Phone, Plus, Save, Trash2, UserPlus, UserX } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { descargarPlantilla } from "@/datos/excel";
import { descargarLibretas } from "@/datos/libreta";
import { nombreCompleto, useEstructura } from "@/datos/consultas";
import { nuevoId } from "@/db/local";
import { guardar, guardarLote, vivas, type Escritura } from "@/db/repositorio";
import type { Apoderado, Estudiante, Matricula } from "@/db/tipos";
import { codigoCarne } from "@/dominio/matricula";
import { normalizar, normalizarDni, nombrePropio } from "@/dominio/texto";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Aviso, Boton, BotonRegresar, Contenido, Dato, Dialogo, Encabezado, Gema, Tarjeta, cx, iniciales, orden } from "@/ui/componentes";
import { Buscador, Campo, Entrada, FilaLista, Segmentado, Selector, Vacio } from "@/ui/formulario";
import { FichaComplementaria } from "@/ui/FichaComplementaria";
import { AccesoFicha, DialogoCuentasSeccion } from "./CuentasFamilias";

const ESTADO_MATRICULA = { matriculado: "Matriculado", retirado: "Retirado", trasladado: "Trasladado" } as const;
const PARENTESCOS = ["Madre", "Padre", "Abuelo(a)", "Tío(a)", "Hermano(a)", "Otro"];

function AvatarEst({ e, tam = "h-11 w-11 text-sm" }: { e: Pick<Estudiante, "nombres" | "apellidos">; tam?: string }) {
  return <span className={cx("gema tono-musgo titulo-display font-bold", tam)}><span className="relative z-10">{iniciales(e.nombres, e.apellidos)}</span></span>;
}

export function EstudiantesPagina() {
  const e = useEstructura();
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [cuentas, setCuentas] = useState(false);
  const colegio = useLiveQuery(async () => (await db.tabla("colegio").toArray())[0]?.nombre ?? "", [], "");
  const navegar = useNavigate();
  const seccionId = params.get("seccion") ?? e?.secciones[0]?.id ?? "";
  const seccion = e?.secciones.find((s) => s.id === seccionId);

  const lista = useLiveQuery(async () => {
    if (!seccionId) return [];
    const mats = vivas(await db.tabla("matricula").where("seccion_id").equals(seccionId).toArray());
    const ests = await db.tabla("estudiante").bulkGet(mats.map((m) => m.estudiante_id));
    const vinculos = vivas(await db.tabla("estudiante_apoderado").toArray());
    return mats
      .map((m, i) => ({ m, est: ests[i], apoderados: vinculos.filter((v) => v.estudiante_id === m.estudiante_id).length }))
      .filter((x): x is { m: Matricula; est: Estudiante; apoderados: number } => !!x.est && !x.est.eliminado)
      .sort((a, b) => a.est.apellidos.localeCompare(b.est.apellidos));
  }, [seccionId]);

  const filtrados = useMemo(
    () => (lista ?? []).filter((x) => normalizar(`${x.est.apellidos} ${x.est.nombres} ${x.est.dni ?? ""}`).includes(normalizar(busca))),
    [lista, busca],
  );
  if (!e) return null;

  return (
    <>
      <Encabezado etiqueta="Configuración · Paso 4" titulo="Estudiantes" subtitulo="Matricule por sección, uno por uno o importando la nómina desde Excel." />
      <Contenido ancho="max-w-3xl">
        {!e.secciones.length ? (
          <Vacio icono={LayoutGrid} tono="tono-lila" titulo="Primero cree las secciones"
            accion={<Link to="/configuracion/secciones"><Boton>Ir al paso 2</Boton></Link>} />
        ) : (
          <>
            <Tarjeta className="aparecer space-y-3 p-4" style={orden(1)}>
              <Campo etiqueta="Sección">
                <Selector value={seccionId} onChange={(ev) => setParams({ seccion: ev.target.value }, { replace: true })}>
                  {e.secciones.map((s) => <option key={s.id} value={s.id}>{s.nombreLargo} ({s.estudiantes})</option>)}
                </Selector>
              </Campo>
              <div className="flex flex-wrap gap-2">
                <Boton icono={UserPlus} onClick={() => setAgregando(true)}>Agregar</Boton>
                <Link to={`importar?seccion=${seccionId}`}><Boton variante="vidrio" icono={FileSpreadsheet}>Importar Excel</Boton></Link>
                <Boton variante="fantasma" icono={Download} onClick={() => void descargarPlantilla()}>Plantilla</Boton>
                <Boton variante="vidrio" icono={KeyRound} onClick={() => setCuentas(true)} disabled={!lista?.length}>Crear cuentas</Boton>
              </div>
            </Tarjeta>

            {(lista?.length ?? 0) > 0 && <Buscador valor={busca} onCambio={setBusca} placeholder="Buscar estudiante" />}

            {lista && lista.length === 0 ? (
              <Vacio icono={GraduationCap} tono="tono-musgo" titulo={`${seccion?.nombre ?? "La sección"} no tiene estudiantes`}>
                Agréguelos uno por uno o importe la nómina desde Excel.
              </Vacio>
            ) : (
              <Tarjeta className="aparecer divide-y divide-sup/70 overflow-hidden" style={orden(2)}>
                {filtrados.map(({ m, est, apoderados }, i) => (
                  <FilaLista key={m.id} onClick={() => navegar(est.id)}>
                    <span className="w-5 text-right text-xs text-tinta-suave">{i + 1}</span>
                    <AvatarEst e={est} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{nombreCompleto(est)}</span>
                      <span className="block truncate text-xs text-tinta-suave">
                        {est.dni ? `DNI ${est.dni}` : "Sin DNI"} · {apoderados ? `${apoderados} apoderado${apoderados > 1 ? "s" : ""}` : "Sin apoderado"}
                      </span>
                    </span>
                    {m.estado !== "matriculado" && <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[0.65rem] font-bold">{ESTADO_MATRICULA[m.estado]}</span>}
                  </FilaLista>
                ))}
              </Tarjeta>
            )}
          </>
        )}
        <div className="flex justify-center pt-2"><BotonRegresar a="/configuracion" /></div>
      </Contenido>
      {cuentas && seccion && <DialogoCuentasSeccion seccionId={seccion.id} seccionNombre={seccion.nombreLargo} colegio={colegio} onCerrar={() => setCuentas(false)} />}
      {agregando && seccion && e.anio && <DialogoNuevoEstudiante seccionId={seccion.id} seccionNombre={seccion.nombre} anioId={e.anio.id} onCerrar={() => setAgregando(false)} />}
    </>
  );
}

function DialogoNuevoEstudiante({ seccionId, seccionNombre, anioId, onCerrar }: { seccionId: string; seccionNombre: string; anioId: string; onCerrar(): void }) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [f, setF] = useState({ dni: "", apellidos: "", nombres: "", fecha: "" });
  const [sexo, setSexo] = useState<"M" | "F" | "">("");
  const [guardando, setGuardando] = useState(false);
  const dni = normalizarDni(f.dni);
  const dniValido = !f.dni.trim() || dni !== null;

  // Si el DNI ya existe se reutiliza el estudiante (por ejemplo, viene de otro año).
  const existente = useLiveQuery(async () => {
    if (!dni) return null;
    const est = (await db.tabla("estudiante").toArray()).find((x) => x.dni === dni && !x.eliminado) ?? null;
    if (!est) return null;
    const mat = vivas(await db.tabla("matricula").where("estudiante_id").equals(est.id).toArray()).find((m) => m.anio_id === anioId) ?? null;
    return { est, mat };
  }, [dni, anioId]);

  const listo = existente ? !existente.mat : f.apellidos.trim() && f.nombres.trim() && dniValido;

  const guardarNuevo = async () => {
    setGuardando(true);
    try {
      const escrituras: Escritura[] = [];
      let estudianteId = existente?.est.id;
      if (!estudianteId) {
        estudianteId = nuevoId();
        const carnes = new Set((await db.tabla("estudiante").toArray()).map((x) => x.codigo_carne));
        escrituras.push({
          tabla: "estudiante",
          datos: {
            id: estudianteId, usuario_id: null, dni, apellidos: nombrePropio(f.apellidos), nombres: nombrePropio(f.nombres),
            sexo: sexo || null, fecha_nacimiento: f.fecha || null, codigo_carne: codigoCarne(carnes, dni),
          },
        });
      }
      escrituras.push({ tabla: "matricula", datos: { anio_id: anioId, seccion_id: seccionId, estudiante_id: estudianteId, estado: "matriculado" } });
      await guardarLote(db, escrituras, colegioId);
      avisar(textoGuardado(`Matriculado en ${seccionNombre}`));
      onCerrar();
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo abierto titulo={`Agregar a ${seccionNombre}`} onCerrar={onCerrar}
      acciones={<>
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        <Boton icono={UserPlus} onClick={guardarNuevo} cargando={guardando} disabled={!listo}>{existente ? "Matricular" : "Agregar"}</Boton>
      </>}>
      <div className="space-y-3 pt-2 text-tinta">
        <Campo etiqueta="DNI" error={dniValido ? null : "Debe tener 8 dígitos"} ayuda="Opcional, pero evita duplicados.">
          <Entrada inputMode="numeric" value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} autoFocus />
        </Campo>
        {existente ? (
          <Aviso tipo={existente.mat ? "error" : "info"} icono={IdCard} titulo={nombreCompleto(existente.est)}>
            {existente.mat ? "Ya está matriculado este año. Para cambiarlo de sección use su ficha." : "Ya está registrado. Se matriculará en esta sección."}
          </Aviso>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Apellidos"><Entrada value={f.apellidos} onChange={(e) => setF({ ...f, apellidos: e.target.value })} /></Campo>
              <Campo etiqueta="Nombres"><Entrada value={f.nombres} onChange={(e) => setF({ ...f, nombres: e.target.value })} /></Campo>
              <Campo etiqueta="Fecha de nacimiento"><Entrada type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Campo>
              <div>
                <span className="mb-1.5 block text-sm font-semibold">Sexo</span>
                <Segmentado etiqueta="Sexo" valor={sexo} onCambio={setSexo} opciones={[{ valor: "M", texto: "Hombre" }, { valor: "F", texto: "Mujer" }]} />
              </div>
            </div>
          </>
        )}
      </div>
    </Dialogo>
  );
}

export function FichaEstudiante() {
  const { id } = useParams();
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const e = useEstructura();
  const datos = useLiveQuery(async () => {
    const est = await db.tabla("estudiante").get(id!);
    if (!est || est.eliminado) return null;
    const mats = vivas(await db.tabla("matricula").where("estudiante_id").equals(id!).toArray());
    const vinculos = vivas(await db.tabla("estudiante_apoderado").where("estudiante_id").equals(id!).toArray()).sort((a, b) => a.orden - b.orden);
    const apoderados = await db.tabla("apoderado").bulkGet(vinculos.map((v) => v.apoderado_id));
    return { est, mats, vinculos: vinculos.map((v, i) => ({ v, a: apoderados[i] })) };
  }, [id]);
  const [editando, setEditando] = useState(false);
  const [agregandoApo, setAgregandoApo] = useState(false);

  if (datos === null) return <Contenido><Vacio icono={UserX} titulo="No se encontró al estudiante" accion={<BotonRegresar a="/configuracion/estudiantes" />} /></Contenido>;
  if (!datos?.est || !e) return null;
  const { est } = datos;
  const mat = datos.mats.find((m) => m.anio_id === e.anio?.id);
  const seccion = e.secciones.find((s) => s.id === mat?.seccion_id);

  const cambiarMatricula = async (cambio: Partial<Matricula>) => {
    await guardar(db, "matricula", { id: mat!.id, ...cambio }, colegioId);
    avisar(textoGuardado("Matrícula actualizada"));
  };
  const quitarApoderado = async (vinculoId: string) => {
    await guardar(db, "estudiante_apoderado", { id: vinculoId, eliminado: true }, colegioId);
    avisar(textoGuardado("Apoderado desvinculado"));
  };

  return (
    <>
      <Encabezado etiqueta="Estudiante" titulo={`${est.nombres} ${est.apellidos}`} />
      <Contenido ancho="max-w-3xl">
        <Tarjeta className="aparecer flex flex-wrap items-center gap-4 p-5" style={orden(1)}>
          <AvatarEst e={est} tam="h-16 w-16 text-xl" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{seccion?.nombreLargo ?? "Sin matrícula este año"}</p>
            <p className="text-sm text-tinta-suave">Carné {est.codigo_carne}</p>
          </div>
          <div className="flex gap-2">
            <Boton variante="vidrio" icono={FileDown} onClick={() => descargarLibretas([est.id], `libreta_${est.apellidos}_${est.nombres}.pdf`.replace(/\s+/g, "_")).catch((err) => avisar(String(err), "error"))}>Libreta</Boton>
            <Link to={`/estudiantes/${est.id}`}><Boton variante="vidrio" icono={History}>Historial</Boton></Link>
            <Boton variante="vidrio" onClick={() => setEditando(true)}>Editar</Boton>
          </div>
        </Tarjeta>

        <Tarjeta className="aparecer divide-y divide-sup/70" style={orden(2)}>
          <Dato etiqueta="Documento de identidad">{est.dni ? `DNI ${est.dni}` : "No registrado"}</Dato>
          <Dato etiqueta="Fecha de nacimiento">{est.fecha_nacimiento ? new Date(`${est.fecha_nacimiento}T12:00:00`).toLocaleDateString("es-PE", { dateStyle: "long" }) : "No registrada"}</Dato>
          <Dato etiqueta="Sexo">{est.sexo === "M" ? "Hombre" : est.sexo === "F" ? "Mujer" : "No registrado"}</Dato>
        </Tarjeta>

        <FichaComplementaria est={est} editable />

        {mat && (
          <Tarjeta className="aparecer space-y-3 p-5" style={orden(3)}>
            <h2 className="font-bold">Matrícula {e.anio?.anio}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Sección">
                <Selector value={mat.seccion_id} onChange={(ev) => void cambiarMatricula({ seccion_id: ev.target.value })}>
                  {e.secciones.map((s) => <option key={s.id} value={s.id}>{s.nombreLargo}</option>)}
                </Selector>
              </Campo>
              <Campo etiqueta="Estado">
                <Selector value={mat.estado} onChange={(ev) => void cambiarMatricula({ estado: ev.target.value as Matricula["estado"] })}>
                  {Object.entries(ESTADO_MATRICULA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Selector>
              </Campo>
            </div>
          </Tarjeta>
        )}

        <section className="aparecer space-y-2" style={orden(4)}>
          <div className="flex items-center justify-between px-1">
            <h2 className="etiqueta">Padres y apoderados ({datos.vinculos.length} de 3)</h2>
            <Boton variante="vidrio" icono={Plus} onClick={() => setAgregandoApo(true)} disabled={datos.vinculos.length >= 3}>Agregar</Boton>
          </div>
          {datos.vinculos.length === 0 ? (
            <Vacio icono={HeartHandshake} tono="tono-coral" titulo="Sin apoderados">Registre al menos un apoderado para que reciba avisos y la libreta.</Vacio>
          ) : (
            <Tarjeta className="divide-y divide-sup/70">
              {datos.vinculos.map(({ v, a }) => (
                <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                  <Gema icono={HeartHandshake} tono="tono-coral" tam="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{a ? nombreCompleto(a) : "Apoderado"} <span className="font-normal text-tinta-suave">· {v.parentesco}</span></p>
                    <p className="flex items-center gap-1 text-xs text-tinta-suave">
                      {a?.dni && `DNI ${a.dni}`}{a?.telefono && <><Phone className="ml-1 h-3 w-3" aria-hidden /> {a.telefono}</>}
                    </p>
                  </div>
                  <button onClick={() => quitarApoderado(v.id)} className="rounded-full p-2 text-tinta-suave hover:bg-sup/60" aria-label="Desvincular apoderado">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))}
            </Tarjeta>
          )}
        </section>

        <AccesoFicha estudiante={est} apoderados={datos.vinculos.map(({ v, a }) => ({ a, parentesco: v.parentesco }))} />

        <div className="flex justify-center pt-2"><BotonRegresar a={`/configuracion/estudiantes${mat ? `?seccion=${mat.seccion_id}` : ""}`} /></div>
      </Contenido>
      {editando && <DialogoEditarEstudiante est={est} onCerrar={() => setEditando(false)} />}
      {agregandoApo && <DialogoApoderado estudianteId={est.id} orden={datos.vinculos.length + 1} onCerrar={() => setAgregandoApo(false)} />}
    </>
  );
}

function DialogoEditarEstudiante({ est, onCerrar }: { est: Estudiante; onCerrar(): void }) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [f, setF] = useState({ dni: est.dni ?? "", apellidos: est.apellidos, nombres: est.nombres, fecha: est.fecha_nacimiento ?? "" });
  const [sexo, setSexo] = useState<"M" | "F" | "">(est.sexo ?? "");
  const dni = normalizarDni(f.dni);
  const duplicado = useLiveQuery(async () => (dni ? (await db.tabla("estudiante").toArray()).find((x) => x.dni === dni && x.id !== est.id && !x.eliminado) : undefined), [dni]);
  const dniValido = !f.dni.trim() || dni !== null;
  const listo = f.apellidos.trim() && f.nombres.trim() && dniValido && !duplicado;

  const guardarCambios = async () => {
    await guardar(db, "estudiante", {
      id: est.id, dni, apellidos: nombrePropio(f.apellidos), nombres: nombrePropio(f.nombres), sexo: sexo || null, fecha_nacimiento: f.fecha || null,
    }, colegioId);
    avisar(textoGuardado("Datos actualizados"));
    onCerrar();
  };

  return (
    <Dialogo tam="grande" abierto titulo="Editar estudiante" onCerrar={onCerrar}
      acciones={<><Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton><Boton icono={Save} onClick={guardarCambios} disabled={!listo}>Guardar</Boton></>}>
      <div className="grid gap-3 pt-2 text-tinta sm:grid-cols-2">
        <Campo etiqueta="Apellidos"><Entrada value={f.apellidos} onChange={(e) => setF({ ...f, apellidos: e.target.value })} /></Campo>
        <Campo etiqueta="Nombres"><Entrada value={f.nombres} onChange={(e) => setF({ ...f, nombres: e.target.value })} /></Campo>
        <Campo etiqueta="DNI" error={!dniValido ? "Debe tener 8 dígitos" : duplicado ? `Ya lo tiene ${nombreCompleto(duplicado)}` : null}>
          <Entrada inputMode="numeric" value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} />
        </Campo>
        <Campo etiqueta="Fecha de nacimiento"><Entrada type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Campo>
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-semibold">Sexo</span>
          <Segmentado etiqueta="Sexo" valor={sexo} onCambio={setSexo} opciones={[{ valor: "M", texto: "Hombre" }, { valor: "F", texto: "Mujer" }]} />
        </div>
      </div>
    </Dialogo>
  );
}

function DialogoApoderado({ estudianteId, orden: ordenVinculo, onCerrar }: { estudianteId: string; orden: number; onCerrar(): void }) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [f, setF] = useState({ dni: "", apellidos: "", nombres: "", telefono: "" });
  const [parentesco, setParentesco] = useState(PARENTESCOS[0]);
  const dni = normalizarDni(f.dni);
  const dniValido = !f.dni.trim() || dni !== null;
  // Un mismo apoderado puede tener varios hijos en el colegio: se reutiliza por DNI.
  const existente = useLiveQuery(async (): Promise<Apoderado | null> =>
    (dni ? (await db.tabla("apoderado").toArray()).find((a) => a.dni === dni && !a.eliminado) ?? null : null), [dni]);
  const telefonoValido = !f.telefono.trim() || /^\+?\d{6,12}$/.test(f.telefono.replace(/\s/g, ""));
  const listo = dniValido && telefonoValido && (existente || (f.apellidos.trim() && f.nombres.trim()));

  const guardarApo = async () => {
    const escrituras: Escritura[] = [];
    let apoderadoId = existente?.id;
    if (!apoderadoId) {
      apoderadoId = nuevoId();
      escrituras.push({
        tabla: "apoderado",
        datos: { id: apoderadoId, usuario_id: null, dni, apellidos: nombrePropio(f.apellidos), nombres: nombrePropio(f.nombres), telefono: f.telefono.replace(/\s/g, "") || null },
      });
    }
    escrituras.push({ tabla: "estudiante_apoderado", datos: { estudiante_id: estudianteId, apoderado_id: apoderadoId, parentesco, orden: ordenVinculo } });
    await guardarLote(db, escrituras, colegioId);
    avisar(textoGuardado("Apoderado registrado"));
    onCerrar();
  };

  return (
    <Dialogo abierto titulo="Agregar apoderado" onCerrar={onCerrar}
      acciones={<><Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton><Boton icono={UserPlus} onClick={guardarApo} disabled={!listo}>Agregar</Boton></>}>
      <div className="space-y-3 pt-2 text-tinta">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="DNI" error={dniValido ? null : "Debe tener 8 dígitos"}><Entrada inputMode="numeric" value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} autoFocus /></Campo>
          <Campo etiqueta="Parentesco">
            <Selector value={parentesco} onChange={(e) => setParentesco(e.target.value)}>{PARENTESCOS.map((p) => <option key={p}>{p}</option>)}</Selector>
          </Campo>
        </div>
        {existente ? (
          <Aviso tipo="info" icono={HeartHandshake} titulo={nombreCompleto(existente)}>Ya está registrado (apoderado de otro estudiante). Se vinculará también a este.</Aviso>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Apellidos"><Entrada value={f.apellidos} onChange={(e) => setF({ ...f, apellidos: e.target.value })} /></Campo>
            <Campo etiqueta="Nombres"><Entrada value={f.nombres} onChange={(e) => setF({ ...f, nombres: e.target.value })} /></Campo>
            <Campo etiqueta="Celular" error={telefonoValido ? null : "Número no válido"} className="sm:col-span-2">
              <Entrada type="tel" inputMode="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
            </Campo>
          </div>
        )}
      </div>
    </Dialogo>
  );
}
