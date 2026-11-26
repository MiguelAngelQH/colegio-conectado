import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ChevronDown, ChevronsLeft, Search, House, LayoutGrid, LoaderCircle, LogOut, Monitor, Moon, RefreshCw, Sun, User, X,
} from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { modulosPara, NOMBRE_ROL, TONO_ROL } from "@/app/modulos";
import { contiene, itemActivo, menuPara, type GrupoMenu, type ItemMenu } from "@/app/menu";
import { Boton, Dialogo, Gema, cx, iniciales } from "./componentes";
import { EstadoSync } from "./EstadoSync";
import { Campana } from "./Campana";
import { avancePeriodo, periodoVigente } from "@/dominio/periodos";
import { vivas } from "@/db/repositorio";
import { alternarTema, fijarTema, usePreferenciaTema, useTemaOscuro, type PreferenciaTema } from "./tema";
import { SugerenciaTema } from "./SugerenciaTema";
import { Buscador } from "./Buscador";

const FUERA_DEL_DOCK = new Set(["inicio", "perfil", "sincronizacion", "avisos"]);

/**
 * Estructura común.
 * PC: una barra de íconos azul marino (grupos) y, a su lado, un panel de vidrio con las opciones del grupo;
 * el panel se contrae y deja solo la barra. Celular: barra superior + dock inferior + hoja "Más".
 */
