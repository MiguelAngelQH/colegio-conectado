import { BaseLocal } from "@/db/local";
import type { Asistencia, AsistenciaSesion, Calificacion, Fila, Justificacion, NombreTabla, Periodo, Usuario } from "@/db/tipos";
import { evaluarMarca, firmaValida, leerTokenQr } from "@/dominio/qr";
import { TABLAS } from "@/db/tipos";
import type { CambioSalida, RespuestaPull, ResultadoPush, Transporte } from "./motor";
import { SinConexion } from "./motor";

/**
 * Servidor simulado dentro del navegador (otra base IndexedDB). Sirve para probar y
 * capacitar sin Supabase. Aplica las mismas reglas de negocio clave que el servidor real
 * (parches por campo, hora asignada por el servidor, periodo cerrado).
 */
/** Error temporal: el cambio se reintentará más tarde (igual que errcode 23503 en el servidor real). */
export class ErrorReintentar extends Error {}

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

    if (validar && tabla === "justificacion") {
      // Igual que el trigger validar_justificacion (migración 0009).
      const u = usuarioId ? ((await this.tabla("usuario").get(usuarioId)) as Usuario | undefined) : undefined;
      const personal = u?.roles.some((r) => ["director", "subdirector", "docente", "tutor", "auxiliar"].includes(r));
      const j = fila as Justificacion;
      if (!personal) {
        if (j.estado !== "pendiente" || j.revisado_por || j.respuesta) throw new Error("Solo el colegio puede aprobar o rechazar una justificación");
        if (actual && (actual as Justificacion).estado !== "pendiente") throw new Error("La justificación ya fue revisada");
      } else if (j.estado !== "pendiente" && (!actual || (actual as Justificacion).estado === "pendiente")) {
        j.revisado_por = usuarioId;
      }
    }

    if (validar && tabla === "asistencia") {
      await this.validarMarcaQr(fila as Asistencia, !!actual, usuarioId);
    }

    fila.updated_at = await this.marcaDeTiempo();
    fila.updated_by = usuarioId;
    await t.put(fila as never);
  }

  /** Misma regla que el trigger validar_marca_qr (migración 0007). Modifica la fila recibida. */
  private async validarMarcaQr(a: Asistencia, existe: boolean, usuarioId: string | null) {
    if (a.origen !== "qr" || !usuarioId) return;
    const u = (await this.tabla("usuario").get(usuarioId)) as Usuario | undefined;
    const personal = u?.roles.some((r) => ["director", "subdirector", "docente", "tutor", "auxiliar"].includes(r));
    if (personal) return;
    if (existe) throw new Error("Tu asistencia de esta clase ya fue registrada");
    const token = leerTokenQr(a.token_qr ?? "");
    if (!token || token.sesionId !== a.sesion_id) throw new Error("El código no corresponde a esta clase");
    const secreto = (await this.tabla("asistencia_secreto").where("sesion_id").equals(a.sesion_id).first())?.secreto;
    if (!secreto) throw new ErrorReintentar("La clase todavía no se sincroniza");
    const sesion = (await this.tabla("asistencia_sesion").get(a.sesion_id)) as AsistenciaSesion | undefined;
    const matriculado = !!(await this.tabla("matricula").where("estudiante_id").equals(a.estudiante_id).toArray())
      .find((m) => m.seccion_id === sesion?.seccion_id && !m.eliminado && m.estado === "matriculado");
    const marcas = await this.tabla("asistencia").toArray();
    const habitual = marcas
      .filter((m) => m.estudiante_id === a.estudiante_id && m.origen === "qr" && m.dispositivo_id && !m.por_revisar && !m.eliminado)
      .sort((x, y) => (y.marcado_en ?? "").localeCompare(x.marcado_en ?? ""))[0]?.dispositivo_id ?? null;
    const r = evaluarMarca({
      token, firmaOk: await firmaValida(token, secreto), sesionId: a.sesion_id, abiertaEnMs: sesion?.abierta_en ?? null,
      marcadoEnMs: a.marcado_en ? Date.parse(a.marcado_en) : null, matriculado,
      dispositivoHabitual: habitual, dispositivo: a.dispositivo_id ?? null,
      dispositivoUsadoPorOtro: !!a.dispositivo_id && marcas.some((m) => m.sesion_id === a.sesion_id && m.dispositivo_id === a.dispositivo_id && m.estudiante_id !== a.estudiante_id),
    });
    if (!r.valida) throw new Error(r.motivo);
    a.estado = "P";
    a.por_revisar = r.porRevisar;
    a.motivo_revision = r.motivo;
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
        const motivo = e instanceof Error ? e.message : String(e);
        res.push({ ref: c.ref, estado: e instanceof ErrorReintentar ? "reintentar" : "rechazado", motivo });
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
    return { filas, cursor: max || new Date(0).toISOString(), hay_mas: false, hora: Date.now() };
  }
}
