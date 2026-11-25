import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarRange, LayoutGrid, Plus, Save, Trash2, UserRound } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { NIVEL_TEXTO, nombreCompleto, usePersonal, useEstructura, type SeccionDetalle } from "@/datos/consultas";
import { guardarLote, type Escritura } from "@/db/repositorio";
import type { Grado, Usuario } from "@/db/tipos";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Boton, BotonRegresar, Contenido, Dialogo, Encabezado, Tarjeta, cx } from "@/ui/componentes";
import { Campo, Entrada, Selector, Vacio } from "@/ui/formulario";

type Edicion = { grado: Grado; seccion?: SeccionDetalle };

export function SeccionesPagina() {
  const e = useEstructura();
  const personal = usePersonal() ?? [];
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  if (!e) return null;

  return (
    <>
      <Encabezado etiqueta="Configuración · Paso 2" titulo="Grados y secciones" subtitulo={e.anio ? `Año escolar ${e.anio.anio}` : undefined} />
      <Contenido ancho="max-w-4xl">
        {!e.anio ? (
          <Vacio icono={CalendarRange} tono="tono-cielo" titulo="Primero cree el año escolar"
            accion={<Link to="/configuracion/anio"><Boton>Ir al paso 1</Boton></Link>}>
            Las secciones pertenecen a un año escolar.
          </Vacio>
        ) : (
          (["primaria", "secundaria"] as const).map((nivel) => {
            const grados = e.grados.filter((g) => g.nivel === nivel);
            if (!grados.length) return null;
            return (
              <section key={nivel} className="space-y-2">
                <h2 className="etiqueta px-1">{NIVEL_TEXTO[nivel]}</h2>
                <Tarjeta className="divide-y divide-sup/70">
                  {grados.map((g) => {
                    const secs = e.secciones.filter((s) => s.grado_id === g.id);
                    return (
                      <div key={g.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                        <p className="w-28 shrink-0 font-bold">{g.nombre}</p>
                        <div className="flex flex-1 flex-wrap gap-2">
                          {secs.map((s) => (
                            <button key={s.id} onClick={() => setEdicion({ grado: g, seccion: s })} aria-label={`Editar sección ${s.nombre}: ${s.estudiantes} estudiantes`}
                              className="flex items-center gap-2 rounded-2xl bg-sup/55 py-1.5 pl-1.5 pr-3 text-left ring-1 ring-sup transition hover:bg-sup/80 active:scale-95">
                              <span className="gema tono-lila titulo-display h-9 w-9 !rounded-xl text-base font-bold"><span className="relative z-10">{s.letra}</span></span>
                              <span className="text-xs leading-tight">
                                <span className="block font-semibold">{s.estudiantes} estudiantes</span>
                                <span className={cx("block", s.tutor ? "text-tinta-suave" : "text-amber-700")}>{s.tutor ? `Tutor: ${s.tutor.apellidos.split(" ")[0]}` : "Sin tutor"}</span>
                              </span>
                            </button>
                          ))}
                          <button onClick={() => setEdicion({ grado: g })} aria-label={`Agregar sección a ${g.nombre}`}
                            className="flex h-12 items-center gap-1.5 rounded-2xl border border-dashed border-tinta/25 px-3 text-xs font-semibold text-tinta-suave transition hover:bg-sup/40">
                            <Plus className="h-4 w-4" aria-hidden /> Sección
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </Tarjeta>
              </section>
            );
          })
        )}
        {e.anio && e.grados.length === 0 && (
          <Vacio icono={LayoutGrid} titulo="No hay grados" accion={<Link to="/configuracion/anio"><Boton>Elegir niveles</Boton></Link>}>
            Elija en el paso 1 si el colegio tiene primaria, secundaria o ambas.
          </Vacio>
        )}
        <div className="flex justify-center pt-2"><BotonRegresar a="/configuracion" /></div>
      </Contenido>

      {edicion && e.anio && (
        <DialogoSeccion key={edicion.seccion?.id ?? edicion.grado.id} edicion={edicion} anioId={e.anio.id}
          secciones={e.secciones} docentes={personal.filter((p) => p.roles.some((r) => r === "docente" || r === "tutor"))}
          onCerrar={() => setEdicion(null)} />
      )}
    </>
  );
}

function siguienteLetra(usadas: string[]): string {
  for (let i = 0; i < 26; i++) {
    const l = String.fromCharCode(65 + i);
    if (!usadas.includes(l)) return l;
  }
  return "";
}

function DialogoSeccion({ edicion, anioId, secciones, docentes, onCerrar }: {
  edicion: Edicion; anioId: string; secciones: SeccionDetalle[]; docentes: Usuario[]; onCerrar(): void;
}) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const { grado, seccion } = edicion;
  const delGrado = secciones.filter((s) => s.grado_id === grado.id && s.id !== seccion?.id);
  const [letra, setLetra] = useState(seccion?.letra ?? siguienteLetra(delGrado.map((s) => s.letra)));
  const [tutorId, setTutorId] = useState(seccion?.tutor_id ?? "");
  const [guardando, setGuardando] = useState(false);

  const letraLimpia = letra.trim().toUpperCase();
  const error = !letraLimpia ? "Escriba la letra o nombre de la sección"
    : delGrado.some((s) => s.letra.toUpperCase() === letraLimpia) ? `Ya existe la sección "${letraLimpia}" en ${grado.nombre}` : null;
  const tutorDeOtra = tutorId ? secciones.find((s) => s.tutor_id === tutorId && s.id !== seccion?.id) : undefined;

  const guardar = async () => {
    setGuardando(true);
    try {
      const escrituras: Escritura[] = [{
        tabla: "seccion",
        datos: { ...(seccion ? { id: seccion.id } : { anio_id: anioId, grado_id: grado.id }), letra: letraLimpia, tutor_id: tutorId || null },
      }];
      // Quien es tutor de aula necesita el rol "tutor" para ver el módulo de tutoría.
      const tutor = docentes.find((d) => d.id === tutorId);
      if (tutor && !tutor.roles.includes("tutor")) escrituras.push({ tabla: "usuario", datos: { id: tutor.id, roles: [...tutor.roles, "tutor"] } });
      await guardarLote(db, escrituras, colegioId);
      avisar(textoGuardado(seccion ? "Sección actualizada" : `Sección ${grado.nombre} "${letraLimpia}" creada`));
      onCerrar();
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    await guardarLote(db, [{ tabla: "seccion", datos: { id: seccion!.id, eliminado: true } }], colegioId);
    avisar(textoGuardado("Sección eliminada"));
    onCerrar();
  };

  return (
    <Dialogo abierto titulo={seccion ? `${grado.nombre} "${seccion.letra}"` : `Nueva sección de ${grado.nombre}`} onCerrar={onCerrar}
      acciones={<>
        {seccion && (
          <Boton variante="fantasma" icono={Trash2} className="mr-auto text-red-700" onClick={eliminar} disabled={seccion.estudiantes > 0}
            title={seccion.estudiantes > 0 ? "Tiene estudiantes matriculados" : undefined}>Eliminar</Boton>
        )}
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        <Boton icono={Save} onClick={guardar} cargando={guardando} disabled={!!error}>Guardar</Boton>
      </>}>
      <div className="space-y-4 pt-2 text-tinta">
        <Campo etiqueta="Sección" error={letra ? error : null} ayuda="Normalmente una letra: A, B, C...">
          <Entrada value={letra} maxLength={12} onChange={(ev) => setLetra(ev.target.value)} autoFocus />
        </Campo>
        <Campo etiqueta="Tutor(a) de aula" ayuda={docentes.length ? undefined : "Primero registre al personal en el paso 3."}>
          <Selector value={tutorId} onChange={(ev) => setTutorId(ev.target.value)}>
            <option value="">Sin tutor por ahora</option>
            {docentes.map((d) => <option key={d.id} value={d.id}>{nombreCompleto(d)}</option>)}
          </Selector>
        </Campo>
        {tutorDeOtra && (
          <p className="flex items-center gap-2 text-xs text-amber-800">
            <UserRound className="h-4 w-4" aria-hidden /> También es tutor(a) de {tutorDeOtra.nombre}.
          </p>
        )}
        {seccion && seccion.estudiantes > 0 && <p className="text-xs text-tinta-suave">No se puede eliminar: tiene {seccion.estudiantes} estudiantes matriculados.</p>}
      </div>
    </Dialogo>
  );
}
