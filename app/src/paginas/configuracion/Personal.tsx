import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, KeyRound, Plus, Save, Trash2, UserPlus, UserX, Users } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { NOMBRE_ROL, TONO_ROL } from "@/app/modulos";
import { useCuentas } from "@/datos/cuentas";
import { nombreCompleto, usePersonal, useEstructura } from "@/datos/consultas";
import { guardar, guardarLote, vivas } from "@/db/repositorio";
import type { Rol, Usuario } from "@/db/tipos";
import { normalizar, normalizarDni, nombrePropio } from "@/dominio/texto";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Aviso, Boton, BotonRegresar, Contenido, Dialogo, Encabezado, Tarjeta, cx, iniciales, orden } from "@/ui/componentes";
import { DialogoCredencial } from "@/ui/credenciales";
import { Buscador, Campo, Casilla, Entrada, FilaLista, Selector, Vacio } from "@/ui/formulario";

const ROLES_PERSONAL: Rol[] = ["director", "subdirector", "docente", "tutor", "auxiliar"];

function Avatar({ u, tam = "h-11 w-11 text-sm" }: { u: Usuario; tam?: string }) {
  return (
    <span className={cx("gema titulo-display font-bold", TONO_ROL[u.roles[0]] ?? "tono-pizarra", tam, !u.activo && "grayscale")}>
      <span className="relative z-10">{iniciales(u.nombres, u.apellidos)}</span>
    </span>
  );
}

