import { BaseLocal } from "@/db/local";
import type { Calificacion, Fila, NombreTabla, Periodo } from "@/db/tipos";
import { TABLAS } from "@/db/tipos";
import type { CambioSalida, RespuestaPull, ResultadoPush, Transporte } from "./motor";
import { SinConexion } from "./motor";

/**
 * Servidor simulado dentro del navegador (otra base IndexedDB). Sirve para probar y
 * capacitar sin Supabase. Aplica las mismas reglas de negocio clave que el servidor real
 * (parches por campo, hora asignada por el servidor, periodo cerrado).
 */
export class ServidorDemo extends BaseLocal {
  private reloj = 0;

  constructor(nombre = "colegio-servidor-demo") {
    super(nombre);
  }

  /** Hora del servidor, estrictamente creciente. */
  async marcaDeTiempo(): Promise<string> {
    if (this.reloj === 0) this.reloj = await this.leerMeta<number>("reloj", 0);
    this.reloj = Math.max(Date.now(), this.reloj + 1);
    await this.guardarMeta("reloj", this.reloj);
    return new Date(this.reloj).toISOString();
  }

  async aplicar(tabla: NombreTabla, parche: Record<string, unknown>, usuarioId: string | null, validar = true) {
    const t = this.tabla(tabla);
    const id = parche.id as string;
    const actual = (await t.get(id)) as Fila | undefined;
    const fila = { ...(actual ?? {}), ...parche } as Fila;

    if (validar && tabla === "calificacion") {
      const c = fila as Calificacion;
      const p = (await this.tabla("periodo").get(c.periodo_id)) as Periodo | undefined;
      if (p?.estado === "cerrado") throw new Error(`El ${p.nombre} está cerrado. Pida al director que lo reabra.`);
      // La conclusión descriptiva de B y C se exige al cerrar el periodo, no en cada envío:
      // el docente puede sincronizar a medio escribir.
    }

    if (validar && tabla === "periodo" && actual) {
      const antes = actual as Periodo;
      const p = fila as Periodo;
      if (antes.estado !== "cerrado" && p.estado === "cerrado") {
        const faltan = (await this.tabla("calificacion").toArray())
          .filter((c) => c.periodo_id === p.id && !c.eliminado && (c.nivel_logro === "B" || c.nivel_logro === "C") && !c.conclusion?.trim()).length;
        if (faltan) throw new Error(`No se puede cerrar el ${p.nombre}: faltan ${faltan} conclusiones descriptivas en calificaciones B o C.`);
      }
      if (antes.estado === "cerrado" && p.estado === "abierto" && (!p.motivo_reapertura?.trim() || p.motivo_reapertura === antes.motivo_reapertura)) {
        throw new Error(`Para reabrir el ${p.nombre} indique el motivo.`);
      }
    }

    fila.updated_at = await this.marcaDeTiempo();
    fila.updated_by = usuarioId;
    await t.put(fila as never);
  }

  /** Carga inicial de datos (semilla) directamente en el servidor. */
  async sembrar(filas: Partial<Record<NombreTabla, Fila[]>>) {
    for (const t of TABLAS) {
      for (const f of filas[t] ?? []) await this.aplicar(t, f as unknown as Record<string, unknown>, null, false);
    }
  }
}

export class TransporteDemo implements Transporte {
  constructor(
    private servidor: ServidorDemo,
    private usuarioId: () => string | null,
    private conectado: () => boolean,
  ) {}

  disponible() {
    return this.conectado();
  }

  async push(cambios: CambioSalida[]): Promise<ResultadoPush[]> {
    if (!this.conectado()) throw new SinConexion();
    const res: ResultadoPush[] = [];
    for (const c of cambios) {
      try {
        await this.servidor.aplicar(c.tabla, c.parche, this.usuarioId());
        res.push({ ref: c.ref, estado: "ok" });
      } catch (e) {
        res.push({ ref: c.ref, estado: "rechazado", motivo: e instanceof Error ? e.message : String(e) });
      }
    }
    return res;
  }

  async pull(cursor: string | null): Promise<RespuestaPull> {
    if (!this.conectado()) throw new SinConexion();
    const filas: Partial<Record<NombreTabla, Fila[]>> = {};
    let max = cursor ?? "";
    for (const t of TABLAS) {
      const cambiadas = (await this.servidor.tabla(t).toArray()).filter(
        (f) => !cursor || (f.updated_at ?? "") > cursor,
      ) as Fila[];
      if (cambiadas.length) filas[t] = cambiadas;
      for (const f of cambiadas) if ((f.updated_at ?? "") > max) max = f.updated_at!;
    }
    return { filas, cursor: max || new Date(0).toISOString(), hay_mas: false };
  }
}
