import { Suspense, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown, GraduationCap, LayoutGrid, LoaderCircle, LogOut, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { modulosPara, NOMBRE_ROL, TONO_ROL } from "@/app/modulos";
import { itemActivo, menuPara, type GrupoMenu, type ItemMenu } from "@/app/menu";
import { Boton, Dialogo, Gema, cx, iniciales } from "./componentes";
import { EstadoSync } from "./EstadoSync";
import { Campana } from "./Campana";

const FUERA_DEL_DOCK = new Set(["inicio", "perfil", "sincronizacion", "avisos"]);

/** Estructura común: barra lateral flotante (PC) o barra superior + dock inferior (celular). */
export function Marco() {
  const { usuario, sync, cerrarSesion } = useApp();
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const ubicacion = useLocation();
  const colegio = useLiveQuery(() => (usuario?.colegio_id ? db.tabla("colegio").get(usuario.colegio_id) : undefined), [usuario?.colegio_id]);

  const [contraido, setContraido] = useState(() => localStorage.getItem("menu-contraido") === "1");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const menu = useMemo(() => menuPara(usuario?.roles ?? []), [usuario?.roles]);
  const activo = itemActivo(menu.grupos, ubicacion.pathname);
  const grupoActivo = menu.grupos.find((g) => activo && g.items.includes(activo))?.id;

  useEffect(() => setHojaAbierta(false), [ubicacion.pathname]);
  // El grupo de la página actual se despliega solo.
  useEffect(() => {
    if (grupoActivo) setAbiertos((a) => (a.has(grupoActivo) ? a : new Set(a).add(grupoActivo)));
  }, [grupoActivo]);
  if (!usuario) return null;

  const alternarMenu = () => setContraido((c) => {
    localStorage.setItem("menu-contraido", c ? "0" : "1");
    return !c;
  });
  const margen = contraido ? "lg:pl-[7rem]" : "lg:pl-[19.5rem]";

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

      {/* ---------- PC: barra lateral flotante y contraíble ---------- */}
      <aside className={cx("fixed inset-y-4 left-4 z-30 hidden flex-col transition-[width] duration-300 lg:flex", contraido ? "w-[5.25rem]" : "w-72")}>
        <div className={cx("vidrio flex h-full flex-col", contraido ? "items-center px-2 py-4" : "p-4")}>
          <div className={cx("flex items-center pb-4", contraido ? "flex-col gap-3" : "gap-3 px-1")}>
            <Link to="/" className="flex min-w-0 flex-1 items-center gap-3" aria-label="Colegio Conectado">
              <Gema icono={GraduationCap} tono="tono-laguna" tam="sm" />
              {!contraido && <span className="titulo-display truncate text-lg font-bold">Colegio Conectado</span>}
            </Link>
            <button onClick={alternarMenu} className="rounded-xl p-2 text-tinta-suave transition hover:bg-white/60 hover:text-tinta"
              aria-label={contraido ? "Expandir el menú" : "Contraer el menú"} title={contraido ? "Expandir el menú" : "Contraer el menú"}>
              {contraido ? <PanelLeftOpen className="h-5 w-5" aria-hidden /> : <PanelLeftClose className="h-5 w-5" aria-hidden />}
            </button>
          </div>
          <Link to="/perfil" title={contraido ? `${usuario.nombres} ${usuario.apellidos}` : undefined}
            className={cx("mb-4 flex items-center gap-3 rounded-2xl transition hover:bg-white/60", contraido ? "p-1" : "bg-white/40 p-3 ring-1 ring-white/70")}>
            {avatar("h-11 w-11 text-sm")}
            {!contraido && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{usuario.nombres} {usuario.apellidos}</span>
                <span className="block truncate text-xs text-tinta-suave">{usuario.roles.map((r) => NOMBRE_ROL[r]).join(" · ")}</span>
              </span>
            )}
          </Link>
          <nav aria-label="Menú principal" className={cx("flex-1 space-y-1 overflow-y-auto", contraido ? "w-full" : "-mx-1 px-1")}>
            <NavLink to="/" end title={contraido ? "Inicio" : undefined}
              className={({ isActive }) => cx(claseItem(isActive), contraido && "justify-center px-0")}>
              <Gema icono={menu.inicio.icono} tono={menu.inicio.tono} tam="sm" />
              {!contraido && <span className="truncate">Inicio</span>}
            </NavLink>
            {menu.grupos.map((g) => (
              <GrupoLateral key={g.id} g={g} contraido={contraido} abierto={abiertos.has(g.id)} activo={activo}
                onAlternar={() => {
                  if (contraido) { alternarMenu(); setAbiertos((a) => new Set(a).add(g.id)); }
                  else setAbiertos((a) => { const n = new Set(a); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; });
                }} />
            ))}
          </nav>
          <div className={cx("mt-3 w-full space-y-3 border-t border-white/60 pt-3", contraido && "flex flex-col items-center")}>
            {!contraido && (
              <p className="flex items-center gap-2 px-1 text-xs text-tinta-suave">
                {colegio?.insignia && <img src={colegio.insignia} alt="" className="h-8 w-8 shrink-0 object-contain" />}
                <span className="truncate">{colegio?.nombre}</span>
              </p>
            )}
            <button onClick={pedirSalida} title={contraido ? "Cerrar sesión" : undefined}
              className={cx("flex items-center gap-3 rounded-2xl py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50/60", contraido ? "justify-center px-3" : "w-full px-3")}>
              <LogOut className="h-5 w-5" aria-hidden /> {contraido ? <span className="sr-only">Cerrar sesión</span> : "Cerrar sesión"}
            </button>
          </div>
        </div>
      </aside>

      {/* ---------- Barra superior ---------- */}
      <header className={cx("sticky top-0 z-20 px-3 pt-3 lg:pr-6", margen)}>
        <div className="vidrio-fuerte mx-auto flex max-w-5xl items-center gap-3 !rounded-full p-1.5 lg:!bg-none lg:!border-transparent lg:!shadow-none lg:![backdrop-filter:none] lg:before:hidden">
          <Link to="/perfil" className="flex min-w-0 items-center gap-2.5 lg:hidden" aria-label="Mi perfil">
            {avatar("h-10 w-10 text-sm")}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight">{usuario.nombres}</span>
              <span className="block truncate text-[0.7rem] text-tinta-suave">{colegio?.nombre}</span>
            </span>
          </Link>
          <span className="ml-auto flex items-center gap-2">
            {colegio?.insignia && <img src={colegio.insignia} alt={`Insignia de ${colegio.nombre}`} className="h-9 w-9 object-contain lg:hidden" />}
            <EstadoSync />
            <Campana />
          </span>
        </div>
      </header>

      <main className={cx("lg:pr-2", margen)}>
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
            <div className="space-y-1">
              {menu.grupos.map((g) => (
                <GrupoLateral key={g.id} g={g} contraido={false} abierto={abiertos.has(g.id)} activo={activo}
                  onAlternar={() => setAbiertos((a) => { const n = new Set(a); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })} />
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

const claseItem = (activo: boolean) =>
  cx(
    "group flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-sm font-semibold transition",
    activo ? "bg-white/75 text-tinta shadow-[inset_0_1px_0_white,0_6px_16px_-10px_rgba(15,23,42,.45)] ring-1 ring-white" : "text-tinta-suave hover:bg-white/40 hover:text-tinta",
  );

/** Grupo del menú: al tocarlo se desliza y muestra sus opciones; contraído solo muestra su ícono. */
function GrupoLateral({ g, contraido, abierto, activo, onAlternar }: {
  g: GrupoMenu; contraido: boolean; abierto: boolean; activo?: ItemMenu; onAlternar: () => void;
}) {
  const contieneActivo = !!activo && g.items.includes(activo);
  const idLista = `menu-${g.id}`;
  return (
    <div>
      <button onClick={onAlternar} aria-expanded={contraido ? undefined : abierto} aria-controls={contraido ? undefined : idLista}
        title={contraido ? g.titulo : undefined}
        className={cx(claseItem(contraido && contieneActivo), contraido && "justify-center px-0", !contraido && contieneActivo && "text-tinta")}>
        <Gema icono={g.icono} tono={g.tono} tam="sm" />
        {contraido ? <span className="sr-only">{g.titulo}</span> : (
          <>
            <span className="flex-1 truncate text-left">{g.titulo}</span>
            <ChevronDown className={cx("h-4 w-4 shrink-0 transition-transform duration-300", abierto && "rotate-180")} aria-hidden />
          </>
        )}
      </button>
      {!contraido && (
        <div id={idLista} className={cx("grid transition-[grid-template-rows,opacity] duration-300 ease-out", abierto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
          <ul className={cx("ml-[1.35rem] overflow-hidden border-l border-tinta/10 pl-2 transition-[visibility] duration-300", !abierto && "invisible")}>
            {g.items.map((i) => (
              <li key={i.id} className="pt-0.5 first:pt-1">
                <Link to={i.ruta} aria-current={activo === i ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[0.82rem] font-medium transition",
                    activo === i ? "bg-white/75 font-semibold text-blue-800 ring-1 ring-white" : "text-tinta-suave hover:bg-white/45 hover:text-tinta",
                  )}>
                  <i.icono className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{i.titulo}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
