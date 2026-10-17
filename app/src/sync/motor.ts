import type { BaseLocal, EntradaOutbox } from "@/db/local";
import type { Fila, NombreTabla } from "@/db/tipos";
import { TABLAS } from "@/db/tipos";
import { fijarDesfase } from "./reloj";

export interface CambioSalida {
  ref: number; // id de la entrada en el outbox
  tabla: NombreTabla;
  parche: Record<string, unknown>;
}

export type ResultadoPush =
  | { ref: number; estado: "ok" }
  | { ref: number; estado: "rechazado"; motivo: string }
  | { ref: number; estado: "reintentar"; motivo: string };

export interface RespuestaPull {
  filas: Partial<Record<NombreTabla, Fila[]>>;
  cursor: string;
  /** true si el servidor cortó la respuesta y hay más filas por traer. */
  hay_mas: boolean;
  /** Hora del servidor (ms) al responder: sirve para corregir el reloj del equipo. */
  hora?: number;
}

/** Comunicación con el servidor. Hay una implementación demo y una de Supabase. */
export interface Transporte {
  disponible(): boolean;
  push(cambios: CambioSalida[]): Promise<ResultadoPush[]>;
  pull(cursor: string | null): Promise<RespuestaPull>;
}

export class SinConexion extends Error {
  constructor(m = "Sin conexión") {
    super(m);
  }
}

export interface ResumenSync {
  enviados: number;
  rechazados: number;
  recibidos: number;
  error: string | null;
}

const ESPERA_BASE_MS = 5_000;
const ESPERA_MAX_MS = 10 * 60_000;
/** Reintentos de un cambio que el servidor pide "reintentar" antes de darlo por no aceptado. */
export const MAX_INTENTOS = 30;

export function espera(intentos: number): number {
  return Math.min(ESPERA_BASE_MS * 2 ** Math.max(0, intentos - 1), ESPERA_MAX_MS);
}

export class MotorSync {
  private enCurso: Promise<ResumenSync> | null = null;

  constructor(
    private db: BaseLocal,
    private transporte: Transporte,
    private opciones: { lote?: number; ahora?: () => number } = {},
  ) {}

  private ahora() {
    return this.opciones.ahora?.() ?? Date.now();
  }

  /** Envía pendientes y luego trae cambios. Si ya hay una sincronización en curso, la reutiliza. */
  sincronizar(): Promise<ResumenSync> {
    if (!this.enCurso) {
      this.enCurso = this.ejecutar().finally(() => {
        this.enCurso = null;
      });
    }
    return this.enCurso;
  }

  private async ejecutar(): Promise<ResumenSync> {
    const r: ResumenSync = { enviados: 0, rechazados: 0, recibidos: 0, error: null };
    if (!this.transporte.disponible()) return { ...r, error: "Sin conexión" };
    try {
      await this.recuperarEnviando();
      for (;;) {
        const n = await this.pushLote(r);
        if (n === 0) break;
      }
      for (;;) {
        const masDatos = await this.pullPagina(r);
        if (!masDatos) break;
      }
      await this.db.guardarMeta("ultima_sync", new Date(this.ahora()).toISOString());
    } catch (e) {
      r.error = e instanceof Error ? e.message : String(e);
    }
    return r;
  }

  /** Si la app se cerró a mitad de un envío, esas entradas vuelven a pendiente. */
  private async recuperarEnviando() {
    await this.db.outbox.where("estado").equals("enviando").modify({ estado: "pendiente" });
  }

