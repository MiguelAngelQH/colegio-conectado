import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CircleCheck, Eye, EyeOff, GraduationCap, KeyRound, LoaderCircle, LogOut, ShieldCheck, TriangleAlert } from "lucide-react";
import { useApp } from "@/app/contexto";
import { useColegio } from "@/datos/consultas";
import type { Rol } from "@/db/tipos";
import { LARGO_MINIMO_CLAVE, validarClaveNueva } from "@/dominio/acceso";
import { Aviso, Boton, Dialogo, Gema } from "@/ui/componentes";
import { Campo, Entrada } from "@/ui/formulario";

/** Campo de contraseña con botón para mostrarla (útil en celular, donde es fácil equivocarse). */
export function CampoClave({ etiqueta, valor, onCambio, error, autoFocus, autoComplete }: {
  etiqueta: string; valor: string; onCambio(v: string): void; error?: string | null; autoFocus?: boolean; autoComplete: string;
}) {
  const [ver, setVer] = useState(false);
  return (
    <Campo etiqueta={etiqueta} error={error}>
      <div className="relative">
        <Entrada type={ver ? "text" : "password"} value={valor} onChange={(e) => onCambio(e.target.value)} autoFocus={autoFocus}
          autoComplete={autoComplete} className="pr-12" />
        <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={ver}
          className="absolute inset-y-0 right-1 flex items-center rounded-full px-3 text-tinta-suave hover:text-tinta">
          {ver ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </Campo>
  );
}

function FormularioClave({ onListo, accionesExtra }: { onListo(): void; accionesExtra?: ReactNode }) {
  const { usuario, cambiarClave } = useApp();
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problema = nueva ? validarClaveNueva(nueva, { dni: usuario?.dni }) : null;
  const distintas = repetida.length > 0 && repetida !== nueva;
  const lista = !!nueva && !problema && repetida === nueva;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!lista) return;
    setGuardando(true);
    setError(null);
    try {
      await cambiarClave(nueva);
      onListo();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-4">
      {error && <Aviso tipo="error" icono={TriangleAlert}>{error}</Aviso>}
      <CampoClave etiqueta="Contraseña nueva" valor={nueva} onCambio={setNueva} error={problema} autoFocus autoComplete="new-password" />
      <CampoClave etiqueta="Repita la contraseña" valor={repetida} onCambio={setRepetida} error={distintas ? "No coincide con la anterior." : null} autoComplete="new-password" />
      <p className="text-xs text-tinta-suave">Al menos {LARGO_MINIMO_CLAVE} caracteres, con letras y números. No use su DNI ni su fecha de nacimiento.</p>
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" icono={KeyRound} cargando={guardando} disabled={!lista} className="flex-1">Guardar contraseña</Boton>
        {accionesExtra}
      </div>
    </form>
  );
}

/**
 * Primer ingreso o contraseña restablecida por la dirección: se muestra en lugar de la app
 * hasta que la persona elige una contraseña propia.
 */
/** Lo principal que podrá hacer cada rol: se muestra en la bienvenida. */
const QUE_PUEDE: Partial<Record<Rol, string[]>> = {
  estudiante: ["Ver tus notas por competencia y tu libreta", "Marcar tu asistencia con el QR de tu docente", "Pedir ayuda a tu tutor(a) cuando lo necesites"],
  apoderado: ["Ver las notas y la asistencia de su hijo(a)", "Justificar faltas y recibir avisos del colegio", "Pedir una entrevista con el tutor(a)"],
  docente: ["Registrar notas por competencia", "Tomar asistencia con lista o con QR", "Registrar observaciones de sus estudiantes"],
  tutor: ["Hacer seguimiento de su sección", "Atender los pedidos de ayuda de estudiantes y familias"],
  auxiliar: ["Registrar asistencia e incidencias"],
  director: ["Configurar el colegio y crear las cuentas", "Ver los indicadores y cerrar el año escolar"],
  subdirector: ["Configurar el colegio y crear las cuentas", "Ver los indicadores del colegio"],
};