export function Marco() {
  const { usuario, sync, cerrarSesion } = useApp();
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [cuentaAbierta, setCuentaAbierta] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const ubicacion = useLocation();
  const colegio = useLiveQuery(() => (usuario?.colegio_id ? db.tabla("colegio").get(usuario.colegio_id) : undefined), [usuario?.colegio_id]);

  const [contraido, setContraido] = useState(() => localStorage.getItem("menu-contraido") === "1");
  const grupos = useMemo(() => menuPara(usuario?.roles ?? []), [usuario?.roles]);
  const activo = itemActivo(grupos, ubicacion.pathname);
  const [visto, setVisto] = useState<string | null>(null);
  const grupoVisto = grupos.find((g) => g.id === visto) ?? activo?.grupo ?? grupos[0];

  useEffect(() => {
    setHojaAbierta(false);
    setCuentaAbierta(false);
  }, [ubicacion.pathname]);
  // Al navegar, el panel muestra el grupo de la página actual.
  useEffect(() => setVisto(null), [activo?.grupo.id]);
  // Ctrl + K (o Cmd + K) abre el buscador desde cualquier pantalla.
  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuscando((b) => !b);
      }
    };
    window.addEventListener("keydown", atajo);
    return () => window.removeEventListener("keydown", atajo);
  }, []);
  if (!usuario) return null;

  const fijarContraido = (c: boolean) => {
    localStorage.setItem("menu-contraido", c ? "1" : "0");
    setContraido(c);
  };
  /** Tocar un grupo lo muestra en el panel; tocar el que ya se ve, con el panel abierto, lo contrae. */
  const tocarGrupo = (g: GrupoMenu) => {
    if (!contraido && grupoVisto?.id === g.id) fijarContraido(true);
    else {
      setVisto(g.id);
      fijarContraido(false);
    }
  };
  const margen = contraido ? "lg:pl-[7rem]" : "lg:pl-[22.75rem]";

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
  const enInicio = ubicacion.pathname === "/";

  return (
    <div className="min-h-dvh">
      <div className="fondo-cielo" aria-hidden />

      {/* ---------- PC: barra de grupos + panel de opciones ---------- */}
      <aside className="fixed inset-y-4 left-4 z-30 hidden gap-3 lg:flex" aria-label="Menú principal">
        <nav className="riel z-10 flex w-[4.75rem] flex-col items-center py-4" aria-label="Secciones">
          <Link to="/" className="mb-5 grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-white/95 shadow-[0_6px_18px_-6px_rgba(0,0,0,.6)]"
            title={colegio?.nombre ?? "Colegio Conectado"}>
            {colegio?.insignia
              ? <img src={colegio.insignia} alt={`Insignia de ${colegio.nombre}`} className="h-10 w-10 object-contain" />
              : <span className="titulo-display text-sm font-extrabold text-[#1e3a8a]">CC</span>}
          </Link>

          <div className="flex w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto">
            <BotonRiel icono={House} texto="Inicio" activo={enInicio} to="/" />
            {grupos.map((g) => (
              <BotonRiel key={g.id} icono={g.icono} texto={g.corto} titulo={g.titulo}
                activo={!enInicio && activo?.grupo.id === g.id} abierto={!contraido && grupoVisto?.id === g.id}
                onClick={() => tocarGrupo(g)} />
            ))}
          </div>

          <MenuCuenta abierto={cuentaAbierta} onAlternar={() => setCuentaAbierta((a) => !a)} onCerrar={() => setCuentaAbierta(false)}
            avatar={avatar("h-11 w-11 text-sm")} nombre={`${usuario.nombres} ${usuario.apellidos}`}
            roles={usuario.roles.map((r) => NOMBRE_ROL[r]).join(" · ")} onSalir={pedirSalida} />
        </nav>

        {grupoVisto && (
          <section aria-label={grupoVisto.titulo}
            className={cx("vidrio flex w-[16.5rem] flex-col p-3 transition-[opacity,transform] duration-300 ease-out",
              contraido ? "pointer-events-none invisible -translate-x-6 opacity-0 [transition-property:opacity,transform,visibility]" : "translate-x-0 opacity-100")}>
            <header className="flex items-start gap-2 px-2 pb-3 pt-1">
              <div className="min-w-0 flex-1">
                <p className="etiqueta">Menú</p>
                <h2 key={grupoVisto.id} className="titulo-display aparecer truncate text-2xl font-bold leading-tight">{grupoVisto.titulo}</h2>
                <p className="mt-0.5 text-xs leading-snug text-tinta-suave">{grupoVisto.descripcion}</p>
              </div>
              <button onClick={() => fijarContraido(true)} className="rounded-xl p-1.5 text-tinta-suave transition hover:bg-sup/60 hover:text-tinta"
                aria-label="Contraer el menú" title="Contraer el menú">
                <ChevronsLeft className="h-5 w-5" aria-hidden />
              </button>
            </header>
            <ul key={grupoVisto.id} className="-mx-1 flex-1 space-y-1 overflow-y-auto px-1">
              {grupoVisto.items.map((i, n) => <OpcionPanel key={i.id} item={i} activo={activo?.item} indice={n} />)}
            </ul>
            <TarjetaHoy colegio={colegio?.nombre} />
          </section>
        )}
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
            <button type="button" onClick={() => setBuscando(true)} title="Buscar (Ctrl + K)" aria-label="Buscar"
              className="vidrio !rounded-full hidden h-10 items-center gap-2 px-3 text-sm text-tinta-suave transition hover:text-tinta active:scale-95 lg:inline-flex">
              <Search className="h-[18px] w-[18px]" aria-hidden />
              <span className="hidden pr-1 xl:inline">Buscar</span>
              <kbd className="hidden rounded-md border border-tinta/15 px-1.5 text-[0.65rem] font-semibold xl:inline">Ctrl K</kbd>
            </button>
            <EstadoSync />
            <BotonTema />
            <Campana />
          </span>
        </div>
      </header>

      <main className={cx("transition-[padding] duration-300 lg:pr-2", margen)}>
        {/* Los módulos se cargan bajo demanda: mientras tanto se mantiene el marco y se muestra un indicador. */}
        <Suspense fallback={<div className="flex justify-center p-12" role="status"><LoaderCircle className="h-7 w-7 animate-spin text-blue-600" aria-label="Cargando" /></div>}>
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
          <div className="absolute inset-0 bg-noche/40" onClick={() => setHojaAbierta(false)} />
          <div className="vidrio-solido hoja absolute inset-x-2 bottom-2 max-h-[85dvh] overflow-y-auto !rounded-[2rem] p-5 pb-seguro">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-tinta/20" />
            <button onClick={() => setHojaAbierta(false)} className="absolute right-4 top-4 rounded-full p-2 hover:bg-sup/50" aria-label="Cerrar">
              <X className="h-5 w-5" aria-hidden />
            </button>
            <div className="mb-4 flex items-center gap-3">
              {avatar("h-12 w-12 text-base")}
              <div className="min-w-0">
                <p className="truncate font-semibold">{usuario.nombres} {usuario.apellidos}</p>
                <p className="truncate text-xs text-tinta-suave">{usuario.roles.map((r) => NOMBRE_ROL[r]).join(" · ")}</p>
              </div>
            </div>
            <button type="button" onClick={() => { setHojaAbierta(false); setBuscando(true); }}
              className="mb-5 flex w-full items-center gap-3 rounded-2xl bg-tinta/[.05] px-4 py-3 text-left text-sm text-tinta-suave ring-1 ring-tinta/10">
              <Search className="h-[18px] w-[18px] text-blue-600" aria-hidden /> Buscar páginas o estudiantes...
            </button>
            <div className="space-y-5">
              {grupos.map((g) => (
                <section key={g.id}>
                  <p className="etiqueta mb-1.5 px-1">{g.titulo}</p>
                  <ul className="space-y-1">
                    {g.items.map((i, n) => <OpcionPanel key={i.id} item={i} activo={activo?.item} indice={n} />)}
                  </ul>
                </section>
              ))}
              <section>
                <p className="etiqueta mb-1.5 px-1">Mi cuenta</p>
                <OpcionesCuenta onSalir={pedirSalida} />
              </section>
            </div>
          </div>
        </div>
      )}

      <SugerenciaTema />
      <Buscador abierto={buscando} onCerrar={() => setBuscando(false)} />

      <Dialogo tam="chico"
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

