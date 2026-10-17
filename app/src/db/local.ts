import Dexie, { type Table } from "dexie";
import { INDICES, type Fila, type NombreTabla, type Tablas } from "./tipos";

/** Cambio local pendiente de enviar al servidor. */
export interface EntradaOutbox {
  id?: number;
  tabla: NombreTabla;
  fila_id: string;
  /** Solo los campos modificados (más id y colegio_id). */
  parche: Record<string, unknown>;
  /** Fila tal como estaba antes del primer cambio local (para poder descartar). */
  base: Fila | null;
  creado: number;
  intentos: number;
  proximo_intento: number;
  estado: "pendiente" | "enviando" | "rechazado";
  error: string | null;
}

/** Versión del servidor que llegó mientras la fila tenía cambios locales pendientes. */
export interface Sombra {
  clave: string; // `${tabla}:${id}`
  tabla: NombreTabla;
  fila: Fila;
}

export interface Meta {
  clave: string;
  valor: unknown;
}

export type TablasDexie = { [K in NombreTabla]: Table<Tablas[K], string> };

export class BaseLocal extends Dexie {
  outbox!: Table<EntradaOutbox, number>;
  sombra!: Table<Sombra, string>;
  meta!: Table<Meta, string>;

  constructor(nombre: string) {
    super(nombre);
    this.version(1).stores({
      ...INDICES,
      outbox: "++id, estado, [tabla+fila_id], proximo_intento",
      sombra: "clave",
      meta: "clave",
    });
  }

  tabla<K extends NombreTabla>(nombre: K): Table<Tablas[K], string> {
    return this.table(nombre) as Table<Tablas[K], string>;
  }

  async leerMeta<T>(clave: string, defecto: T): Promise<T> {
    const m = await this.meta.get(clave);
    return m === undefined ? defecto : (m.valor as T);
  }

  async guardarMeta(clave: string, valor: unknown): Promise<void> {
    await this.meta.put({ clave, valor });
  }

  /** Borra todos los datos locales (al cerrar sesión en un equipo compartido). */
  async vaciar(): Promise<void> {
    await this.transaction("rw", this.tables, async () => {
      await Promise.all(this.tables.map((t) => t.clear()));
    });
  }
}

export function nuevoId(): string {
  const c = globalThis.crypto as Crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  // Respaldo para WebViews antiguos sin randomUUID.
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
