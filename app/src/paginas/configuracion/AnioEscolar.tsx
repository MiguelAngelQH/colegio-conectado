import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarPlus, CalendarRange, Lock, RotateCcw, Save, TriangleAlert } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { nombreCompleto, nombreSeccion, useEstructura } from "@/datos/consultas";
import { nuevoId } from "@/db/local";
import { guardarLote, vivas, type Escritura } from "@/db/repositorio";
import type { Grado, Matricula, Nivel, Periodo } from "@/db/tipos";
import { planificarPaso } from "@/dominio/pasoAnio";
import { proponerPeriodos, validarPeriodos, type PeriodoBorrador, type Regimen } from "@/dominio/periodos";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Aviso, Boton, BotonRegresar, Contenido, Dialogo, Encabezado, Gema, Tarjeta, orden } from "@/ui/componentes";
import { Campo, Casilla, Entrada, Segmentado, Selector } from "@/ui/formulario";

const NOMBRE_GRADO = (nivel: Nivel, n: number) => (nivel === "primaria" ? `${n}.º grado` : `${n}.º año`);
const GRADOS_POR_NIVEL: Record<Nivel, number> = { primaria: 6, secundaria: 5 };

/** Escrituras para crear los grados que faltan de los niveles elegidos. */
function gradosFaltantes(niveles: Nivel[], existentes: Grado[]): Escritura[] {
  const res: Escritura[] = [];
  for (const nivel of niveles) {
    for (let n = 1; n <= GRADOS_POR_NIVEL[nivel]; n++) {
      if (!existentes.some((g) => g.nivel === nivel && g.numero === n)) {
        res.push({ tabla: "grado", datos: { nivel, numero: n, nombre: NOMBRE_GRADO(nivel, n) } });
      }
    }
  }
  return res;
}

export function AnioEscolarPagina() {
  const e = useEstructura();
  const [creando, setCreando] = useState(false);
  if (!e) return null;
  return (
    <>
      <Encabezado etiqueta="Configuración · Paso 1" titulo="Año escolar y periodos" />
      <Contenido ancho="max-w-3xl">
        {!e.anio || creando ? (
          <NuevoAnio anioSugerido={e.anio ? e.anio.anio + 1 : new Date().getFullYear()} grados={e.grados} hayAnterior={!!e.anio} onCancelar={e.anio ? () => setCreando(false) : undefined} onCreado={() => setCreando(false)} />
        ) : (
          <EditarAnio anio={e.anio.anio} regimen={e.anio.regimen} periodos={e.periodos} grados={e.grados} onNuevo={() => setCreando(true)} />
        )}
        <div className="flex justify-center pt-2"><BotonRegresar a="/configuracion" /></div>
      </Contenido>
    </>
  );
}

function SelectorNiveles({ niveles, onCambio, bloqueados = [] }: { niveles: Nivel[]; onCambio(n: Nivel[]): void; bloqueados?: Nivel[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(["primaria", "secundaria"] as Nivel[]).map((n) => (
        <Casilla key={n} marcada={niveles.includes(n)}
          onCambio={(v) => { if (!bloqueados.includes(n)) onCambio(v ? [...niveles, n] : niveles.filter((x) => x !== n)); }}>
          {n === "primaria" ? "Primaria (1.º a 6.º grado)" : "Secundaria (1.º a 5.º año)"}
          {bloqueados.includes(n) && <span className="ml-1 text-xs font-normal text-tinta-suave">(en uso)</span>}
        </Casilla>
      ))}
    </div>
  );
}

function EditorPeriodos({ periodos, onCambio, cerrados = [] }: { periodos: PeriodoBorrador[]; onCambio(p: PeriodoBorrador[]): void; cerrados?: number[] }) {
  const set = (i: number, campo: "inicio" | "fin", v: string) => onCambio(periodos.map((p, j) => (j === i ? { ...p, [campo]: v } : p)));
  return (
    <div className="space-y-2">
      {periodos.map((p, i) => (
        <div key={p.numero} className="grid grid-cols-[minmax(0,1fr)] items-end gap-2 rounded-2xl bg-white/35 p-3 ring-1 ring-white/70 sm:grid-cols-[9rem_1fr_1fr]">
          <p className="flex items-center gap-1.5 self-center font-bold">
            {p.nombre}
            {cerrados.includes(p.numero) && <Lock className="h-3.5 w-3.5 text-tinta-suave" aria-label="Cerrado" />}
          </p>
          <Campo etiqueta="Inicio"><Entrada type="date" value={p.inicio} onChange={(ev) => set(i, "inicio", ev.target.value)} /></Campo>
          <Campo etiqueta="Fin"><Entrada type="date" value={p.fin} onChange={(ev) => set(i, "fin", ev.target.value)} /></Campo>
        </div>
      ))}
    </div>
  );
}

