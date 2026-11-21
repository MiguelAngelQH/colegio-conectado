import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BaseLocal } from "@/db/local";
import type { Usuario } from "@/db/tipos";
import { MODO, ESPERA_TRAS_CAMBIO_MS, INTERVALO_SYNC_MS, supabase } from "@/config";
import { MotorSync, type ResumenSync, type Transporte } from "@/sync/motor";
import { ServidorDemo, TransporteDemo } from "@/sync/transporte-demo";
import { TransporteSupabase } from "@/sync/transporte-supabase";
import { alCambiarConexion, hayConexion } from "@/sync/red";
import { fijarDesfase } from "@/sync/reloj";
import { AlmacenDemo, AlmacenSupabase, subirPendientes, type AlmacenArchivos } from "@/sync/archivos";
import { CLAVE_DEMO, datosDemo, USUARIOS_DEMO, VERSION_DEMO } from "@/data/demo";
import { AuthDemo } from "@/sync/auth-demo";
import { AuthSupabase } from "@/sync/auth-supabase";
import { MENSAJE_DESACTIVADA, type Autenticacion } from "@/sync/autenticacion";

const CLAVE_SESION = "cc.sesion";
/** Motivo por el que se cerró la sesión (lo muestra la pantalla de ingreso una vez). */
export const CLAVE_MOTIVO_SALIDA = "cc.motivo-salida";

export const db = new BaseLocal("colegio-local");
const servidorDemo = MODO === "demo" ? new ServidorDemo() : null;

/** Dónde se suben los archivos de evidencias (servidor demo o Supabase Storage). */
export const almacen: AlmacenArchivos = servidorDemo ? new AlmacenDemo(servidorDemo) : new AlmacenSupabase(supabase!);

/** Ingreso y administración de cuentas (demo o Supabase Auth). */
export const autenticacion: Autenticacion = servidorDemo ? new AuthDemo(servidorDemo) : new AuthSupabase(supabase!);

// Solo en desarrollo: acceso desde la consola para pruebas manuales.
if (import.meta.env.DEV) {
  void import("@/db/repositorio").then((repo) => {
    (window as unknown as Record<string, unknown>).__cc = { db, servidorDemo, repo };
  });
}

interface Sesion {
  usuarioId: string;
  /** Primer ingreso o contraseña restablecida: debe elegir una contraseña propia antes de seguir. */
  debeCambiarClave?: boolean;
}

export interface EstadoSync {
  conectado: boolean;
  sincronizando: boolean;
  pendientes: number;
  rechazados: number;
  ultima: string | null;
  ultimoError: string | null;
}

interface ContextoApp {
  sesion: Sesion | null;
  usuario: Usuario | null;
  colegioId: string | null;
  cargandoPerfil: boolean;
  iniciarSesion(identificador: string, clave: string): Promise<void>;
  cambiarClave(nueva: string): Promise<void>;
  cerrarSesion(motivo?: string): Promise<void>;
  sync: EstadoSync;
  sincronizarAhora(): Promise<ResumenSync | null>;
}

const Ctx = createContext<ContextoApp | null>(null);

function leerSesion(): Sesion | null {
  try {
    const s = localStorage.getItem(CLAVE_SESION);
    return s ? (JSON.parse(s) as Sesion) : null;
  } catch {
    return null;
  }
}

function guardarSesion(s: Sesion | null) {
  try {
    if (s) localStorage.setItem(CLAVE_SESION, JSON.stringify(s));
    else localStorage.removeItem(CLAVE_SESION);
  } catch {
    /* sin almacenamiento: la sesión dura lo que la pestaña */
  }
}

async function prepararServidorDemo() {
  if (!servidorDemo) return;
  const sembrarCuentas = () => (autenticacion as AuthDemo).sembrar(USUARIOS_DEMO.map((u) => ({ usuarioId: u.id, clave: CLAVE_DEMO })));
  const version = await servidorDemo.leerMeta<number | boolean>("sembrado", 0);
  if (version === VERSION_DEMO) {
    // Datos al día pero sin contraseñas (sembrados por una versión anterior de la app).
    if (!(await servidorDemo.leerMeta<object | null>("credenciales", null))) await sembrarCuentas();
    return;
  }
  // Datos de demo de una versión anterior: se reinicia todo (solo afecta al modo demo).
  if (version) {
    await servidorDemo.vaciar();
    await db.vaciar();
  }
  await servidorDemo.sembrar(await datosDemo());
  await sembrarCuentas();
  await servidorDemo.guardarMeta("sembrado", VERSION_DEMO);
}

