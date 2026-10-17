import { Navigate, Route, Routes } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useApp } from "@/app/contexto";
import { modulosPara } from "@/app/modulos";
import { Inicio } from "@/paginas/Inicio";
import { Login } from "@/paginas/Login";
import { Perfil } from "@/paginas/Perfil";
import { Proximamente } from "@/paginas/Proximamente";
import { Configuracion } from "@/paginas/configuracion/Configuracion";
import { Notas } from "@/paginas/notas/Notas";
import { Asistencia } from "@/paginas/asistencia/Asistencia";
import { MarcarAsistencia } from "@/paginas/asistencia/MarcarAsistencia";
import { Sincronizacion } from "@/paginas/Sincronizacion";
import { Marco } from "@/ui/Marco";
import { Aviso, Boton, Contenido } from "@/ui/componentes";

const IMPLEMENTADAS: Record<string, JSX.Element> = {
  "/": <Inicio />,
  "/perfil": <Perfil />,
  "/sincronizacion": <Sincronizacion />,
  "/configuracion": <Configuracion />,
  "/notas": <Notas />,
  "/asistencia": <Asistencia />,
  "/marcar": <MarcarAsistencia />,
};

/** Rutas con subpáginas propias. */
const CON_SUBRUTAS = new Set(["/configuracion", "/asistencia"]);

export function App() {
  const { sesion, usuario, cargandoPerfil, sync, cerrarSesion } = useApp();

  if (!sesion) return <Login />;

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
            <Boton variante="vidrio" className="w-full" onClick={cerrarSesion}>Volver al inicio de sesión</Boton>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
