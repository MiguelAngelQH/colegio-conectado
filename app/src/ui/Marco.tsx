import { Suspense, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { GraduationCap, LayoutGrid, LoaderCircle, LogOut, X } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { modulosPara, NOMBRE_ROL, TONO_ROL, type Modulo } from "@/app/modulos";
import { Boton, Dialogo, Gema, cx, iniciales, orden } from "./componentes";
import { EstadoSync } from "./EstadoSync";

const FUERA_DEL_DOCK = new Set(["inicio", "perfil", "sincronizacion"]);

/** Estructura común: barra lateral flotante (PC) o barra superior + dock inferior (celular). */
export function Marco() {
  const { usuario, sync, cerrarSesion } = useApp();
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const ubicacion = useLocation();
  const colegio = useLiveQuery(() => (usuario?.colegio_id ? db.tabla("colegio").get(usuario.colegio_id) : undefined), [usuario?.colegio_id]);

  useEffect(() => setHojaAbierta(false), [ubicacion.pathname]);
  if (!usuario) return null;

  const modulos = modulosPara(usuario.roles);
  const inicio = modulos.find((m) => m.id === "inicio")!;
  const dock = [inicio, ...modulos.filter((m) => !FUERA_DEL_DOCK.has(m.id)).slice(0, 3)];
  const tonoRol = TONO_ROL[usuario.roles[0]];
  const pedirSalida = () => (sync.pendientes || sync.rechazados ? setConfirmarSalida(true) : void salir());
  async function salir() {
    setSaliendo(true);
    await cerrarSesion();
  }

  const avatar = (tam: string) => (
    <span className={cx("gema titulo-display font-bold", tonoRol, tam)}>
      <span className="relative z-10">{iniciales(usuario.nombres, usuario.apellidos)}</span>
    </span>
  );

  return (
    <div className="min-h-dvh">
      <div className="fondo-cielo" aria-hidden />

      {/* ---------- PC: barra lateral flotante ---------- */}
      <aside className="fixed inset-y-4 left-4 z-30 hidden w-72 flex-col lg:flex">
        <div className="vidrio flex h-full flex-col p-4">
          <Link to="/" className="flex items-center gap-3 px-1 pb-4">
            <Gema icono={GraduationCap} tono="tono-laguna" tam="sm" />
            <span className="titulo-display text-lg font-bold">Colegio Conectado</span>
          </Link>
          <Link to="/perfil" className="mb-4 flex items-center gap-3 rounded-2xl bg-white/40 p-3 ring-1 ring-white/70 transition hover:bg-white/60">
            {avatar("h-11 w-11 text-sm")}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{usuario.nombres} {usuario.apellidos}</span>
              <span className="block truncate text-xs text-tinta-suave">{usuario.roles.map((r) => NOMBRE_ROL[r]).join(" · ")}</span>
            </span>
          </Link>
          <nav aria-label="Menú principal" className="-mx-1 flex-1 space-y-1 overflow-y-auto px-1">
            {modulos.map((m) => <ItemLateral key={m.id} m={m} />)}
          </nav>
          <div className="mt-3 space-y-3 border-t border-white/60 pt-3">
            <p className="truncate px-1 text-xs text-tinta-suave">{colegio?.nombre}</p>
            <button onClick={pedirSalida} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50/60">
              <LogOut className="h-5 w-5" aria-hidden /> Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      {/* ---------- Barra superior ---------- */}
      <header className="sticky top-0 z-20 px-3 pt-3 lg:pl-[19.5rem] lg:pr-6">
        <div className="vidrio-fuerte mx-auto flex max-w-5xl items-center gap-3 !rounded-full p-1.5 lg:!bg-none lg:!border-transparent lg:!shadow-none lg:![backdrop-filter:none] lg:before:hidden">
          <Link to="/perfil" className="flex min-w-0 items-center gap-2.5 lg:hidden" aria-label="Mi perfil">
            {avatar("h-10 w-10 text-sm")}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight">{usuario.nombres}</span>
              <span className="block truncate text-[0.7rem] text-tinta-suave">{colegio?.nombre}</span>
            </span>
          </Link>
          <span className="ml-auto">
            <EstadoSync />
          </span>
        </div>
      </header>

      <main className="lg:pl-[19.5rem] lg:pr-2">
        {/* Los módulos se cargan bajo demanda: mientras tanto se mantiene el marco y se muestra un indicador. */}
        <Suspense fallback={<div className="flex justify-center p-12" role="status"><LoaderCircle className="h-7 w-7 animate-spin text-teal-600" aria-label="Cargando" /></div>}>
          <Outlet />
        </Suspense>
      </main>

      {/* ---------- Celular: dock inferior ---------- */}
      <nav aria-label="Navegación" className="fixed inset-x-0 bottom-0 z-30 px-3 pb-seguro lg:hidden">
        <div className="vidrio-fuerte mx-auto flex max-w-md items-center justify-between gap-1 !rounded-[1.75rem] p-1.5">
          {dock.map((m) => (
            <NavLink
              key={m.id}
              to={m.ruta}
              end={m.ruta === "/"}
              className={({ isActive }) =>
                cx(
                  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.35rem] px-1 text-[0.65rem] font-semibold transition active:scale-95",
                  isActive ? "vidrio-laguna" : "text-tinta-suave",
                )
              }
            >
              <m.icono className="h-[22px] w-[22px]" aria-hidden />
              <span className="max-w-full truncate">{m.titulo.split(" ")[0]}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setHojaAbierta(true)}
            className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.35rem] px-1 text-[0.65rem] font-semibold text-tinta-suave transition active:scale-95"
          >
            <LayoutGrid className="h-[22px] w-[22px]" aria-hidden />
            Más
          </button>
        </div>
      </nav>

      {/* ---------- Hoja "Más" ---------- */}
      {hojaAbierta && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Todos los módulos">
          <div className="absolute inset-0 bg-tinta/25" onClick={() => setHojaAbierta(false)} />
          <div className="vidrio-solido hoja absolute inset-x-2 bottom-2 max-h-[85dvh] overflow-y-auto !rounded-[2rem] p-5 pb-seguro">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-tinta/20" />
            <button onClick={() => setHojaAbierta(false)} className="absolute right-4 top-4 rounded-full p-2 hover:bg-white/50" aria-label="Cerrar">
              <X className="h-5 w-5" aria-hidden />
            </button>
            <div className="mb-5 flex items-center gap-3">
              {avatar("h-12 w-12 text-base")}
              <div className="min-w-0">
                <p className="truncate font-semibold">{usuario.nombres} {usuario.apellidos}</p>
                <p className="truncate text-xs text-tinta-suave">{usuario.roles.map((r) => NOMBRE_ROL[r]).join(" · ")}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {modulos.map((m, i) => (
                <Link key={m.id} to={m.ruta} style={orden(i)}
                  className="aparecer flex flex-col items-center gap-2 rounded-2xl p-2 text-center transition hover:bg-white/50 active:scale-95">
                  <Gema icono={m.icono} tono={m.tono} />
                  <span className="text-[0.7rem] font-semibold leading-tight">{m.titulo}</span>
                </Link>
              ))}
            </div>
            <button onClick={pedirSalida} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-red-50/70 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200/70">
              <LogOut className="h-[18px] w-[18px]" aria-hidden /> Cerrar sesión
            </button>
          </div>
        </div>
      )}

      <Dialogo
        abierto={confirmarSalida}
        titulo="Hay cambios sin enviar"
        onCerrar={() => setConfirmarSalida(false)}
        acciones={
          <>
            <Boton variante="fantasma" onClick={() => setConfirmarSalida(false)}>Cancelar</Boton>
            <Boton variante="peligro" cargando={saliendo} onClick={salir}>Salir y perderlos</Boton>
          </>
        }
      >
        Este equipo tiene {sync.pendientes + sync.rechazados} cambios que todavía no llegaron al servidor. Al cerrar sesión
        se borran los datos de este equipo. Conéctese y espere a ver "Sincronizado" antes de salir.
      </Dialogo>
    </div>
  );
}

function ItemLateral({ m }: { m: Modulo }) {
  return (
    <NavLink
      to={m.ruta}
      end={m.ruta === "/"}
      className={({ isActive }) =>
        cx(
          "group flex items-center gap-3 rounded-2xl px-2 py-1.5 text-sm font-semibold transition",
          isActive ? "bg-white/70 shadow-[inset_0_1px_0_white,0_6px_16px_-10px_rgba(11,46,51,.5)] ring-1 ring-white" : "text-tinta-suave hover:bg-white/40 hover:text-tinta",
        )
      }
    >
      <Gema icono={m.icono} tono={m.tono} tam="sm" />
      <span className="truncate">{m.titulo}</span>
    </NavLink>
  );
}
