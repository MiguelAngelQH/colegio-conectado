import { useState, type FormEvent } from "react";
import { ArrowRight, CloudOff, Eye, GraduationCap, HandHeart, Info, KeyRound, School, ShieldCheck, TriangleAlert, User, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useApp } from "@/app/contexto";
import { NOMBRE_ROL, TONO_ROL } from "@/app/modulos";
import { MODO } from "@/config";
import { USUARIOS_DEMO } from "@/data/demo";
import type { Rol } from "@/db/tipos";
import { hayConexion } from "@/sync/red";
import { Aviso, Boton, Gema, orden } from "@/ui/componentes";

const ICONO_ROL: Record<Rol, LucideIcon> = {
  ugel: Eye, director: School, subdirector: School, docente: Users, tutor: HandHeart,
  auxiliar: ShieldCheck, estudiante: GraduationCap, apoderado: User,
};

export function Login() {
  const { iniciarDemo, iniciarConCorreo } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");

  const intentar = async (llave: string, fn: () => Promise<void>) => {
    setError(null);
    setCargando(llave);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(null);
    }
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    void intentar("correo", () => iniciarConCorreo(correo.trim(), clave));
  };

  return (
    <div className="relative min-h-dvh overflow-hidden px-4 py-8 sm:py-14">
      <div className="fondo-cielo" aria-hidden />
      {/* Orbes de luz decorativos detrás del vidrio. */}
      <div aria-hidden className="pointer-events-none absolute -left-16 top-24 h-56 w-56 rounded-full bg-gradient-to-br from-cyan-300/70 to-teal-500/60 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -right-10 top-[55%] h-64 w-64 rounded-full bg-gradient-to-br from-amber-200/80 to-orange-400/50 blur-2xl" />

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
          {!hayConexion() && (
            <div className="mb-4"><Aviso tipo="alerta" icono={CloudOff}>El primer ingreso necesita internet. Después la app funciona sin señal.</Aviso></div>
          )}
          {error && <div className="mb-4"><Aviso tipo="error" icono={TriangleAlert}>{error}</Aviso></div>}

          {MODO === "demo" ? (
            <>
              <p className="etiqueta">Modo demostración</p>
              <h2 className="titulo-display mt-1 text-2xl font-bold">¿Con qué rol quiere entrar?</h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-tinta-suave">
                <Info className="h-3.5 w-3.5" aria-hidden /> Datos de ejemplo, guardados solo en este equipo.
              </p>
              <ul className="mt-5 space-y-2">
                {USUARIOS_DEMO.map((u, i) => (
                  <li key={u.id} className="aparecer" style={orden(i + 2)}>
                    <button
                      onClick={() => intentar(u.id, () => iniciarDemo(u.id))}
                      disabled={cargando !== null}
                      className="group flex w-full items-center gap-3 rounded-2xl bg-white/45 p-2.5 text-left ring-1 ring-white/80 transition hover:bg-white/75 active:scale-[0.98] disabled:opacity-60"
                    >
                      <Gema icono={ICONO_ROL[u.roles[0]]} tono={TONO_ROL[u.roles[0]]} tam="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{NOMBRE_ROL[u.roles[0]]}</span>
                        <span className="block truncate text-xs text-tinta-suave">{u.nombres} {u.apellidos} · {u.descripcion}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 text-tinta-suave transition group-hover:translate-x-0.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              {cargando && <p className="mt-4 text-center text-xs text-tinta-suave" role="status">Descargando datos del colegio...</p>}
            </>
          ) : (
            <form onSubmit={enviar} className="space-y-4">
              <div>
                <p className="etiqueta">Bienvenido</p>
                <h2 className="titulo-display mt-1 text-2xl font-bold">Ingrese a su cuenta</h2>
              </div>
              <label className="block text-sm font-semibold">
                Correo
                <input type="email" required autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} className="campo mt-1.5" />
              </label>
              <label className="block text-sm font-semibold">
                Contraseña
                <input type="password" required autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} className="campo mt-1.5" />
              </label>
              <Boton type="submit" icono={KeyRound} className="w-full" cargando={cargando === "correo"}>Ingresar</Boton>
              <p className="text-center text-xs text-tinta-suave">¿Olvidó su contraseña? Solicítela en la dirección del colegio.</p>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