/** Botón de la barra azul: ícono con su nombre debajo y una marca de luz a la izquierda cuando está activo. */
function BotonRiel({ icono: Icono, texto, titulo, activo, abierto, to, onClick }: {
  icono: GrupoMenu["icono"]; texto: string; titulo?: string; activo: boolean; abierto?: boolean; to?: string; onClick?: () => void;
}) {
  const clase = cx(
    "group relative flex w-[4.3rem] flex-col items-center gap-1 rounded-2xl py-2 text-[0.58rem] font-semibold tracking-tight transition",
    activo ? "bg-white/[.14] text-white" : abierto ? "bg-white/[.07] text-white" : "text-white/60 hover:bg-white/[.07] hover:text-white",
  );
  const contenido = (
    <>
      <span aria-hidden className={cx("absolute -left-[0.55rem] top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-[#7cc4ff] shadow-[0_0_12px_#7cc4ff] transition-all duration-300",
        activo ? "h-7 opacity-100" : "h-0 opacity-0")} />
      <Icono className={cx("h-[22px] w-[22px] transition-transform duration-300", !activo && "group-hover:scale-110")} strokeWidth={activo ? 2.3 : 1.9} aria-hidden />
      <span className="max-w-full truncate">{texto}</span>
    </>
  );
  return to
    ? <Link to={to} className={clase} aria-current={activo ? "page" : undefined}>{contenido}</Link>
    : <button type="button" onClick={onClick} className={clase} aria-expanded={abierto} title={titulo}>{contenido}</button>;
}

