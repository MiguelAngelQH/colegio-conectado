import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useApp } from "@/app/contexto";
import { modulosPara } from "@/app/modulos";
import { Inicio } from "@/paginas/Inicio";
import { CambiarClaveObligatorio } from "@/paginas/CambiarClave";
import { Login } from "@/paginas/Login";
import { Perfil } from "@/paginas/Perfil";
import { Proximamente } from "@/paginas/Proximamente";
import { Sincronizacion } from "@/paginas/Sincronizacion";
import { Marco } from "@/ui/Marco";
import { Aviso, Boton, Contenido } from "@/ui/componentes";

// Módulos grandes: se cargan al abrirlos (el service worker los guarda igual para usarlos sin internet).
const Configuracion = lazy(() => import("@/paginas/configuracion/Configuracion").then((m) => ({ default: m.Configuracion })));
const Notas = lazy(() => import("@/paginas/notas/Notas").then((m) => ({ default: m.Notas })));
const Asistencia = lazy(() => import("@/paginas/asistencia/Asistencia").then((m) => ({ default: m.Asistencia })));
const MarcarAsistencia = lazy(() => import("@/paginas/asistencia/MarcarAsistencia").then((m) => ({ default: m.MarcarAsistencia })));
const Tutoria = lazy(() => import("@/paginas/tutoria/Tutoria").then((m) => ({ default: m.Tutoria })));
const Convivencia = lazy(() => import("@/paginas/convivencia/Convivencia").then((m) => ({ default: m.Convivencia })));
const MisNotas = lazy(() => import("@/paginas/familia/MisNotas").then((m) => ({ default: m.MisNotas })));
const MiAsistencia = lazy(() => import("@/paginas/familia/MiAsistencia").then((m) => ({ default: m.MiAsistencia })));
const Avisos = lazy(() => import("@/paginas/familia/Avisos").then((m) => ({ default: m.Avisos })));
const Paneles = lazy(() => import("@/paginas/paneles/Paneles").then((m) => ({ default: m.Paneles })));
const Monitoreo = lazy(() => import("@/paginas/paneles/Monitoreo").then((m) => ({ default: m.Monitoreo })));
const Exportar = lazy(() => import("@/paginas/exportar/Exportar").then((m) => ({ default: m.Exportar })));
const HistorialEstudiante = lazy(() => import("@/paginas/HistorialEstudiante").then((m) => ({ default: m.HistorialEstudiante })));
const Comunicados = lazy(() => import("@/paginas/comunicados/Comunicados").then((m) => ({ default: m.Comunicados })));

const IMPLEMENTADAS: Record<string, JSX.Element> = {
  "/": <Inicio />,
  "/perfil": <Perfil />,
  "/sincronizacion": <Sincronizacion />,
  "/configuracion": <Configuracion />,
  "/notas": <Notas />,
  "/asistencia": <Asistencia />,
  "/marcar": <MarcarAsistencia />,
  "/tutoria": <Tutoria />,
  "/convivencia": <Convivencia />,
  "/comunicados": <Comunicados />,
  "/mis-notas": <MisNotas />,
  "/mi-asistencia": <MiAsistencia />,
  "/avisos": <Avisos />,
  "/paneles": <Paneles />,
  "/monitoreo": <Monitoreo />,
  "/siagie": <Exportar />,
};

/** Rutas con subpáginas propias. */
const CON_SUBRUTAS = new Set(["/configuracion", "/asistencia", "/tutoria", "/convivencia"]);

export function App() {
  const { sesion, usuario, cargandoPerfil, sync, cerrarSesion } = useApp();

  if (!sesion) return <Login />;
  // Primer ingreso o contraseña restablecida: antes de usar la app elige una contraseña propia.
  if (sesion.debeCambiarClave) return <CambiarClaveObligatorio />;

  if (!usuario) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="fondo-cielo" aria-hidden />
        {cargandoPerfil || sync.sincronizando ? (
          <p className="vidrio !rounded-full flex items-center gap-2 px-5 py-3 text-sm font-semibold">
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> Descargando datos del colegio...
          </p>
        ) : (
          <Contenido ancho="max-w-md">
            <Aviso tipo="alerta" titulo="No se encontró su perfil en este equipo">
              {sync.ultimoError ? `Detalle: ${sync.ultimoError}. ` : ""}
              Conéctese a internet para descargarlo. Si el problema continúa, la dirección debe registrar su usuario.
            </Aviso>
            <Boton variante="vidrio" className="w-full" onClick={() => cerrarSesion()}>Volver al inicio de sesión</Boton>
          </Contenido>
        )}
      </div>
    );
  }

  const modulos = modulosPara(usuario.roles);
  return (
    <Routes>
      <Route element={<Marco />}>
        {modulos.map((m) => (
          <Route key={m.id} path={CON_SUBRUTAS.has(m.ruta) ? `${m.ruta}/*` : m.ruta} element={IMPLEMENTADAS[m.ruta] ?? <Proximamente modulo={m} />} />
        ))}
        {/* Historial del estudiante: se abre desde notas, tutoría y configuración (no está en el menú). */}
        {usuario.roles.some((r) => ["director", "subdirector", "docente", "tutor", "auxiliar", "ugel"].includes(r)) && (
          <Route path="/estudiantes/:id" element={<HistorialEstudiante />} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
