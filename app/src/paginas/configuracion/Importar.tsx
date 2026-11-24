import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { CircleCheck, Download, FileSpreadsheet, FileUp, TriangleAlert, Upload } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { descargarPlantilla, leerLibro, type LibroLeido } from "@/datos/excel";
import { useEstructura } from "@/datos/consultas";
import { guardarLote } from "@/db/repositorio";
import { ETIQUETA_CAMPO, convertirFilas, detectarEncabezado, mapeoSuficiente, type Campo, type Mapeo } from "@/dominio/importar";
import { planificarImportacion, type Destino, type ResultadoPlan } from "@/dominio/matricula";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Aviso, Boton, BotonRegresar, Contenido, Encabezado, Gema, Tarjeta, cx, orden } from "@/ui/componentes";
import { Campo as CampoForm, Casilla, Segmentado, Selector } from "@/ui/formulario";

const CAMPOS_VISIBLES: Campo[] = ["dni", "apellido_paterno", "apellido_materno", "apellidos", "nombres", "nombre_completo", "sexo", "fecha_nacimiento", "codigo", "grado", "seccion"];

export function ImportarPagina() {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const e = useEstructura();
  const [params] = useSearchParams();
  const [libro, setLibro] = useState<LibroLeido | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [hoja, setHoja] = useState(0);
  const [encabezado, setEncabezado] = useState(0);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [modo, setModo] = useState<"seccion" | "columnas">("seccion");
  const [seccionId, setSeccionId] = useState(params.get("seccion") ?? "");
  const [nivel, setNivel] = useState<"primaria" | "secundaria">("secundaria");
  // Si el colegio tiene un solo nivel, no se pregunta.
  const nivelesColegio = [...new Set((e?.grados ?? []).map((g) => g.nivel))];
  useEffect(() => {
    if (nivelesColegio.length === 1 && nivel !== nivelesColegio[0]) setNivel(nivelesColegio[0]);
  }, [nivelesColegio.join(), nivel]); // eslint-disable-line react-hooks/exhaustive-deps
  const [actualizar, setActualizar] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [hecho, setHecho] = useState<ResultadoPlan | null>(null);

  const existentes = useLiveQuery(async () => ({
    estudiantes: await db.tabla("estudiante").toArray(),
    matriculas: await db.tabla("matricula").toArray(),
  }));

  const filasHoja = libro?.hojas[hoja]?.filas ?? [];

  const elegirHoja = (indice: number, l = libro) => {
    setHoja(indice);
    const det = detectarEncabezado(l?.hojas[indice]?.filas ?? []);
    setEncabezado(det?.indice ?? 0);
    setMapeo(det?.mapeo ?? {});
    if (det?.mapeo.grado !== undefined && det.mapeo.seccion !== undefined) setModo("columnas");
    if (!det) setError("No se encontraron encabezados reconocibles (DNI, Apellidos, Nombres...). Revise la hoja o use la plantilla.");
  };

  const abrir = async (ev: ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!archivo) return;
    setError(null);
    setHecho(null);
    setLeyendo(true);
    try {
      const l = await leerLibro(archivo);
      setLibro(l);
      setNombreArchivo(archivo.name);
      // Se elige la primera hoja que tenga encabezados reconocibles.
      const idx = Math.max(0, l.hojas.findIndex((h) => detectarEncabezado(h.filas)));
      elegirHoja(idx, l);
    } catch {
      setError("No se pudo leer el archivo. Use un Excel (.xlsx o .xls) o un .csv.");
    } finally {
      setLeyendo(false);
    }
  };

  const filas = useMemo(() => (libro ? convertirFilas(filasHoja, encabezado, mapeo) : []), [libro, filasHoja, encabezado, mapeo]);
  const columnas = (filasHoja[encabezado] ?? []).map((c, i) => ({ i, texto: c === null || c === undefined || c === "" ? `Columna ${i + 1}` : String(c) }));

  const destino: Destino | null = modo === "seccion" ? (seccionId ? { tipo: "seccion", seccionId } : null) : { tipo: "columnas", nivel };
  const plan = useMemo(() => {
    if (!e?.anio || !existentes || !destino || !filas.length) return null;
    return planificarImportacion({
      filas, destino, anioId: e.anio.id, secciones: e.secciones, grados: e.grados,
      estudiantes: existentes.estudiantes, matriculas: existentes.matriculas, actualizarExistentes: actualizar,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, modo, seccionId, nivel, actualizar, e, existentes]);

  const conErrores = filas.filter((f) => f.errores.length).length;
  const conAvisos = filas.filter((f) => !f.errores.length && f.avisos.length).length;

  const importar = async () => {
    if (!plan) return;
    setImportando(true);
    try {
      await guardarLote(db, plan.escrituras, colegioId);
      setHecho(plan);
      avisar(textoGuardado(`${plan.matriculados} estudiantes matriculados`));
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setImportando(false);
    }
  };

  if (!e) return null;

  if (hecho) {
    return (
      <>
        <Encabezado etiqueta="Estudiantes" titulo="Importación terminada" />
        <Contenido ancho="max-w-3xl">
          <Tarjeta fuerte className="aparecer space-y-4 p-6">
            <div className="flex items-center gap-4">
              <Gema icono={CircleCheck} tono="tono-musgo" tam="lg" />
              <div>
                <p className="titulo-display text-3xl font-bold">{hecho.matriculados}</p>
                <p className="text-sm text-tinta-suave">estudiantes matriculados</p>
              </div>
            </div>
            <ul className="space-y-1 text-sm">
              <li>{hecho.nuevos} registrados por primera vez</li>
              {hecho.actualizados > 0 && <li>{hecho.actualizados} actualizados (ya existían por su DNI)</li>}
              {hecho.yaMatriculados > 0 && <li>{hecho.yaMatriculados} ya estaban en esa sección</li>}
              {hecho.omitidas.length > 0 && <li className="text-amber-800">{hecho.omitidas.length} filas no se importaron</li>}
            </ul>
            {hecho.omitidas.length > 0 && <ListaOmitidas omitidas={hecho.omitidas} />}
            <div className="flex flex-wrap gap-2">
              <Link to={`/configuracion/estudiantes${modo === "seccion" ? `?seccion=${seccionId}` : ""}`}><Boton>Ver estudiantes</Boton></Link>
              <Boton variante="vidrio" icono={Upload} onClick={() => { setHecho(null); setLibro(null); }}>Importar otro archivo</Boton>
            </div>
          </Tarjeta>
        </Contenido>
      </>
    );
  }

  return (
    <>
      <Encabezado etiqueta="Estudiantes" titulo="Importar desde Excel" subtitulo="Sirve la plantilla o la nómina que ya tiene (por ejemplo, exportada del SIAGIE)." />
      <Contenido ancho="max-w-4xl">
        <Tarjeta className="aparecer p-5" style={orden(1)}>
          <label className={cx("flex cursor-pointer flex-col items-center gap-3 rounded-[1.25rem] border-2 border-dashed border-teal-600/30 bg-white/30 px-4 py-8 text-center transition hover:bg-white/50", leyendo && "opacity-60")}>
            <Gema icono={FileUp} tono="tono-laguna" tam="lg" />
            <span className="font-bold">{nombreArchivo || "Elegir archivo"}</span>
            <span className="text-xs text-tinta-suave">{libro ? "Toque para elegir otro" : ".xlsx, .xls o .csv · se lee en este equipo, sin internet"}</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={abrir} disabled={leyendo} />
          </label>
          <div className="mt-3 flex justify-center">
            <Boton variante="fantasma" icono={Download} onClick={() => void descargarPlantilla()}>Descargar plantilla</Boton>
          </div>
        </Tarjeta>

        {error && <Aviso tipo="error" icono={TriangleAlert}>{error}</Aviso>}

        {libro && (
          <>
            <Tarjeta className="aparecer space-y-4 p-5" style={orden(2)}>
              <h2 className="font-bold">1. Columnas del archivo</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {libro.hojas.length > 1 && (
                  <CampoForm etiqueta="Hoja">
                    <Selector value={hoja} onChange={(ev) => elegirHoja(+ev.target.value)}>
                      {libro.hojas.map((h, i) => <option key={h.nombre} value={i}>{h.nombre}</option>)}
                    </Selector>
                  </CampoForm>
                )}
                <CampoForm etiqueta="Fila de encabezados" ayuda="Detectada automáticamente.">
                  <Selector value={encabezado} onChange={(ev) => setEncabezado(+ev.target.value)}>
                    {filasHoja.slice(0, 30).map((f, i) => (
                      <option key={i} value={i}>Fila {i + 1}: {f.filter((c) => c !== null && c !== "").slice(0, 4).join(" | ").slice(0, 60)}</option>
                    ))}
                  </Selector>
                </CampoForm>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {CAMPOS_VISIBLES.map((c) => (
                  <CampoForm key={c} etiqueta={ETIQUETA_CAMPO[c]}>
                    <Selector value={mapeo[c] ?? ""} onChange={(ev) => setMapeo({ ...mapeo, [c]: ev.target.value === "" ? undefined : +ev.target.value })}>
                      <option value="">No usar</option>
                      {columnas.map((col) => <option key={col.i} value={col.i}>{col.texto}</option>)}
                    </Selector>
                  </CampoForm>
                ))}
              </div>
              {!mapeoSuficiente(mapeo) && (
                <Aviso tipo="alerta" icono={TriangleAlert}>Indique qué columnas tienen los apellidos y los nombres (o una columna con ambos).</Aviso>
              )}
            </Tarjeta>

            <Tarjeta className="aparecer space-y-4 p-5" style={orden(3)}>
              <h2 className="font-bold">2. ¿Dónde se matriculan?</h2>
              <Segmentado etiqueta="Destino" valor={modo} onCambio={setModo} opciones={[
                { valor: "seccion", texto: "En una sección" },
                { valor: "columnas", texto: "Según grado y sección" },
              ]} />
              {modo === "seccion" ? (
                <CampoForm etiqueta="Sección">
                  <Selector value={seccionId} onChange={(ev) => setSeccionId(ev.target.value)}>
                    <option value="">Elija la sección</option>
                    {e.secciones.map((s) => <option key={s.id} value={s.id}>{s.nombreLargo}</option>)}
                  </Selector>
                </CampoForm>
              ) : (
                <>
                  {nivelesColegio.length > 1 && (
                    <Segmentado etiqueta="Nivel" valor={nivel} onCambio={setNivel} opciones={[{ valor: "primaria", texto: "Primaria" }, { valor: "secundaria", texto: "Secundaria" }]} />
                  )}
                  {(mapeo.grado === undefined || mapeo.seccion === undefined) && (
                    <Aviso tipo="alerta" icono={TriangleAlert}>Indique arriba las columnas "Grado" y "Sección".</Aviso>
                  )}
                </>
              )}
              <Casilla marcada={actualizar} onCambio={setActualizar}>Actualizar nombres y datos de estudiantes que ya existen (mismo DNI)</Casilla>
            </Tarjeta>

            <Tarjeta className="aparecer space-y-3 p-5" style={orden(4)}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto font-bold">3. Revisión ({filas.length} filas)</h2>
                <span className="rounded-full bg-emerald-100/80 px-3 py-1 text-xs font-bold text-emerald-800">{filas.length - conErrores - conAvisos} correctas</span>
                {conAvisos > 0 && <span className="rounded-full bg-amber-100/80 px-3 py-1 text-xs font-bold text-amber-800">{conAvisos} con avisos</span>}
                {conErrores > 0 && <span className="rounded-full bg-red-100/80 px-3 py-1 text-xs font-bold text-red-800">{conErrores} con errores</span>}
              </div>
              <div className="max-h-[50dvh] overflow-auto rounded-2xl bg-white/40 ring-1 ring-white/80">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="sticky top-0 bg-white/85 text-xs uppercase tracking-wider text-tinta-suave backdrop-blur">
                    <tr><th className="px-3 py-2">Fila</th><th className="px-3 py-2">Apellidos</th><th className="px-3 py-2">Nombres</th><th className="px-3 py-2">DNI</th><th className="px-3 py-2">Sexo</th><th className="px-3 py-2">Nacimiento</th><th className="px-3 py-2">Estado</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/70">
                    {filas.slice(0, 300).map((f) => (
                      <tr key={f.fila} className={cx(f.errores.length ? "bg-red-50/60" : f.avisos.length ? "bg-amber-50/40" : "")}>
                        <td className="px-3 py-2 text-tinta-suave">{f.fila}</td>
                        <td className="px-3 py-2 font-semibold">{f.apellidos}</td>
                        <td className="px-3 py-2">{f.nombres}</td>
                        <td className="px-3 py-2 font-mono text-xs">{f.dni ?? "-"}</td>
                        <td className="px-3 py-2">{f.sexo ?? "-"}</td>
                        <td className="px-3 py-2">{f.fecha_nacimiento ?? "-"}</td>
                        <td className="px-3 py-2 text-xs">
                          {f.errores.length ? <span className="font-semibold text-red-700">{f.errores.join("; ")}</span>
                            : f.avisos.length ? <span className="text-amber-800">{f.avisos.join("; ")}</span>
                              : <CircleCheck className="h-4 w-4 text-teal-600" aria-label="Correcta" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filas.length > 300 && <p className="text-xs text-tinta-suave">Se muestran las primeras 300 filas; se importan todas.</p>}
            </Tarjeta>

            {plan && (
              <Tarjeta fuerte className="aparecer space-y-3 p-5" style={orden(5)}>
                <div className="flex items-start gap-3">
                  <Gema icono={FileSpreadsheet} tono="tono-musgo" />
                  <div className="text-sm">
                    <p className="font-bold">Al importar:</p>
                    <p>Se matricularán <strong>{plan.matriculados}</strong> estudiantes ({plan.nuevos} nuevos{plan.actualizados ? `, ${plan.actualizados} actualizados` : ""}).</p>
                    {plan.yaMatriculados > 0 && <p className="text-tinta-suave">{plan.yaMatriculados} ya estaban en su sección.</p>}
                    {plan.omitidas.length > 0 && <p className="text-amber-800">{plan.omitidas.length} filas no se importarán.</p>}
                  </div>
                </div>
                {plan.omitidas.length > 0 && <ListaOmitidas omitidas={plan.omitidas} />}
                <div className="flex justify-end">
                  <Boton icono={Upload} onClick={importar} cargando={importando} disabled={!plan.escrituras.length || !mapeoSuficiente(mapeo)}>
                    Importar {plan.matriculados} estudiantes
                  </Boton>
                </div>
              </Tarjeta>
            )}
          </>
        )}
        <div className="flex justify-center pt-2"><BotonRegresar a={`/configuracion/estudiantes${seccionId ? `?seccion=${seccionId}` : ""}`} /></div>
      </Contenido>
    </>
  );
}

function ListaOmitidas({ omitidas }: { omitidas: { fila: number; motivo: string }[] }) {
  return (
    <details className="rounded-2xl bg-amber-50/60 px-4 py-2 text-sm ring-1 ring-amber-200/70">
      <summary className="cursor-pointer font-semibold text-amber-900">Ver filas omitidas</summary>
      <ul className="mt-2 space-y-1 text-amber-950">
        {omitidas.slice(0, 200).map((o) => <li key={`${o.fila}-${o.motivo}`}>Fila {o.fila}: {o.motivo}</li>)}
      </ul>
    </details>
  );
}
