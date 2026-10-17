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
import { datosDemo, USUARIOS_DEMO, VERSION_DEMO } from "@/data/demo";

const CLAVE_SESION = "cc.sesion";

export const db = new BaseLocal("colegio-local");
const servidorDemo = MODO === "demo" ? new ServidorDemo() : null;

// Solo en desarrollo: acceso desde la consola para pruebas manuales.
if (import.meta.env.DEV) {
  void import("@/db/repositorio").then((repo) => {
    (window as unknown as Record<string, unknown>).__cc = { db, servidorDemo, repo };
  });
}

interface Sesion {
  usuarioId: string;
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
  iniciarDemo(usuarioId: string): Promise<void>;
  iniciarConCorreo(correo: string, clave: string): Promise<void>;
  cerrarSesion(): Promise<void>;
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
  const version = await servidorDemo.leerMeta<number | boolean>("sembrado", 0);
  if (version === VERSION_DEMO) return;
  // Datos de demo de una versión anterior: se reinicia todo (solo afecta al modo demo).
  if (version) {
    await servidorDemo.vaciar();
    await db.vaciar();
  }
  await servidorDemo.sembrar(await datosDemo());
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

  const iniciarDemo = useCallback(async (usuarioId: string) => {
    if (!USUARIOS_DEMO.some((u) => u.id === usuarioId)) throw new Error("Usuario de demo desconocido");
    if (!hayConexion()) throw new Error("La primera vez se necesita conexión para descargar los datos.");
    await prepararServidorDemo();
    await entrar({ usuarioId });
  }, [entrar]);

  const iniciarConCorreo = useCallback(async (correo: string, clave: string) => {
    if (!supabase) throw new Error("El servidor no está configurado.");
    if (!hayConexion()) throw new Error("El primer inicio de sesión necesita conexión a internet.");
    const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
    if (error) throw new Error(error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : error.message);
    await entrar({ usuarioId: data.user.id });
  }, [entrar]);

  const cerrarSesion = useCallback(async () => {
    // Se borran los datos locales para que otra persona no los vea en un equipo compartido.
    await db.vaciar();
    if (supabase) await supabase.auth.signOut().catch(() => undefined);
    guardarSesion(null);
    setSesion(null);
  }, []);

  const valor: ContextoApp = {
    sesion,
    usuario,
    colegioId: usuario?.colegio_id ?? null,
    cargandoPerfil,
    iniciarDemo,
    iniciarConCorreo,
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
