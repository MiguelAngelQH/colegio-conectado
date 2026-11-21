import { useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff, KeyRound, LogOut, ShieldCheck, TriangleAlert } from "lucide-react";
import { useApp } from "@/app/contexto";
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
export function CambiarClaveObligatorio() {
  const { usuario, cerrarSesion } = useApp();
  return (
    <div className="relative min-h-dvh overflow-hidden px-4 py-10">
      <div className="fondo-cielo" aria-hidden />
      <section className="vidrio-fuerte aparecer relative mx-auto max-w-md p-5 sm:p-7">
        <Gema icono={ShieldCheck} tono="tono-laguna" />
        <p className="etiqueta mt-4">Primer ingreso</p>
        <h1 className="titulo-display mt-1 text-2xl font-bold">{usuario ? `Hola, ${usuario.nombres}` : "Elija su contraseña"}</h1>
        <p className="mb-5 mt-1 text-sm text-tinta-suave">
          Ingresó con una contraseña temporal. Elija una contraseña propia para proteger sus datos y los de los estudiantes.
        </p>
        <FormularioClave onListo={() => undefined}
          accionesExtra={<Boton type="button" variante="fantasma" icono={LogOut} onClick={() => cerrarSesion()}>Salir</Boton>} />
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
