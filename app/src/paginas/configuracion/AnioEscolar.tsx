import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, CalendarRange, Lock, Save, TriangleAlert } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { useEstructura } from "@/datos/consultas";
import { nuevoId } from "@/db/local";
import { guardarLote, type Escritura } from "@/db/repositorio";
import type { Grado, Nivel, Periodo } from "@/db/tipos";
import { proponerPeriodos, validarPeriodos, type PeriodoBorrador, type Regimen } from "@/dominio/periodos";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Aviso, Boton, BotonRegresar, Contenido, Dialogo, Encabezado, Gema, Tarjeta, orden } from "@/ui/componentes";
import { Campo, Casilla, Entrada, Segmentado } from "@/ui/formulario";

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
      {hayAnterior && (
        <Aviso tipo="alerta" icono={TriangleAlert}>
          Al crear el nuevo año, el actual queda como anterior (sus notas se conservan). Las secciones y matrículas del nuevo año se crean aparte.
        </Aviso>
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
