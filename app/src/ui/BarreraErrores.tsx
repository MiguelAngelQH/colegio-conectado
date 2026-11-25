import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

/**
 * Si una pantalla falla, muestra un mensaje en lugar de dejar la app en blanco.
 * Los datos guardados en el equipo no se pierden: están en IndexedDB, no en memoria.
 */
export class BarreraErrores extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error en la interfaz", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="fondo-cielo" aria-hidden />
        <div className="vidrio-solido w-full max-w-md p-6 text-center" role="alert">
          <span className="gema tono-coral mx-auto h-14 w-14"><TriangleAlert className="relative z-10 h-7 w-7" aria-hidden /></span>
          <h1 className="titulo-display mt-4 text-xl font-bold">Algo salió mal en esta pantalla</h1>
          <p className="mt-2 text-sm text-tinta-suave">Sus datos están a salvo en este equipo. Recargue la aplicación para continuar.</p>
          <p className="mt-3 break-words rounded-xl bg-sup/60 p-2 font-mono text-xs text-tinta-suave">{this.state.error.message}</p>
          <button onClick={() => location.reload()} className="vidrio-laguna mt-5 inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold">
            <RefreshCw className="h-4 w-4" aria-hidden /> Recargar
          </button>
        </div>
      </div>
    );
  }
}
