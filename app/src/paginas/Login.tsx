import { useState, type FormEvent } from "react";
import { ArrowRight, CloudOff, Eye, GraduationCap, HandHeart, Info, KeyRound, LogOut, School, ShieldCheck, TriangleAlert, User, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CLAVE_MOTIVO_SALIDA, useApp } from "@/app/contexto";
import { NOMBRE_ROL, TONO_ROL } from "@/app/modulos";
import { MODO } from "@/config";
import { CLAVE_DEMO, USUARIOS_DEMO } from "@/data/demo";
import type { Rol } from "@/db/tipos";
import { hayConexion } from "@/sync/red";
import { Aviso, Boton, Gema, orden } from "@/ui/componentes";
import { Campo, Entrada } from "@/ui/formulario";
import { CampoClave } from "./CambiarClave";

const ICONO_ROL: Record<Rol, LucideIcon> = {
  ugel: Eye, director: School, subdirector: School, docente: Users, tutor: HandHeart,
  auxiliar: ShieldCheck, estudiante: GraduationCap, apoderado: User,
};

/** Motivo del último cierre de sesión (cuenta desactivada, sesión vencida); se muestra una sola vez. */
function leerMotivo(): string | null {
  try {
    const m = sessionStorage.getItem(CLAVE_MOTIVO_SALIDA);
    sessionStorage.removeItem(CLAVE_MOTIVO_SALIDA);
    return m;
  } catch {
    return null;
  }
}

/** Solo en el modo demostración: cuentas de prueba para presentar la app a cada rol. */
function CuentasPrueba({ onElegir, deshabilitado }: { onElegir(dni: string): void; deshabilitado: boolean }) {
  return (
    <div className="mt-6 border-t border-sup/70 pt-5">
      <p className="etiqueta">Modo demostración</p>
      <p className="mt-1 flex items-start gap-1.5 text-xs text-tinta-suave">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Datos de ejemplo guardados solo en este equipo. Todas las cuentas de prueba usan la contraseña <strong className="font-mono text-tinta">{CLAVE_DEMO}</strong>.</span>
      </p>
      <ul className="mt-3 space-y-1.5">
        {USUARIOS_DEMO.map((u, i) => (
          <li key={u.id} className="aparecer" style={orden(i + 2)}>
            <button type="button" onClick={() => onElegir(u.dni)} disabled={deshabilitado}
              className="group flex w-full items-center gap-3 rounded-2xl bg-sup/45 p-2 text-left ring-1 ring-sup/80 transition hover:bg-sup/75 active:scale-[0.98] disabled:opacity-60">
              <Gema icono={ICONO_ROL[u.roles[0]]} tono={TONO_ROL[u.roles[0]]} tam="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{NOMBRE_ROL[u.roles[0]]} <span className="font-normal text-tinta-suave">· DNI {u.dni}</span></span>
                <span className="block truncate text-xs text-tinta-suave">{u.nombres} {u.apellidos} · {u.descripcion}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-tinta-suave transition group-hover:translate-x-0.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Login() {
  const { iniciarSesion } = useApp();
  const [motivo] = useState(leerMotivo);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [identificador, setIdentificador] = useState("");
  const [clave, setClave] = useState("");

  const ingresar = async (id: string, c: string) => {
    setError(null);
    setCargando(true);
    try {
      await iniciarSesion(id, c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCargando(false);
    }
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    void ingresar(identificador, clave);
  };

  return (
    <div className="relative min-h-dvh overflow-hidden px-4 py-8 sm:py-14">
      <div className="fondo-cielo" aria-hidden />
      {/* Orbes de luz decorativos detrás del vidrio. */}
      <div aria-hidden className="pointer-events-none absolute -left-16 top-24 h-56 w-56 rounded-full bg-gradient-to-br from-sky-300/70 to-blue-500/60 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -right-10 top-[55%] h-64 w-64 rounded-full bg-gradient-to-br from-slate-200/80 to-blue-800/40 blur-2xl" />

      <div className="relative mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
        <section className="aparecer text-center lg:text-left">
          <div className="mb-5 inline-flex">
            <Gema icono={GraduationCap} tono="tono-laguna" tam="lg" />
          </div>
          <h1 className="titulo-display text-[2.6rem] font-extrabold leading-[0.95] text-tinta sm:text-6xl">
            Colegio<br />Conectado
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-base text-tinta-suave lg:mx-0">
            Notas por competencias, asistencia con QR y seguimiento de cada estudiante. Funciona aunque no haya señal.
          </p>
          <div className="mt-5 hidden flex-wrap gap-2 lg:flex">
            {["Sin internet", "Cada rol ve lo suyo", "Listo para SIAGIE"].map((t, i) => (
              <span key={t} style={orden(i + 2)} className="aparecer vidrio !rounded-full px-3.5 py-1.5 text-xs font-semibold">{t}</span>
            ))}
          </div>
        </section>

        <section className="vidrio-fuerte aparecer p-5 sm:p-7" style={orden(1)}>
          <form onSubmit={enviar} className="space-y-4">
            <div>
              <p className="etiqueta">Bienvenido</p>
              <h2 className="titulo-display mt-1 text-2xl font-bold">Ingrese a su cuenta</h2>
            </div>
            {motivo && !error && <Aviso tipo="alerta" icono={LogOut}>{motivo}</Aviso>}
            {!hayConexion() && <Aviso tipo="alerta" icono={CloudOff}>El primer ingreso necesita internet. Después la app funciona sin señal.</Aviso>}
            {error && <Aviso tipo="error" icono={TriangleAlert}>{error}</Aviso>}
            <Campo etiqueta="DNI o correo">
              <Entrada value={identificador} onChange={(e) => setIdentificador(e.target.value)} required autoComplete="username"
                autoCapitalize="none" spellCheck={false} placeholder="Ej.: 45678912" />
            </Campo>
            <CampoClave etiqueta="Contraseña" valor={clave} onCambio={setClave} autoComplete="current-password" />
            <Boton type="submit" icono={KeyRound} className="w-full" cargando={cargando} disabled={!identificador.trim() || !clave}>Ingresar</Boton>
            {cargando && <p className="text-center text-xs text-tinta-suave" role="status">Descargando datos del colegio...</p>}
            <p className="text-center text-xs text-tinta-suave">¿Olvidó su contraseña? La dirección del colegio puede darle una nueva.</p>
          </form>
          {MODO === "demo" && (
            <CuentasPrueba deshabilitado={cargando} onElegir={(dni) => {
              setIdentificador(dni);
              setClave(CLAVE_DEMO);
              void ingresar(dni, CLAVE_DEMO);
            }} />
          )}
        </section>
      </div>
    </div>
  );
}
