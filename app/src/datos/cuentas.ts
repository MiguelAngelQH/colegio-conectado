// Administración de cuentas desde la dirección: crear, restablecer contraseña y desactivar.
// Necesita internet (lo valida el servidor); después se sincroniza para ver el cambio en este equipo.
import { useMemo } from "react";
import { autenticacion, useApp } from "@/app/contexto";
import type { NuevaCuenta, ResultadoCuenta } from "@/sync/autenticacion";
import { hayConexion } from "@/sync/red";

export type { NuevaCuenta, ResultadoCuenta };

export function useCuentas() {
  const { usuario, sincronizarAhora } = useApp();
  return useMemo(() => {
    const conServidor = async <T,>(fn: (porUsuarioId: string) => Promise<T>): Promise<T> => {
      if (!usuario) throw new Error("Sesión no iniciada.");
      if (!hayConexion()) throw new Error("Administrar cuentas necesita conexión a internet. Lo demás de la configuración funciona sin señal.");
      const r = await fn(usuario.id);
      await sincronizarAhora();
      return r;
    };
    return {
      crear: (d: NuevaCuenta) => conServidor((por) => autenticacion.crearCuenta(d, por)),
      /** Varias cuentas seguidas (una sección): un error no detiene a las demás y se sincroniza una sola vez. */
      crearVarias: (lista: NuevaCuenta[], alAvanzar?: (hechas: number) => void) => conServidor(async (por) => {
        const resultados: (ResultadoCuenta | { error: string })[] = [];
        for (const d of lista) {
          try {
            resultados.push(await autenticacion.crearCuenta(d, por));
          } catch (e) {
            resultados.push({ error: e instanceof Error ? e.message : String(e) });
          }
          alAvanzar?.(resultados.length);
        }
        return resultados;
      }),
      restablecer: (usuarioId: string) => conServidor((por) => autenticacion.restablecerClave(usuarioId, por)),
      cambiarEstado: (usuarioId: string, activo: boolean) => conServidor((por) => autenticacion.cambiarEstado(usuarioId, activo, por)),
    };
  }, [usuario, sincronizarAhora]);
}
