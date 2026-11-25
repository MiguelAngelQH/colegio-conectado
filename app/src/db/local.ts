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

/** Archivo de una evidencia guardado en el equipo (para verlo y subirlo sin conexión). */
export interface ArchivoLocal {
  id: string; // id de la evidencia
  blob: Blob;
  /** 1 = ya está en el servidor (Dexie no indexa booleanos). */
  subido: 0 | 1;
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
  archivo!: Table<ArchivoLocal, string>;

  constructor(nombre: string) {
    super(nombre);
    const internas = { outbox: "++id, estado, [tabla+fila_id], proximo_intento", sombra: "clave", meta: "clave" };
    const nuevasV3 = { entrevista: null, incidencia_accion: null, comunicado_lectura: null, evidencia: null };
    // Al cambiar índices o tablas se agrega una versión nueva; Dexie migra los datos existentes.
    this.version(1).stores({ ...INDICES, tarea_entrega: null, mensaje: null, evento: null, horario_clase: null, tarea: null, lista_cotejo: null, ...nuevasV3, justificacion: null, solicitud_tutoria: null, informe_tutor: null, asistencia_sesion: "id, seccion_id, docente_id, fecha", asistencia_secreto: null, ...internas });
    this.version(2).stores({ ...INDICES, tarea_entrega: null, mensaje: null, evento: null, horario_clase: null, tarea: null, lista_cotejo: null, ...nuevasV3, justificacion: null, solicitud_tutoria: null, informe_tutor: null, ...internas });
    // v3: tablas de tutoría, convivencia y comunicados, y "archivo" (binarios de evidencias; solo local, no se sincroniza como fila).
    this.version(3).stores({ ...INDICES, tarea_entrega: null, mensaje: null, evento: null, horario_clase: null, tarea: null, lista_cotejo: null, ...internas, justificacion: null, solicitud_tutoria: null, informe_tutor: null, archivo: "id, subido" });
    // v4: justificaciones de la familia.
    this.version(4).stores({ ...INDICES, tarea_entrega: null, mensaje: null, evento: null, horario_clase: null, tarea: null, lista_cotejo: null, ...internas, solicitud_tutoria: null, informe_tutor: null, archivo: "id, subido" });
    // v5: pedidos de ayuda al tutor.
    this.version(5).stores({ ...INDICES, tarea_entrega: null, mensaje: null, evento: null, horario_clase: null, tarea: null, lista_cotejo: null, ...internas, informe_tutor: null, archivo: "id, subido" });
    // v6: informe del tutor (historial del estudiante).
    this.version(6).stores({ ...INDICES, tarea_entrega: null, mensaje: null, evento: null, horario_clase: null, tarea: null, ...internas, lista_cotejo: null, archivo: "id, subido" });
    // v7: listas de cotejo por sesión.
    this.version(7).stores({ ...INDICES, tarea_entrega: null, mensaje: null, evento: null, horario_clase: null, tarea: null, ...internas, archivo: "id, subido" });
    // v8: horario de clases y tareas.
    this.version(8).stores({ ...INDICES, tarea_entrega: null, mensaje: null, evento: null, ...internas, archivo: "id, subido" });
    // v9: calendario escolar.
    this.version(9).stores({ ...INDICES, tarea_entrega: null, mensaje: null, ...internas, archivo: "id, subido" });
    // v10: mensajes entre el personal y las familias.
    this.version(10).stores({ ...INDICES, tarea_entrega: null, ...internas, archivo: "id, subido" });
    // v11: entregas de tareas.
    this.version(11).stores({ ...INDICES, ...internas, archivo: "id, subido" });
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