/** Año activo actual, con sus secciones, matrículas y asignaciones: base del paso al año siguiente. */
async function datosAnioActual() {
  const anio = vivas(await db.tabla("anio_escolar").toArray()).find((a) => a.activo);
  if (!anio) return null;
  const secciones = vivas(await db.tabla("seccion").where("anio_id").equals(anio.id).toArray());
  const ids = new Set(secciones.map((x) => x.id));
  const matriculas = vivas(await db.tabla("matricula").toArray()).filter((m) => m.anio_id === anio.id);
  const asignaciones = vivas(await db.tabla("docente_asignacion").toArray()).filter((a) => ids.has(a.seccion_id));
  return { anio, secciones, matriculas, asignaciones };
}

function NuevoAnio({ anioSugerido, grados, hayAnterior, onCancelar, onCreado }: {
  anioSugerido: number; grados: Grado[]; hayAnterior: boolean; onCancelar?: () => void; onCreado(): void;
}) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [anio, setAnio] = useState(anioSugerido);
  const [regimen, setRegimen] = useState<Regimen>("bimestre");
  const [niveles, setNiveles] = useState<Nivel[]>(() => {
    const n = [...new Set(grados.map((g) => g.nivel))];
    return n.length ? n : ["primaria", "secundaria"];
  });
  const [periodos, setPeriodos] = useState<PeriodoBorrador[]>(() => proponerPeriodos(anioSugerido, "bimestre"));
  const [guardando, setGuardando] = useState(false);
  const [promover, setPromover] = useState(true);
  const [mantenerDocentes, setMantenerDocentes] = useState(false);
  const actual = useLiveQuery(datosAnioActual, []);
  const vistaPrevia = useMemo(() => {
    if (!actual) return null;
    let n = 0;
    return planificarPaso({
      nuevoAnioId: "x", seccionesAnteriores: actual.secciones, matriculasAnteriores: actual.matriculas, grados,
      mantenerDocentes, asignacionesAnteriores: actual.asignaciones, nuevoId: () => `x${++n}`,
    });
  }, [actual, grados, mantenerDocentes]);
  useEffect(() => setPeriodos(proponerPeriodos(anio, regimen)), [anio, regimen]);
  const errores = useMemo(() => validarPeriodos(anio, periodos), [anio, periodos]);

  const crear = async () => {
    setGuardando(true);
    try {
      const anteriores = (await db.tabla("anio_escolar").toArray()).filter((a) => a.activo);
      const nuevoAnio: Escritura = { tabla: "anio_escolar", datos: { anio, regimen, activo: true } };
      const escrituras: Escritura[] = [
        ...anteriores.map((a) => ({ tabla: "anio_escolar" as const, datos: { id: a.id, activo: false } })),
        nuevoAnio,
      ];
      // El id del año se necesita para los periodos: se genera aquí.
      const anioId = nuevoId();
      nuevoAnio.datos.id = anioId;
      escrituras.push(...periodos.map((p) => ({ tabla: "periodo" as const, datos: { ...p, anio_id: anioId, estado: "abierto" as const } })));
      escrituras.push(...gradosFaltantes(niveles, grados));
      // Matrícula del nuevo año según la situación final de cada estudiante.
      if (hayAnterior && promover && actual) {
        const plan = planificarPaso({
          nuevoAnioId: anioId, seccionesAnteriores: actual.secciones, matriculasAnteriores: actual.matriculas, grados,
          mantenerDocentes, asignacionesAnteriores: actual.asignaciones, nuevoId,
        });
        escrituras.push(...plan.secciones.map((x) => ({ tabla: "seccion" as const, datos: x })));
        escrituras.push(...plan.matriculas.map((x) => ({ tabla: "matricula" as const, datos: x })));
        escrituras.push(...plan.asignaciones.map((x) => ({ tabla: "docente_asignacion" as const, datos: x })));
      }
      await guardarLote(db, escrituras, colegioId);
      avisar(textoGuardado(`Año ${anio} creado`));
      onCreado();
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Tarjeta className="aparecer space-y-5 p-5 sm:p-6" style={orden(1)}>
      <div className="flex items-center gap-3">
        <Gema icono={CalendarPlus} tono="tono-cielo" />
        <div>
          <h2 className="titulo-display text-xl font-bold">{hayAnterior ? "Nuevo año escolar" : "Crear el año escolar"}</h2>
          <p className="text-sm text-tinta-suave">Las fechas se proponen según el calendario habitual; puede ajustarlas.</p>
        </div>
      </div>
      {hayAnterior && actual && !actual.anio.cerrado_en && (
        <Aviso tipo="alerta" icono={TriangleAlert}>
          El año {actual.anio.anio} aún no está cerrado. Conviene cerrarlo primero (Configuración, Cierre del año) para fijar la situación final de cada estudiante.
        </Aviso>
      )}
      {hayAnterior && (
        <div className="space-y-2 rounded-2xl bg-white/40 p-4 ring-1 ring-white/80">
          <Casilla marcada={promover} onCambio={setPromover}>Matricular a los estudiantes en su nuevo grado según la situación final</Casilla>
          {promover && vistaPrevia && (
            <ul className="space-y-0.5 pl-1 text-sm text-tinta-suave">
              <li><strong className="text-tinta">{vistaPrevia.matriculas.length}</strong> matrículas en {vistaPrevia.secciones.length} secciones (mismas letras; el grado según su situación).</li>
              <li><strong className="text-tinta">{vistaPrevia.egresados.length}</strong> egresan (5.º de secundaria promovidos).</li>
              {vistaPrevia.pendientesRecuperacion.length > 0 && (
                <li><strong className="text-tinta">{vistaPrevia.pendientesRecuperacion.length}</strong> pasan de grado pendientes de su recuperación: registre el resultado en enero o febrero.</li>
              )}
              {vistaPrevia.sinSituacion.length > 0 && (
                <li className="text-amber-800"><strong>{vistaPrevia.sinSituacion.length}</strong> sin situación confirmada: se usa la propuesta de la app.</li>
              )}
            </ul>
          )}
          {promover && <Casilla marcada={mantenerDocentes} onCambio={setMantenerDocentes}>Mantener tutores y docentes en cada sección (mismo grado y letra)</Casilla>}
          <p className="text-xs text-tinta-suave">El año actual y todo su historial se conservan. Los estudiantes nuevos se matriculan después, como siempre.</p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Año"><Entrada type="number" min={2020} max={2100} value={anio} onChange={(ev) => setAnio(+ev.target.value)} /></Campo>
        <div>
          <span className="mb-1.5 block text-sm font-semibold">Régimen de evaluación</span>
          <Segmentado etiqueta="Régimen" valor={regimen} onCambio={setRegimen}
            opciones={[{ valor: "bimestre", texto: "Bimestres" }, { valor: "trimestre", texto: "Trimestres" }]} />
        </div>
      </div>
      <div>
        <span className="mb-1.5 block text-sm font-semibold">Niveles que ofrece el colegio</span>
        <SelectorNiveles niveles={niveles} onCambio={setNiveles} />
      </div>
      <div>
        <span className="mb-1.5 block text-sm font-semibold">Periodos</span>
        <EditorPeriodos periodos={periodos} onCambio={setPeriodos} />
      </div>
      {errores.length > 0 && <Aviso tipo="error" icono={TriangleAlert}>{errores.map((x) => <p key={x}>{x}</p>)}</Aviso>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancelar && <Boton variante="fantasma" onClick={onCancelar}>Cancelar</Boton>}
        <Boton icono={Save} onClick={crear} cargando={guardando} disabled={errores.length > 0 || niveles.length === 0}>Crear año {anio}</Boton>
      </div>
    </Tarjeta>
  );
}

/** Estudiantes del año anterior en RR sin resultado de recuperación, con su matrícula de este año. */
function RecuperacionPendiente() {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [abierto, setAbierto] = useState(false);
  const [resultados, setResultados] = useState<Record<string, "PRO" | "PER">>({});
  const datos = useLiveQuery(async () => {
    const anios = vivas(await db.tabla("anio_escolar").toArray()).sort((a, b) => b.anio - a.anio);
    const actual = anios.find((a) => a.activo);
    const anterior = actual ? anios.find((a) => a.anio < actual.anio) : undefined;
    if (!actual || !anterior) return null;
    const mats = vivas(await db.tabla("matricula").toArray());
    const pendientes = mats.filter((m) => m.anio_id === anterior.id && m.situacion_final === "RR" && !m.resultado_recuperacion);
    const [estudiantes, secciones, grados] = await Promise.all([
      db.tabla("estudiante").bulkGet(pendientes.map((m) => m.estudiante_id)), db.tabla("seccion").toArray(), db.tabla("grado").toArray(),
    ]);
    return {
      actual, grados, secciones: vivas(secciones),
      filas: pendientes
        .map((m, i) => ({ anterior: m, estudiante: estudiantes[i], nueva: mats.find((x) => x.anio_id === actual.id && x.estudiante_id === m.estudiante_id) as Matricula | undefined }))
        .filter((f) => !!f.estudiante),
    };
  }, []);
  if (!datos || datos.filas.length === 0) return null;
  const nombreSec = (id: string) => {
    const s = datos.secciones.find((x) => x.id === id);
    return s ? nombreSeccion(datos.grados.find((g) => g.id === s.grado_id), s) : "-";
  };

  const guardarResultados = async () => {
    const escrituras: Escritura[] = [];
    for (const f of datos.filas) {
      const r = resultados[f.anterior.id];
      if (!r) continue;
      escrituras.push({ tabla: "matricula", datos: { id: f.anterior.id, resultado_recuperacion: r } });
      // Si no aprobó la recuperación, permanece en el grado del año anterior (misma letra).
      if (r === "PER" && f.nueva) {
        const secAnt = datos.secciones.find((s) => s.id === f.anterior.seccion_id);
        if (!secAnt) continue;
        let destinoId = datos.secciones.find((s) => s.anio_id === datos.actual.id && s.grado_id === secAnt.grado_id && s.letra === secAnt.letra)?.id;
        if (!destinoId) {
          destinoId = nuevoId();
          escrituras.push({ tabla: "seccion", datos: { id: destinoId, anio_id: datos.actual.id, grado_id: secAnt.grado_id, letra: secAnt.letra, tutor_id: null } });
        }
        escrituras.push({ tabla: "matricula", datos: { id: f.nueva.id, seccion_id: destinoId } });
      }
    }
    await guardarLote(db, escrituras, colegioId);
    avisar(textoGuardado("Resultados de recuperación guardados"));
    setResultados({});
    setAbierto(false);
  };

  return (
    <>
      <Tarjeta className="aparecer flex flex-wrap items-center gap-4 p-5">
        <Gema icono={RotateCcw} tono="tono-ambar" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">Recuperación pedagógica</h2>
          <p className="text-sm text-tinta-suave">{datos.filas.length} estudiantes esperan el resultado de su recuperación (enero y febrero).</p>
        </div>
        <Boton variante="vidrio" onClick={() => setAbierto(true)}>Registrar resultados</Boton>
      </Tarjeta>
      <Dialogo abierto={abierto} titulo="Resultado de la recuperación" onCerrar={() => setAbierto(false)}
        acciones={<>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>Cancelar</Boton>
          <Boton icono={Save} onClick={() => void guardarResultados()} disabled={!Object.keys(resultados).length}>Guardar</Boton>
        </>}>
        <ul className="space-y-3 pt-2 text-tinta">
          {datos.filas.map((f) => (
            <li key={f.anterior.id} className="space-y-1">
              <p className="font-semibold">{nombreCompleto(f.estudiante!)}</p>
              <p className="text-xs text-tinta-suave">Hoy en {f.nueva ? nombreSec(f.nueva.seccion_id) : "sin matrícula"} · el año pasado en {nombreSec(f.anterior.seccion_id)}</p>
              <Selector value={resultados[f.anterior.id] ?? ""} aria-label={`Resultado de ${nombreCompleto(f.estudiante!)}`}
                onChange={(e) => setResultados({ ...resultados, [f.anterior.id]: e.target.value as "PRO" | "PER" })}>
                <option value="">Pendiente</option>
                <option value="PRO">Aprobó: continúa en su nuevo grado</option>
                <option value="PER">No aprobó: permanece en el grado anterior</option>
              </Selector>
            </li>
          ))}
        </ul>
      </Dialogo>
    </>
  );
}

function EditarAnio({ anio, regimen, periodos, grados, onNuevo }: {
  anio: number; regimen: Regimen; periodos: Periodo[]; grados: Grado[]; onNuevo(): void;
}) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [borrador, setBorrador] = useState<PeriodoBorrador[]>(periodos);
  const [confirmarNuevo, setConfirmarNuevo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const nivelesActuales = [...new Set(grados.map((g) => g.nivel))];
  const [niveles, setNiveles] = useState<Nivel[]>(nivelesActuales);
  const secciones = useEstructura()?.secciones ?? [];
  const enUso = nivelesActuales.filter((n) => secciones.some((s) => s.grado?.nivel === n));

  useEffect(() => setBorrador(periodos), [periodos]);
  const errores = useMemo(() => validarPeriodos(anio, borrador), [anio, borrador]);
  const cambiados = borrador.filter((b) => {
    const o = periodos.find((p) => p.numero === b.numero);
    return o && (o.inicio !== b.inicio || o.fin !== b.fin);
  });
  const nivelesNuevos = niveles.filter((n) => !nivelesActuales.includes(n));
  const nivelesQuitados = nivelesActuales.filter((n) => !niveles.includes(n));
  const hayCambios = cambiados.length > 0 || nivelesNuevos.length > 0 || nivelesQuitados.length > 0;

  const guardarCambios = async () => {
    setGuardando(true);
    try {
      const escrituras: Escritura[] = cambiados.map((b) => ({
        tabla: "periodo", datos: { id: periodos.find((p) => p.numero === b.numero)!.id, inicio: b.inicio, fin: b.fin },
      }));
      escrituras.push(...gradosFaltantes(nivelesNuevos, grados));
      escrituras.push(...grados.filter((g) => nivelesQuitados.includes(g.nivel)).map((g) => ({ tabla: "grado" as const, datos: { id: g.id, eliminado: true } })));
      await guardarLote(db, escrituras, colegioId);
      avisar(textoGuardado("Cambios guardados"));
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Tarjeta className="aparecer flex items-center gap-4 p-5" style={orden(1)}>
        <Gema icono={CalendarRange} tono="tono-cielo" tam="lg" />
        <div className="min-w-0 flex-1">
          <p className="etiqueta">Año activo</p>
          <p className="titulo-display text-3xl font-bold">{anio}</p>
          <p className="text-sm text-tinta-suave">Régimen por {regimen === "bimestre" ? "bimestres" : "trimestres"}</p>
        </div>
      </Tarjeta>

      <RecuperacionPendiente />

      <Tarjeta className="aparecer space-y-5 p-5 sm:p-6" style={orden(2)}>
        <div>
          <h2 className="mb-2 font-bold">Periodos</h2>
          <EditorPeriodos periodos={borrador} onCambio={setBorrador} cerrados={periodos.filter((p) => p.estado === "cerrado").map((p) => p.numero)} />
          <p className="mt-2 text-xs text-tinta-suave">Los periodos se cierran desde "Notas y libretas" cuando terminan de registrarse las notas.</p>
        </div>
        <div>
          <h2 className="mb-2 font-bold">Niveles</h2>
          <SelectorNiveles niveles={niveles} onCambio={setNiveles} bloqueados={enUso} />
        </div>
        {errores.length > 0 && <Aviso tipo="error" icono={TriangleAlert}>{errores.map((x) => <p key={x}>{x}</p>)}</Aviso>}
        <div className="flex flex-wrap justify-between gap-2">
          <Boton variante="vidrio" icono={CalendarPlus} onClick={() => setConfirmarNuevo(true)}>Iniciar año {anio + 1}</Boton>
          <Boton icono={Save} onClick={guardarCambios} cargando={guardando} disabled={!hayCambios || errores.length > 0}>Guardar cambios</Boton>
        </div>
      </Tarjeta>

      <Dialogo abierto={confirmarNuevo} titulo={`¿Iniciar el año ${anio + 1}?`} onCerrar={() => setConfirmarNuevo(false)}
        acciones={<>
          <Boton variante="fantasma" onClick={() => setConfirmarNuevo(false)}>Cancelar</Boton>
          <Boton onClick={() => { setConfirmarNuevo(false); onNuevo(); }}>Continuar</Boton>
        </>}>
        Use esta opción al terminar el año escolar. El año {anio} y todas sus notas se conservan.
      </Dialogo>
    </>
  );
}
