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
      /**
       * Muchas cuentas (una sección o todo el colegio): de 4 en 4 para no tardar, un error no detiene
       * a las demás, los resultados quedan en el mismo orden y se sincroniza una sola vez al final.
       */
      crearVarias: (lista: NuevaCuenta[], alAvanzar?: (hechas: number) => void) => conServidor(async (por) => {
        const resultados: (ResultadoCuenta | { error: string })[] = new Array(lista.length);
        let hechas = 0;
        let siguiente = 0;
        const trabajador = async () => {
          while (siguiente < lista.length) {
            const i = siguiente++;
            try {
              resultados[i] = await autenticacion.crearCuenta(lista[i], por);
            } catch (e) {
              resultados[i] = { error: e instanceof Error ? e.message : String(e) };
            }
            alAvanzar?.(++hechas);
          }
        };
        await Promise.all(Array.from({ length: Math.min(4, lista.length) }, trabajador));
        return resultados;
      }),
      restablecer: (usuarioId: string) => conServidor((por) => autenticacion.restablecerClave(usuarioId, por)),
      cambiarEstado: (usuarioId: string, activo: boolean) => conServidor((por) => autenticacion.cambiarEstado(usuarioId, activo, por)),
    };
  }, [usuario, sincronizarAhora]);
}