export function ProveedorApp({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(leerSesion);
  const [conectado, setConectado] = useState(hayConexion());
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimoError, setUltimoError] = useState<string | null>(null);
  const sesionRef = useRef(sesion);
  sesionRef.current = sesion;

  const motor = useMemo(() => {
    const transporte: Transporte = servidorDemo
      ? new TransporteDemo(servidorDemo, () => sesionRef.current?.usuarioId ?? null, hayConexion)
      : new TransporteSupabase(supabase!, hayConexion);
    return new MotorSync(db, transporte);
  }, []);

  const contadores = useLiveQuery(async () => ({
    pendientes: await db.outbox.where("estado").anyOf("pendiente", "enviando").count(),
    rechazados: await db.outbox.where("estado").equals("rechazado").count(),
    ultima: await db.leerMeta<string | null>("ultima_sync", null),
  }), [], { pendientes: 0, rechazados: 0, ultima: null });

  const usuario = useLiveQuery(
    async () => (sesion ? ((await db.tabla("usuario").get(sesion.usuarioId)) ?? null) : null),
    [sesion?.usuarioId],
    null,
  );
  const [cargandoPerfil, setCargandoPerfil] = useState(false);

  const sincronizarAhora = useCallback(async () => {
    if (!sesionRef.current) return null;
    setSincronizando(true);
    try {
      const r = await motor.sincronizar();
      setUltimoError(r.error);
      // Después de las filas, los archivos de evidencias pendientes (no bloquea si falla).
      if (!r.error) {
        const colegio = (await db.tabla("usuario").get(sesionRef.current!.usuarioId))?.colegio_id ?? null;
        const subidos = await subirPendientes(db, almacen, colegio).catch(() => 0);
        if (subidos) await motor.sincronizar();
      }
      return r;
    } finally {
      setSincronizando(false);
    }
  }, [motor]);

  // Sincronización automática: al conectar, cada minuto y poco después de cada cambio local.
  useEffect(() => {
    if (!sesion) return;
    // Pedir al navegador que no borre los datos locales por falta de espacio.
    navigator.storage?.persist?.().catch(() => undefined);
    const quitar = alCambiarConexion(() => {
      const c = hayConexion();
      setConectado(c);
      if (c) void sincronizarAhora();
    });
    // Último desfase de reloj conocido (para la hora de los QR sin conexión).
    void db.leerMeta<number>("desfase_ms", 0).then(fijarDesfase);
    // En demo, si cambió la versión de los datos de ejemplo se vuelven a sembrar antes de sincronizar.
    void prepararServidorDemo().then(() => sincronizarAhora());
    const t = setInterval(() => hayConexion() && void sincronizarAhora(), INTERVALO_SYNC_MS);
    return () => {
      quitar();
      clearInterval(t);
    };
  }, [sesion, sincronizarAhora]);

  useEffect(() => {
    if (!sesion || contadores.pendientes === 0 || !conectado) return;
    const t = setTimeout(() => void sincronizarAhora(), ESPERA_TRAS_CAMBIO_MS);
    return () => clearTimeout(t);
  }, [sesion, contadores.pendientes, conectado, sincronizarAhora]);

  const entrar = useCallback(async (s: Sesion) => {
    guardarSesion(s);
    setSesion(s);
    setCargandoPerfil(true);
    try {
      await motor.sincronizar();
    } finally {
      setCargandoPerfil(false);
    }
  }, [motor]);

  const cerrarSesion = useCallback(async (motivo?: string) => {
    // Se borran los datos locales para que otra persona no los vea en un equipo compartido.
    await db.vaciar();
    await autenticacion.salir();
    guardarSesion(null);
    try {
      // Puede llegar un evento de clic (onClick={cerrarSesion}): solo se guarda si es texto.
      if (typeof motivo === "string") sessionStorage.setItem(CLAVE_MOTIVO_SALIDA, motivo);
    } catch {
      /* sin almacenamiento: no se muestra el motivo */
    }
    setSesion(null);
  }, []);

  const iniciarSesion = useCallback(async (identificador: string, clave: string) => {
    if (!hayConexion()) throw new Error("El primer ingreso necesita conexión a internet. Después la app funciona sin señal.");
    await prepararServidorDemo();
    const r = await autenticacion.ingresar(identificador, clave);
    await entrar({ usuarioId: r.usuarioId, debeCambiarClave: r.debeCambiarClave });
  }, [entrar]);

  const cambiarClave = useCallback(async (nueva: string) => {
    const actual = sesionRef.current;
    if (!actual) return;
    if (!hayConexion()) throw new Error("Cambiar la contraseña necesita conexión a internet.");
    await autenticacion.cambiarClave(actual.usuarioId, nueva);
    const s = { ...actual, debeCambiarClave: false };
    guardarSesion(s);
    setSesion(s);
  }, []);

  // La sesión sigue vigente en el servidor? Se revisa al abrir la app y al recuperar la conexión.
  // Sin conexión no se puede saber y la sesión se mantiene (la app funciona offline).
  useEffect(() => {
    if (!sesion || !conectado) return;
    let vigente = true;
    void autenticacion.sesionVigente(sesion.usuarioId).then((ok) => {
      if (vigente && ok === false) void cerrarSesion("Su sesión terminó o la cuenta fue desactivada. Ingrese de nuevo.");
    });
    return () => {
      vigente = false;
    };
  }, [sesion?.usuarioId, conectado, cerrarSesion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si la sesión se cierra en el servidor (token revocado), también se cierra aquí.
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT" && sesionRef.current) void cerrarSesion("Su sesión terminó. Ingrese de nuevo.");
    });
    return () => data.subscription.unsubscribe();
  }, [cerrarSesion]);

  // La dirección desactivó la cuenta: al sincronizar llega el perfil inactivo.
  useEffect(() => {
    if (usuario && usuario.activo === false) void cerrarSesion(MENSAJE_DESACTIVADA);
  }, [usuario, cerrarSesion]);

  const valor: ContextoApp = {
    sesion,
    usuario,
    colegioId: usuario?.colegio_id ?? null,
    cargandoPerfil,
    iniciarSesion,
    cambiarClave,
    cerrarSesion,
    sync: { conectado, sincronizando, ...contadores, ultimoError },
    sincronizarAhora,
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useApp(): ContextoApp {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp fuera de ProveedorApp");
  return c;
}
