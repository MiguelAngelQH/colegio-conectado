import type { SupabaseClient } from "@supabase/supabase-js";
import type { Fila, NombreTabla } from "@/db/tipos";
import type { CambioSalida, RespuestaPull, ResultadoPush, Transporte } from "./motor";
import { SinConexion } from "./motor";

/**
 * Transporte real: usa las funciones `sync_push` y `sync_pull` de la base de datos
 * (ver supabase/migrations). Los permisos los aplica RLS con el usuario de la sesión.
 */
export class TransporteSupabase implements Transporte {
  constructor(
    private cliente: SupabaseClient,
    private conectado: () => boolean,
  ) {}

  disponible() {
    return this.conectado();
  }

  async push(cambios: CambioSalida[]): Promise<ResultadoPush[]> {
    if (!this.conectado()) throw new SinConexion();
    const { data, error } = await this.cliente.rpc("sync_push", {
      cambios: cambios.map((c) => ({ ref: c.ref, tabla: c.tabla, parche: c.parche })),
    });
    if (error) throw new Error(error.message);
    return data as ResultadoPush[];
  }

  async pull(cursor: string | null): Promise<RespuestaPull> {
    if (!this.conectado()) throw new SinConexion();
    const { data, error } = await this.cliente.rpc("sync_pull", { desde: cursor });
    if (error) throw new Error(error.message);
    const r = data as { filas: Partial<Record<NombreTabla, Fila[]>>; cursor: string; hay_mas: boolean };
    return { filas: r.filas ?? {}, cursor: r.cursor, hay_mas: r.hay_mas };
  }
}