export function PersonalPagina() {
  const personal = usePersonal();
  const asignaciones = useLiveQuery(async () => vivas(await db.tabla("docente_asignacion").toArray()), [], []);
  const [busca, setBusca] = useState("");
  const [creando, setCreando] = useState(false);
  const navegar = useNavigate();
  const filtrados = useMemo(
    () => (personal ?? []).filter((u) => normalizar(`${u.nombres} ${u.apellidos} ${u.dni ?? ""}`).includes(normalizar(busca))),
    [personal, busca],
  );
  if (!personal) return null;

  return (
    <>
      <Encabezado etiqueta="Configuración · Paso 3" titulo="Personal" subtitulo="Docentes, auxiliares y dirección. Asigne a cada docente sus áreas y secciones."
        accion={<Boton icono={UserPlus} onClick={() => setCreando(true)} className="hidden sm:inline-flex">Agregar</Boton>} />
      <Contenido>
        <div className="flex gap-2">
          <div className="flex-1"><Buscador valor={busca} onCambio={setBusca} placeholder="Buscar por nombre o DNI" /></div>
          <Boton icono={UserPlus} onClick={() => setCreando(true)} className="sm:hidden" aria-label="Agregar personal" />
        </div>
        {filtrados.length === 0 ? (
          <Vacio icono={Users} tono="tono-ambar" titulo={busca ? "Sin resultados" : "Aún no hay personal"}
            accion={!busca && <Boton icono={UserPlus} onClick={() => setCreando(true)}>Agregar personal</Boton>} />
        ) : (
          <Tarjeta className="aparecer divide-y divide-sup/70 overflow-hidden" style={orden(1)}>
            {filtrados.map((u) => {
              const n = asignaciones.filter((a) => a.docente_id === u.id).length;
              return (
                <FilaLista key={u.id} onClick={() => navegar(u.id)}>
                  <Avatar u={u} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{nombreCompleto(u)}</span>
                    <span className="block truncate text-xs text-tinta-suave">
                      {u.roles.map((r) => NOMBRE_ROL[r]).join(" · ")}{n > 0 && ` · ${n} ${n === 1 ? "área" : "áreas"}`}
                    </span>
                  </span>
                  {!u.activo && <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[0.65rem] font-bold text-slate-700">Inactivo</span>}
                </FilaLista>
              );
            })}
          </Tarjeta>
        )}
        <div className="flex justify-center pt-2"><BotonRegresar a="/configuracion" /></div>
      </Contenido>
      {creando && <DialogoNuevaPersona onCerrar={() => setCreando(false)} />}
    </>
  );
}

function DialogoNuevaPersona({ onCerrar }: { onCerrar(): void }) {
  const avisar = useAvisar();
  const navegar = useNavigate();
  const cuentas = useCuentas();
  const [f, setF] = useState({ nombres: "", apellidos: "", dni: "", email: "" });
  const [roles, setRoles] = useState<Rol[]>(["docente"]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creada, setCreada] = useState<{ id: string; clave: string; dni: string } | null>(null);

  const dni = normalizarDni(f.dni);
  const correoValido = !f.email.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim());
  const listo = f.nombres.trim() && f.apellidos.trim() && roles.length > 0 && !!dni && correoValido;

  const crear = async () => {
    if (!dni) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await cuentas.crear({
        nombres: nombrePropio(f.nombres), apellidos: nombrePropio(f.apellidos), dni, email: f.email.trim().toLowerCase() || null, roles,
      });
      if (r.claveTemporal) setCreada({ id: r.id, clave: r.claveTemporal, dni });
      else {
        avisar(textoGuardado(r.existente ? "Esa persona ya tenía cuenta: se le agregó el cargo" : "Persona registrada"));
        navegar(r.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  };

  if (creada) {
    return <DialogoCredencial titulo="Cuenta creada" nombre={`${nombrePropio(f.nombres)} ${nombrePropio(f.apellidos)}`} dni={creada.dni}
      email={f.email.trim().toLowerCase() || null} clave={creada.clave} onCerrar={() => navegar(creada.id)} />;
  }

  return (
    <Dialogo abierto titulo="Agregar personal" onCerrar={onCerrar}
      acciones={<>
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        <Boton icono={UserPlus} onClick={crear} cargando={guardando} disabled={!listo}>Crear cuenta</Boton>
      </>}>
      <div className="space-y-3 pt-2 text-tinta">
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombres"><Entrada value={f.nombres} onChange={(e) => setF({ ...f, nombres: e.target.value })} autoFocus /></Campo>
          <Campo etiqueta="Apellidos"><Entrada value={f.apellidos} onChange={(e) => setF({ ...f, apellidos: e.target.value })} /></Campo>
          <Campo etiqueta="DNI (para ingresar)" error={f.dni.trim() && !dni ? "8 dígitos" : null}>
            <Entrada inputMode="numeric" value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} />
          </Campo>
          <Campo etiqueta="Correo (opcional)" error={correoValido ? null : "Correo no válido"}>
            <Entrada type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Campo>
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-semibold">Cargo</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLES_PERSONAL.map((r) => (
              <Casilla key={r} marcada={roles.includes(r)} onCambio={(v) => setRoles(v ? [...roles, r] : roles.filter((x) => x !== r))}>{NOMBRE_ROL[r]}</Casilla>
            ))}
          </div>
        </div>
        <p className="text-xs">Se crea la cuenta con una contraseña temporal. La persona ingresa con su DNI (o su correo) y elige su propia contraseña. Necesita conexión a internet.</p>
      </div>
    </Dialogo>
  );
}