  private async pushLote(r: ResumenSync): Promise<number> {
    const ahora = this.ahora();
    const lote = await this.db.outbox
      .where("estado")
      .equals("pendiente")
      .filter((e) => e.proximo_intento <= ahora)
      .limit(this.opciones.lote ?? 100)
      .toArray();
    if (lote.length === 0) return 0;

    const ids = lote.map((e) => e.id!);
    await this.db.outbox.where("id").anyOf(ids).modify({ estado: "enviando" });

    let resultados: ResultadoPush[];
    try {
      resultados = await this.transporte.push(
        lote.map((e) => ({ ref: e.id!, tabla: e.tabla, parche: e.parche })),
      );
    } catch (e) {
      await this.posponer(lote, e instanceof Error ? e.message : String(e));
      throw e;
    }

    const porRef = new Map(resultados.map((x) => [x.ref, x]));
    await this.db.transaction("rw", this.db.outbox, async () => {
      for (const e of lote) {
        const res = porRef.get(e.id!);
        if ((!res || res.estado === "reintentar") && e.intentos + 1 >= MAX_INTENTOS) {
          // Tras muchos intentos (por ejemplo, un QR de una clase que nunca existió) se deja de insistir:
          // queda visible como "no aceptado" para que una persona decida.
          await this.db.outbox.update(e.id!, { estado: "rechazado", intentos: e.intentos + 1, error: `No se pudo enviar tras ${MAX_INTENTOS} intentos: ${res?.motivo ?? "sin respuesta"}` });
          r.rechazados++;
        } else if (!res || res.estado === "reintentar") {
          await this.db.outbox.update(e.id!, {
            estado: "pendiente",
            intentos: e.intentos + 1,
            proximo_intento: this.ahora() + espera(e.intentos + 1),
            error: res?.motivo ?? "Sin respuesta del servidor",
          });
        } else if (res.estado === "ok") {
          await this.db.outbox.delete(e.id!);
          r.enviados++;
        } else {
          await this.db.outbox.update(e.id!, { estado: "rechazado", error: res.motivo });
          r.rechazados++;
        }
      }
    });
    // Si todo el lote quedó para reintentar, no insistir en este ciclo.
    return resultados.some((x) => x.estado !== "reintentar") ? lote.length : 0;
  }

  private async posponer(lote: EntradaOutbox[], motivo: string) {
    await this.db.transaction("rw", this.db.outbox, async () => {
      for (const e of lote) {
        await this.db.outbox.update(e.id!, {
          estado: "pendiente",
          intentos: e.intentos + 1,
          proximo_intento: this.ahora() + espera(e.intentos + 1),
          error: motivo,
        });
      }
    });
  }

  private async pullPagina(r: ResumenSync): Promise<boolean> {
    const cursor = await this.db.leerMeta<string | null>("cursor", null);
    const antes = Date.now();
    const resp = await this.transporte.pull(cursor);
    if (typeof resp.hora === "number") {
      // Se descuenta la mitad del tiempo de ida y vuelta.
      const d = Math.round(resp.hora - (antes + Date.now()) / 2);
      fijarDesfase(d);
      await this.db.guardarMeta("desfase_ms", d);
    }
    const tablas = TABLAS.filter((t) => resp.filas[t]?.length);
    await this.db.transaction("rw", [...tablas.map((t) => this.db.tabla(t)), this.db.outbox, this.db.sombra, this.db.meta], async () => {
      for (const t of tablas) {
        for (const fila of resp.filas[t]!) {
          const conCambios = await this.db.outbox.where("[tabla+fila_id]").equals([t, fila.id]).count();
          if (conCambios > 0) {
            // No pisar cambios locales: se guarda la versión del servidor por si se descartan.
            await this.db.sombra.put({ clave: `${t}:${fila.id}`, tabla: t, fila });
          } else {
            await this.db.tabla(t).put(fila as never);
            await this.db.sombra.delete(`${t}:${fila.id}`);
          }
          r.recibidos++;
        }
      }
      await this.db.guardarMeta("cursor", resp.cursor);
    });
    // Si el cursor no avanzó no se pide otra página (evita un bucle infinito).
    return resp.hay_mas && resp.cursor !== cursor;
  }
}

/** Vuelve a intentar un cambio rechazado (por ejemplo, después de que el director reabrió el periodo). */
export async function reintentarRechazado(db: BaseLocal, id: number) {
  await db.outbox.update(id, { estado: "pendiente", intentos: 0, proximo_intento: 0, error: null });
}

/**
 * Descarta un cambio local rechazado: restaura la última versión conocida del servidor
 * (sombra) o, si no hay, la fila como estaba antes del cambio.
 */
export async function descartarCambio(db: BaseLocal, id: number) {
  const e = await db.outbox.get(id);
  if (!e) return;
  const t = db.tabla(e.tabla);
  await db.transaction("rw", [t, db.outbox, db.sombra], async () => {
    await db.outbox.delete(id);
    const quedan = await db.outbox.where("[tabla+fila_id]").equals([e.tabla, e.fila_id]).count();
    if (quedan > 0) return;
    const clave = `${e.tabla}:${e.fila_id}`;
    const sombra = await db.sombra.get(clave);
    if (sombra) {
      await t.put(sombra.fila as never);
      await db.sombra.delete(clave);
    } else if (e.base) {
      await t.put(e.base as never);
    } else {
      await t.delete(e.fila_id);
    }
  });
}