export function CambiarClaveObligatorio() {
  const { usuario, cerrarSesion, cargandoPerfil, sync } = useApp();
  const colegio = useColegio();
  const [paso, setPaso] = useState<"bienvenida" | "clave">("bienvenida");
  // Mientras llegan los datos del colegio todavía no se sabe su nombre ni su rol.
  if (!usuario && (cargandoPerfil || sync.sincronizando)) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="fondo-cielo" aria-hidden />
        <p className="vidrio !rounded-full flex items-center gap-2 px-5 py-3 text-sm font-semibold">
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> Preparando su cuenta...
        </p>
      </div>
    );
  }
  const esEstudiante = !!usuario?.roles.includes("estudiante") && usuario.roles.length === 1;
  const tareas = [...new Set((usuario?.roles ?? []).flatMap((r) => QUE_PUEDE[r] ?? []))].slice(0, 5);
  return (
    <div className="relative min-h-dvh overflow-hidden px-4 py-10">
      <div className="fondo-cielo" aria-hidden />
      <section className="vidrio-fuerte aparecer relative mx-auto max-w-md p-5 sm:p-7">
        {paso === "bienvenida" ? (
          <>
            <div className="flex items-center gap-3">
              {colegio?.insignia
                ? <img src={colegio.insignia} alt={`Insignia de ${colegio.nombre}`} className="h-16 w-16 object-contain" />
                : <Gema icono={GraduationCap} tono="tono-laguna" />}
              <p className="text-sm font-semibold text-tinta-suave">{colegio?.nombre ?? "Colegio Conectado"}</p>
            </div>
            <h1 className="titulo-display mt-5 text-3xl font-bold leading-tight">
              {esEstudiante ? "¡Bienvenido(a)" : "Bienvenido(a)"}{usuario ? `, ${usuario.nombres.split(" ")[0]}` : ""}{esEstudiante ? "!" : ""}
            </h1>
            <p className="mt-2 text-sm text-tinta-suave">
              {esEstudiante ? "Esta es tu cuenta en la app de tu colegio. Desde aquí podrás:" : "Esta es su cuenta en la app del colegio. Desde aquí podrá:"}
            </p>
            {tareas.length > 0 && (
              <ul className="mt-3 space-y-2">
                {tareas.map((t) => (
                  <li key={t} className="flex items-start gap-2 text-sm">
                    <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden /> <span>{t}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 rounded-2xl bg-sup/60 p-3 text-sm ring-1 ring-sup">
              <p className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" aria-hidden /> {esEstudiante ? "Primero, crea tu propia contraseña" : "Primero, cree su propia contraseña"}</p>
              <p className="mt-0.5 text-xs text-tinta-suave">
                {esEstudiante
                  ? "Ingresaste con una contraseña temporal que te dio el colegio. Cámbiala por una que solo tú conozcas para proteger tus datos."
                  : "Ingresó con una contraseña temporal que le dio el colegio. Cámbiela por una que solo usted conozca para proteger sus datos y los de los estudiantes."}
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Boton icono={ArrowRight} className="flex-1" onClick={() => setPaso("clave")}>{esEstudiante ? "Crear mi contraseña" : "Crear contraseña"}</Boton>
              <Boton variante="fantasma" icono={LogOut} onClick={() => cerrarSesion()}>Salir</Boton>
            </div>
          </>
        ) : (
          <>
            <Gema icono={ShieldCheck} tono="tono-laguna" />
            <p className="etiqueta mt-4">Primer ingreso</p>
            <h1 className="titulo-display mt-1 text-2xl font-bold">{esEstudiante ? "Crea tu propia contraseña" : "Cree su propia contraseña"}</h1>
            <p className="mb-5 mt-1 text-sm text-tinta-suave">
              {esEstudiante ? "Con ella ingresarás desde ahora, junto con tu DNI. No la compartas con nadie." : "Con ella ingresará desde ahora, junto con su DNI. No la comparta con nadie."}
            </p>
            <FormularioClave onListo={() => undefined}
              accionesExtra={<Boton type="button" variante="fantasma" onClick={() => setPaso("bienvenida")}>Volver</Boton>} />
          </>
        )}
      </section>
    </div>
  );
}

/** Desde el perfil: cambiar la contraseña cuando la persona quiera. */
export function DialogoCambiarClave({ onCerrar }: { onCerrar(): void }) {
  const [listo, setListo] = useState(false);
  return (
    <Dialogo abierto titulo={listo ? "Contraseña actualizada" : "Cambiar contraseña"} onCerrar={onCerrar}
      acciones={listo ? <Boton onClick={onCerrar}>Entendido</Boton> : undefined}>
      {listo
        ? <p>La próxima vez que ingrese use su contraseña nueva.</p>
        : <div className="pt-2 text-tinta"><FormularioClave onListo={() => setListo(true)} /></div>}
    </Dialogo>
  );
}