export function FichaPersonal() {
  const { id } = useParams();
  const { colegioId, usuario: yo } = useApp();
  const avisar = useAvisar();
  const e = useEstructura();
  const persona = useLiveQuery(async () => (await db.tabla("usuario").get(id!)) ?? null, [id]);
  const datos = useLiveQuery(async () => {
    const asig = vivas(await db.tabla("docente_asignacion").where("docente_id").equals(id!).toArray());
    const todas = vivas(await db.tabla("docente_asignacion").toArray());
    const areas = await db.tabla("area").toArray();
    return { asig, todas, areas };
  }, [id]);
  const personal = usePersonal() ?? [];
  const [editando, setEditando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const cuentas = useCuentas();
  const [nuevaClave, setNuevaClave] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"clave" | "estado" | null>(null);

  if (persona === null) return <Contenido><Vacio icono={UserX} titulo="No se encontró a la persona" accion={<BotonRegresar a="/configuracion/personal" />} /></Contenido>;
  if (!persona || !datos || !e) return null;
  const tutorDe = e.secciones.filter((s) => s.tutor_id === persona.id);
  const areaPorId = new Map(datos.areas.map((a) => [a.id, a]));
  const porSeccion = e.secciones
    .map((s) => ({ s, asig: datos.asig.filter((a) => a.seccion_id === s.id) }))
    .filter((x) => x.asig.length > 0);

  const quitar = async (asigId: string) => {
    await guardar(db, "docente_asignacion", { id: asigId, eliminado: true }, colegioId);
    avisar(textoGuardado("Asignación quitada"));
  };
  const conServidor = async (cual: "clave" | "estado", fn: () => Promise<void>) => {
    setOcupado(cual);
    try {
      await fn();
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setOcupado(null);
    }
  };
  const restablecer = () => conServidor("clave", async () => setNuevaClave(await cuentas.restablecer(persona.id)));
  const cambiarActivo = () => conServidor("estado", async () => {
    await cuentas.cambiarEstado(persona.id, !persona.activo);
    avisar(textoGuardado(persona.activo ? "Cuenta desactivada" : "Cuenta activada"));
  });

  return (
    <>
      <Encabezado etiqueta="Personal" titulo={`${persona.nombres} ${persona.apellidos}`} />
      <Contenido>
        <Tarjeta className="aparecer flex flex-wrap items-center gap-4 p-5" style={orden(1)}>
          <Avatar u={persona} tam="h-16 w-16 text-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              {persona.roles.map((r) => <span key={r} className="rounded-full bg-sup/60 px-3 py-1 text-xs font-semibold ring-1 ring-sup">{NOMBRE_ROL[r]}</span>)}
              {!persona.activo && <span className="rounded-full bg-slate-200/80 px-3 py-1 text-xs font-bold">Inactivo</span>}
            </div>
            <p className="mt-1.5 text-sm text-tinta-suave">{persona.dni ? `DNI ${persona.dni}` : "Sin DNI"}{persona.email && ` · ${persona.email}`}</p>
            {tutorDe.length > 0 && <p className="mt-0.5 text-sm font-semibold text-blue-700">Tutor(a) de {tutorDe.map((s) => s.nombre).join(", ")}</p>}
          </div>
          <Boton variante="vidrio" onClick={() => setEditando(true)}>Editar</Boton>
        </Tarjeta>

        {persona.roles.some((r) => r === "docente" || r === "tutor") && (
          <section className="aparecer space-y-2" style={orden(2)}>
            <div className="flex items-center justify-between px-1">
              <h2 className="etiqueta">Áreas que enseña</h2>
              <Boton variante="vidrio" icono={Plus} onClick={() => setAgregando(true)} disabled={!e.secciones.length}>Asignar</Boton>
            </div>
            {porSeccion.length === 0 ? (
              <Vacio icono={BookOpen} tono="tono-cielo" titulo="Sin asignaciones">
                {e.secciones.length ? "Asigne las áreas y secciones donde enseña para que pueda registrar notas." : "Primero cree las secciones (paso 2)."}
              </Vacio>
            ) : (
              <Tarjeta className="divide-y divide-sup/70">
                {porSeccion.map(({ s, asig }) => (
                  <div key={s.id} className="px-4 py-3">
                    <p className="font-bold">{s.nombreLargo}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {asig.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-sky-100/80 py-1 pl-3 pr-1 text-xs font-semibold text-sky-900">
                          {areaPorId.get(a.area_id)?.nombre ?? "Área"}
                          <button onClick={() => quitar(a.id)} className="rounded-full p-1 hover:bg-sup/70" aria-label={`Quitar ${areaPorId.get(a.area_id)?.nombre}`}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </Tarjeta>
            )}
          </section>
        )}

        {persona.id !== yo?.id && !persona.roles.includes("ugel") && (
          <Tarjeta className="divide-y divide-sup/70">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="min-w-0 flex-1 text-sm text-tinta-suave">
                Ingresa con su DNI{persona.dni ? ` ${persona.dni}` : ""}{persona.email ? ` o con ${persona.email}` : ""}. Si olvidó su contraseña, genere una temporal.
              </p>
              <Boton variante="vidrio" icono={KeyRound} onClick={restablecer} cargando={ocupado === "clave"} disabled={!persona.activo || ocupado !== null}>
                Restablecer contraseña
              </Boton>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="min-w-0 flex-1 text-sm text-tinta-suave">{persona.activo ? "Si la persona deja el colegio, desactive su cuenta. Su historial se conserva." : "La cuenta está desactivada y no puede ingresar."}</p>
              <Boton variante={persona.activo ? "fantasma" : "vidrio"} className={persona.activo ? "text-red-700" : ""} onClick={cambiarActivo}
                cargando={ocupado === "estado"} disabled={ocupado !== null}>
                {persona.activo ? "Desactivar cuenta" : "Activar cuenta"}
              </Boton>
            </div>
          </Tarjeta>
        )}
        {nuevaClave && (
          <DialogoCredencial titulo="Contraseña restablecida" nombre={`${persona.nombres} ${persona.apellidos}`} dni={persona.dni}
            email={persona.email} clave={nuevaClave} onCerrar={() => setNuevaClave(null)} />
        )}
        <div className="flex justify-center pt-2"><BotonRegresar a="/configuracion/personal" /></div>
      </Contenido>

      {editando && <DialogoEditarPersona persona={persona} esYo={persona.id === yo?.id} onCerrar={() => setEditando(false)} />}
      {agregando && (
        <DialogoAsignar docenteId={persona.id} secciones={e.secciones} areas={datos.areas} todas={datos.todas} personal={personal}
          onCerrar={() => setAgregando(false)} />
      )}
    </>
  );
}

function DialogoEditarPersona({ persona, esYo, onCerrar }: { persona: Usuario; esYo: boolean; onCerrar(): void }) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [f, setF] = useState({ nombres: persona.nombres, apellidos: persona.apellidos, dni: persona.dni ?? "" });
  const [roles, setRoles] = useState<Rol[]>(persona.roles);
  const dniValido = !f.dni.trim() || normalizarDni(f.dni) !== null;
  const quitaSuDireccion = esYo && persona.roles.some((r) => r === "director" || r === "subdirector") && !roles.some((r) => r === "director" || r === "subdirector");
  const listo = f.nombres.trim() && f.apellidos.trim() && roles.length > 0 && dniValido && !quitaSuDireccion;

  const guardarCambios = async () => {
    // Los roles que no son de personal (p. ej. apoderado) se conservan.
    const otros = persona.roles.filter((r) => !ROLES_PERSONAL.includes(r));
    await guardar(db, "usuario", {
      id: persona.id, nombres: nombrePropio(f.nombres), apellidos: nombrePropio(f.apellidos), dni: normalizarDni(f.dni), roles: [...roles, ...otros],
    }, colegioId);
    avisar(textoGuardado("Datos actualizados"));
    onCerrar();
  };

  return (
    <Dialogo abierto titulo="Editar datos" onCerrar={onCerrar}
      acciones={<>
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        <Boton icono={Save} onClick={guardarCambios} disabled={!listo}>Guardar</Boton>
      </>}>
      <div className="space-y-3 pt-2 text-tinta">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombres"><Entrada value={f.nombres} onChange={(e) => setF({ ...f, nombres: e.target.value })} /></Campo>
          <Campo etiqueta="Apellidos"><Entrada value={f.apellidos} onChange={(e) => setF({ ...f, apellidos: e.target.value })} /></Campo>
          <Campo etiqueta="DNI" error={dniValido ? null : "8 dígitos"} ayuda={persona.dni ? "Es su usuario de ingreso: no se cambia desde la app." : undefined}>
            <Entrada inputMode="numeric" value={f.dni} disabled={!!persona.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} />
          </Campo>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLES_PERSONAL.map((r) => (
            <Casilla key={r} marcada={roles.includes(r)} onCambio={(v) => setRoles(v ? [...roles, r] : roles.filter((x) => x !== r))}>{NOMBRE_ROL[r]}</Casilla>
          ))}
        </div>
        {quitaSuDireccion && <p className="text-xs font-semibold text-red-700">No puede quitarse a sí mismo el cargo de dirección.</p>}
      </div>
    </Dialogo>
  );
}

function DialogoAsignar({ docenteId, secciones, areas, todas, personal, onCerrar }: {
  docenteId: string;
  secciones: NonNullable<ReturnType<typeof useEstructura>>["secciones"];
  areas: { id: string; nivel: string; nombre: string; orden: number; colegio_id: string | null; eliminado?: boolean }[];
  todas: { docente_id: string; seccion_id: string; area_id: string }[];
  personal: Usuario[];
  onCerrar(): void;
}) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [seccionId, setSeccionId] = useState(secciones[0]?.id ?? "");
  const [elegidas, setElegidas] = useState<string[]>([]);
  const seccion = secciones.find((s) => s.id === seccionId);
  const delNivel = areas.filter((a) => !a.eliminado && a.nivel === seccion?.grado?.nivel).sort((a, b) => a.orden - b.orden);
  const nombrePor = new Map(personal.map((p) => [p.id, p]));

  const asignar = async () => {
    await guardarLote(db, elegidas.map((area_id) => ({ tabla: "docente_asignacion", datos: { docente_id: docenteId, seccion_id: seccionId, area_id } })), colegioId);
    avisar(textoGuardado(`${elegidas.length} ${elegidas.length === 1 ? "área asignada" : "áreas asignadas"}`));
    onCerrar();
  };

  return (
    <Dialogo tam="grande" abierto titulo="Asignar áreas" onCerrar={onCerrar}
      acciones={<>
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        <Boton icono={Plus} onClick={asignar} disabled={!elegidas.length}>Asignar {elegidas.length || ""}</Boton>
      </>}>
      <div className="space-y-3 pt-2 text-tinta">
        <Campo etiqueta="Sección">
          <Selector value={seccionId} onChange={(ev) => { setSeccionId(ev.target.value); setElegidas([]); }}>
            {secciones.map((s) => <option key={s.id} value={s.id}>{s.nombreLargo}</option>)}
          </Selector>
        </Campo>
        <div className="max-h-[45dvh] space-y-1.5 overflow-y-auto pr-1">
          {delNivel.map((a) => {
            const deEste = todas.some((t) => t.docente_id === docenteId && t.seccion_id === seccionId && t.area_id === a.id);
            const otro = todas.find((t) => t.docente_id !== docenteId && t.seccion_id === seccionId && t.area_id === a.id);
            return (
              <Casilla key={a.id} marcada={deEste || elegidas.includes(a.id)}
                onCambio={(v) => !deEste && setElegidas(v ? [...elegidas, a.id] : elegidas.filter((x) => x !== a.id))}>
                {a.nombre}
                {deEste && <span className="ml-1 text-xs font-normal text-tinta-suave">(ya asignada)</span>}
                {otro && <span className="ml-1 text-xs font-normal text-amber-700">(la enseña {nombrePor.get(otro.docente_id)?.apellidos.split(" ")[0] ?? "otro docente"})</span>}
              </Casilla>
            );
          })}
        </div>
      </div>
    </Dialogo>
  );
}
