import { BaseLocal } from "@/db/local";
import type { AnioEscolar, Asistencia, AsistenciaSesion, Calificacion, Fila, InformeTutor, Justificacion, Matricula, NombreTabla, ObservacionMonitoreo, Periodo, SolicitudTutoria, Usuario } from "@/db/tipos";
import { ABIERTAS, puedeVer, validarSolicitud } from "@/dominio/solicitudes";
import { evaluarMarca, leerTokenQr, ventanaValida } from "@/dominio/qr";
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

    if (validar && tabla === "observacion_monitoreo" && actual) {
      // Igual que el trigger validar_monitoreo (migración 0010).
      const u = usuarioId ? ((await this.tabla("usuario").get(usuarioId)) as Usuario | undefined) : undefined;
      const antes = actual as ObservacionMonitoreo;
      const o = fila as ObservacionMonitoreo;
      if (!u?.roles.includes("ugel")) {
        if (o.texto !== antes.texto || o.categoria !== antes.categoria || o.fecha !== antes.fecha || o.autor_id !== antes.autor_id) {
          throw new Error("Solo la UGEL puede modificar su observación");
        }
        if (o.respuesta !== antes.respuesta) o.respondido_en = new Date().toISOString();
      }
    }

    if (validar && tabla === "asistencia") {
      await this.validarMarcaQr(fila as Asistencia, !!actual, usuarioId);
    }

    if (validar && usuarioId) await this.validarCierre(tabla, fila, actual, usuarioId);

    let guardar = fila;
    if (validar && tabla === "solicitud_tutoria" && usuarioId) {
      guardar = await this.validarSolicitud(actual as SolicitudTutoria | undefined, fila as SolicitudTutoria, usuarioId);
    }

    guardar.updated_at = await this.marcaDeTiempo();
    guardar.updated_by = usuarioId;
    await t.put(guardar as never);
  }

  /** Año escolar al que pertenece una fila (para no modificar años cerrados). */
  private async anioDe(tabla: NombreTabla, fila: Fila): Promise<string | null> {
    const f = fila as unknown as Record<string, string>;
    if (tabla === "calificacion") return ((await this.tabla("periodo").get(f.periodo_id)) as Periodo | undefined)?.anio_id ?? null;
    if (tabla === "asistencia_sesion") return (await this.tabla("seccion").get(f.seccion_id))?.anio_id ?? null;
    if (tabla === "asistencia") {
      const ses = await this.tabla("asistencia_sesion").get(f.sesion_id);
      return ses ? (await this.tabla("seccion").get(ses.seccion_id))?.anio_id ?? null : null;
    }
    if (tabla === "informe_tutor") return f.anio_id;
    return null;
  }

  /** Igual que la migración 0013: año cerrado, situación final e informe del tutor. */
  private async validarCierre(tabla: NombreTabla, fila: Fila, actual: Fila | undefined, usuarioId: string) {
    const u = (await this.tabla("usuario").get(usuarioId)) as Usuario | undefined;
    const gestion = !!u?.roles.some((r) => r === "director" || r === "subdirector");
    if (["calificacion", "asistencia_sesion", "asistencia", "informe_tutor"].includes(tabla)) {
      const anio = await this.anioDe(tabla, fila);
      if (anio && ((await this.tabla("anio_escolar").get(anio)) as AnioEscolar | undefined)?.cerrado_en) {
        throw new Error("El año escolar ya está cerrado: sus registros no se modifican.");
      }
    }
    if (tabla === "matricula" && actual) {
      const m = fila as Matricula;
      const a = actual as Matricula;
      const campos = ["situacion_propuesta", "situacion_final", "situacion_motivo", "asistencia_resumen", "resultado_recuperacion"] as const;
      if (campos.some((k) => JSON.stringify(m[k] ?? null) !== JSON.stringify(a[k] ?? null)) && !gestion) {
        throw new Error("Solo la dirección registra la situación final.");
      }
      if (m.situacion_final && m.situacion_propuesta && m.situacion_final !== m.situacion_propuesta && !m.situacion_motivo?.trim()) {
        throw new Error("Indique el motivo para cambiar la situación propuesta.");
      }
    }
    if (tabla === "informe_tutor" && !gestion) {
      const i = fila as InformeTutor;
      const activo = ((await this.tabla("anio_escolar").toArray()) as AnioEscolar[]).find((x) => x.activo && !x.eliminado)?.id;
      const mats = (await this.tabla("matricula").where("estudiante_id").equals(i.estudiante_id).toArray()).filter((x) => !x.eliminado && x.anio_id === activo);
      const secciones = await this.tabla("seccion").bulkGet(mats.map((x) => x.seccion_id));
      if (i.tutor_id !== usuarioId || !secciones.some((sec) => sec?.tutor_id === usuarioId)) {
        throw new Error("Solo el tutor(a) del estudiante o la dirección escriben este informe.");
      }
    }
  }

  /** Estudiantes "propios": el mismo estudiante o los hijos del apoderado (como mis_estudiantes()). */
  private async misEstudiantes(usuarioId: string): Promise<Set<string>> {
    const propios = (await this.tabla("estudiante").where("usuario_id").equals(usuarioId).toArray()).filter((e) => !e.eliminado).map((e) => e.id);
    const apos = (await this.tabla("apoderado").where("usuario_id").equals(usuarioId).toArray()).filter((a) => !a.eliminado).map((a) => a.id);
    const vinc = (await this.tabla("estudiante_apoderado").toArray()).filter((v) => !v.eliminado && apos.includes(v.apoderado_id)).map((v) => v.estudiante_id);
    return new Set([...propios, ...vinc]);
  }

  /** Igual que el trigger validar_solicitud_tutoria (migración 0012). */
  private async validarSolicitud(antes: SolicitudTutoria | undefined, nueva: SolicitudTutoria, usuarioId: string): Promise<SolicitudTutoria> {
    const u = (await this.tabla("usuario").get(usuarioId)) as Usuario | undefined;
    if (!u) throw new Error("Sesión no válida");
    if (!antes && !(await this.misEstudiantes(usuarioId)).has(nueva.estudiante_id)) throw new Error("Solo puede pedir ayuda para usted o sus hijos.");
    const anios = (await this.tabla("anio_escolar").toArray()) as AnioEscolar[];
    const activo = anios.find((a) => a.activo && !a.eliminado)?.id;
    const mat = (await this.tabla("matricula").where("estudiante_id").equals(nueva.estudiante_id).toArray())
      .find((m) => !m.eliminado && m.estado === "matriculado" && m.anio_id === activo);
    const seccion = mat ? await this.tabla("seccion").get(mat.seccion_id) : undefined;
    const abiertas = (await this.tabla("solicitud_tutoria").where("solicitante_id").equals(nueva.solicitante_id).toArray())
      .filter((x) => x.id !== nueva.id && !x.eliminado && ABIERTAS.includes(x.estado)).length;
    return validarSolicitud({
      antes: antes ?? null, nueva, usuario: u, tutorDelEstudiante: seccion && !seccion.eliminado ? seccion.tutor_id : null,
      abiertasDelSolicitante: abiertas, ahora: new Date().toISOString(),
    });
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
    // Con el código escrito, la hora del código es la de la ventana en que coincidió.
    const ventana = await ventanaValida(token, secreto);
    const r = evaluarMarca({
      token: { ...token, ventana: ventana ?? token.ventana }, firmaOk: ventana !== null, sesionId: a.sesion_id, abiertaEnMs: sesion?.abierta_en ?? null,
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
    // En bloque por tabla: miles de filas de asistencia y notas se cargan en segundos.
    for (const t of TABLAS) {
      const lote = filas[t];
      if (!lote?.length) continue;
      if (this.reloj === 0) this.reloj = await this.leerMeta<number>("reloj", 0);
      const conHora = lote.map((f) => {
        this.reloj = Math.max(Date.now(), this.reloj + 1);
        return { ...f, updated_at: new Date(this.reloj).toISOString(), updated_by: null };
      });
      await this.tabla(t).bulkPut(conHora as never[]);
    }
    await this.guardarMeta("reloj", this.reloj);
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
    const id = this.usuarioId();
    const yo = id ? ((await this.servidor.tabla("usuario").get(id)) as Usuario | undefined) : undefined;
    for (const t of TABLAS) {
      let cambiadas = (await this.servidor.tabla(t).toArray()).filter(
        (f) => !cursor || (f.updated_at ?? "") > cursor,
      ) as Fila[];
      // Los pedidos de ayuda son privados (como la política leer de la migración 0012).
      if (t === "solicitud_tutoria") cambiadas = cambiadas.filter((f) => !!yo && puedeVer(f as SolicitudTutoria, yo));
      // El informe del tutor es interno: solo el personal lo recibe (política leer de la migración 0013).
      if (t === "informe_tutor" && !yo?.roles.some((r) => ["director", "subdirector", "docente", "tutor", "auxiliar"].includes(r))) cambiadas = [];
      if (cambiadas.length) filas[t] = cambiadas;
      for (const f of cambiadas) if ((f.updated_at ?? "") > max) max = f.updated_at!;
    }
    return { filas, cursor: max || new Date(0).toISOString(), hay_mas: false, hora: Date.now() };
  }
}