/** Opción del panel: gema, título y descripción; si tiene subopciones, una flecha las despliega. */
function OpcionPanel({ item, activo, indice }: { item: ItemMenu; activo?: ItemMenu; indice: number }) {
  const dentro = contiene(item, activo);
  const [abierta, setAbierta] = useState(dentro);
  useEffect(() => {
    if (dentro) setAbierta(true);
  }, [dentro]);
  const esActiva = item === activo;
  const fila = cx(
    "flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2 text-left transition",
    esActiva ? "bg-sup/80 shadow-[0_8px_20px_-14px_rgba(15,30,54,.6)] ring-1 ring-sup" : dentro ? "bg-sup/40" : "hover:bg-sup/45",
  );
  const cuerpo = (
    <>
      <Gema icono={item.icono} tono={item.tono ?? "tono-pizarra"} tam="sm" />
      <span className="min-w-0 flex-1">
        <span className={cx("block truncate text-sm font-semibold", dentro ? "text-tinta" : "text-tinta/85")}>{item.titulo}</span>
        {item.descripcion && <span className="block truncate text-[0.7rem] text-tinta-suave">{item.descripcion}</span>}
      </span>
    </>
  );

  return (
    <li className="aparecer" style={{ ["--i" as string]: indice }}>
      {item.hijos ? (
        <button type="button" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta} className={cx(fila, "w-full")}>
          {cuerpo}
          <ChevronDown className={cx("h-4 w-4 shrink-0 text-tinta-suave transition-transform duration-300", abierta && "rotate-180")} aria-hidden />
        </button>
      ) : (
        <Link to={item.ruta} aria-current={esActiva ? "page" : undefined} className={fila}>{cuerpo}</Link>
      )}
      {item.hijos && (
        <div className={cx("grid transition-[grid-template-rows,opacity] duration-300 ease-out", abierta ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
          <ul className={cx("ml-[1.6rem] overflow-hidden border-l-2 border-blue-500/25 pl-3 transition-[visibility] duration-300", !abierta && "invisible")}>
            {item.hijos.map((h) => (
              <li key={h.id} className="pt-1 first:pt-1.5">
                <Link to={h.ruta} aria-current={h === activo ? "page" : undefined}
                  className={cx("relative flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[0.8rem] font-medium transition",
                    h === activo ? "bg-blue-600 text-white shadow-[0_6px_14px_-8px_rgba(37,99,235,.9)]" : "text-tinta-suave hover:bg-sup/50 hover:text-tinta")}>
                  <h.icono className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{h.titulo}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/** Perfil, sincronización, tema y cerrar sesión (menú de la cuenta y hoja del celular). */
function OpcionesCuenta({ onSalir }: { onSalir: () => void }) {
  const tema = usePreferenciaTema();
  const temas: { valor: PreferenciaTema; texto: string; icono: typeof Sun }[] = [
    { valor: "claro", texto: "Claro", icono: Sun },
    { valor: "oscuro", texto: "Oscuro", icono: Moon },
    { valor: "auto", texto: "Auto", icono: Monitor },
  ];
  const opcion = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:bg-sup/55";
  return (
    <div className="space-y-1">
      <Link to="/perfil" className={opcion}><User className="h-[18px] w-[18px] text-tinta-suave" aria-hidden /> Mi perfil</Link>
      <Link to="/sincronizacion" className={opcion}><RefreshCw className="h-[18px] w-[18px] text-tinta-suave" aria-hidden /> Sincronización</Link>
      <div role="radiogroup" aria-label="Tema" className="mx-1 my-1.5 grid grid-cols-3 gap-1 rounded-xl bg-tinta/[.06] p-1">
        {temas.map((t) => (
          <button key={t.valor} type="button" role="radio" aria-checked={tema === t.valor} onClick={() => fijarTema(t.valor)}
            className={cx("flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[0.68rem] font-semibold transition",
              tema === t.valor ? "bg-sup text-tinta shadow-sm" : "text-tinta-suave hover:text-tinta")}>
            <t.icono className="h-4 w-4" aria-hidden /> {t.texto}
          </button>
        ))}
      </div>
      <button type="button" onClick={onSalir} className={cx(opcion, "w-full text-red-700 hover:bg-red-50")}>
        <LogOut className="h-[18px] w-[18px]" aria-hidden /> Cerrar sesión
      </button>
    </div>
  );
}

/** Avatar al pie de la barra: abre la tarjeta de la cuenta (con cerrar sesión). */
function MenuCuenta({ abierto, onAlternar, onCerrar, avatar, nombre, roles, onSalir }: {
  abierto: boolean; onAlternar: () => void; onCerrar: () => void; avatar: React.ReactNode; nombre: string; roles: string; onSalir: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onCerrar();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto, onCerrar]);

  return (
    <div ref={ref} className="relative mt-3">
      <button type="button" onClick={onAlternar} aria-expanded={abierto} aria-haspopup="menu" title="Mi cuenta"
        className={cx("rounded-[1.1rem] p-0.5 ring-2 transition", abierto ? "ring-[#7cc4ff]" : "ring-white/20 hover:ring-white/50")}>
        {avatar}
      </button>
      {abierto && (
        <div className="vidrio-solido aparecer absolute bottom-0 left-[calc(100%+1.1rem)] z-40 w-64 p-2 ![background:#f8fafd] dark:![background:#182339]">
          <div className="flex items-center gap-3 border-b border-tinta/10 px-2 pb-3 pt-1.5">
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{nombre}</span>
              <span className="block truncate text-xs text-tinta-suave">{roles}</span>
            </span>
          </div>
          <div className="pt-1.5"><OpcionesCuenta onSalir={onSalir} /></div>
        </div>
      )}
    </div>
  );
}

/** Pie del panel: la fecha, el periodo en curso con su avance y el nombre del colegio. */
function TarjetaHoy({ colegio }: { colegio?: string }) {
  const periodo = useLiveQuery(async () => {
    const anio = (await db.tabla("anio_escolar").toArray()).find((a) => a.activo && !a.eliminado);
    return anio ? periodoVigente(vivas(await db.tabla("periodo").where("anio_id").equals(anio.id).toArray())) : undefined;
  });
  const ahora = new Date();
  const avance = periodo ? avancePeriodo(periodo) : 0;
  return (
    <div className="relative mt-3 overflow-hidden rounded-2xl bg-gradient-to-br from-[#1d3a78] to-[#0d1d3d] p-3.5 text-white shadow-[0_12px_28px_-16px_rgba(13,29,61,.9)]">
      <div aria-hidden className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-[#7cc4ff]/25 blur-2xl" />
      <div className="relative flex items-end gap-3">
        <span className="titulo-display text-4xl font-bold leading-none">{ahora.getDate()}</span>
        <span className="pb-0.5 text-xs leading-tight text-white/75">
          <span className="block font-semibold capitalize text-white">{ahora.toLocaleDateString("es-PE", { weekday: "long" })}</span>
          <span><span className="capitalize">{ahora.toLocaleDateString("es-PE", { month: "long" })}</span> {ahora.getFullYear()}</span>
        </span>
      </div>
      {periodo && (
        <div className="relative mt-3">
          <div className="flex items-center justify-between text-[0.7rem] font-semibold text-white/80">
            <span>{periodo.nombre}</span>
            <span>{Math.round(avance)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-[#7cc4ff] shadow-[0_0_10px_#7cc4ff]" style={{ width: `${avance}%` }} />
          </div>
        </div>
      )}
      {colegio && <p className="relative mt-2.5 truncate text-[0.68rem] text-white/60">{colegio}</p>}
    </div>
  );
}

/** Botón a la vista junto a la sincronización: alterna entre modo claro y nocturno. */
function BotonTema() {
  const oscuro = useTemaOscuro();
  const texto = oscuro ? "Cambiar a modo claro" : "Cambiar a modo nocturno";
  return (
    <button type="button" onClick={alternarTema} aria-label={texto} title={texto}
      className="vidrio !rounded-full relative inline-flex h-10 w-10 items-center justify-center transition active:scale-95">
      <span className="relative h-[18px] w-[18px]">
        <Sun className={cx("absolute inset-0 h-[18px] w-[18px] text-amber-500 transition-all duration-500", oscuro ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100")} aria-hidden />
        <Moon className={cx("absolute inset-0 h-[18px] w-[18px] text-[#9ec5ff] transition-all duration-500", oscuro ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0")} aria-hidden />
      </span>
    </button>
  );
}
