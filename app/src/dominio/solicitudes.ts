// Pedidos de ayuda al tutor. El estudiante (o su apoderado) pide conversar; el tutor responde,
// agenda una cita y, al atender, registra la entrevista. Funciones puras: las usan las pantallas,
// el servidor de demostración y las pruebas (el servidor real aplica lo mismo en la migración 0012).
import type { Rol, SolicitudTutoria } from "@/db/tipos";

export type MotivoSolicitud = SolicitudTutoria["motivo"];
export type EstadoSolicitud = SolicitudTutoria["estado"];

/** Motivos en palabras del estudiante y del apoderado. */
export const MOTIVOS: Record<MotivoSolicitud, { estudiante: string; apoderado: string }> = {
  estudios: { estudiante: "Mis estudios o notas", apoderado: "Estudios o notas de mi hijo(a)" },
  personal: { estudiante: "Algo personal o cómo me siento", apoderado: "Cómo se siente mi hijo(a)" },
  companeros: { estudiante: "Problemas con compañeros o acoso", apoderado: "Problemas con compañeros o acoso" },
  familia: { estudiante: "Algo de mi familia o mi casa", apoderado: "Situación familiar" },
  vocacional: { estudiante: "Qué estudiar o a qué dedicarme", apoderado: "Orientación vocacional" },
  otro: { estudiante: "Otro tema", apoderado: "Otro tema" },
};

export const ESTADOS: Record<EstadoSolicitud, string> = {
  enviada: "Enviado", vista: "Visto por el tutor", agendada: "Cita agendada", atendida: "Atendido", cancelada: "Cancelado",
};

/** Pedidos abiertos que puede tener una persona a la vez (evita abusos y saturar al tutor). */
export const LIMITE_ABIERTAS = 2;

export const ABIERTAS: EstadoSolicitud[] = ["enviada", "vista", "agendada"];

/** Acoso o violencia entre estudiantes: además del tutor la ve la dirección (protocolo de convivencia y SíseVe). */
export const esSensible = (m: MotivoSolicitud) => m === "companeros";

const esGestion = (roles: Rol[]) => roles.some((r) => r === "director" || r === "subdirector");

/** Quién ve un pedido: quien lo hizo, el tutor y, si es sensible, la dirección. Los demás no (ni la familia del estudiante). */
export function puedeVer(s: SolicitudTutoria, u: { id: string; roles: Rol[] }): boolean {
  if (s.eliminado) return false;
  return s.solicitante_id === u.id || s.tutor_id === u.id || (esSensible(s.motivo) && esGestion(u.roles));
}

/** ¿Puede atender (responder, agendar, cerrar)? El tutor, o la dirección en los sensibles. */
export function puedeAtender(s: SolicitudTutoria, u: { id: string; roles: Rol[] }): boolean {
  return s.tutor_id === u.id || (esSensible(s.motivo) && esGestion(u.roles));
}

/** Orden de la bandeja del tutor: primero lo que espera respuesta (sensibles arriba), luego citas, luego lo cerrado. */
export function ordenarBandeja(lista: SolicitudTutoria[]): SolicitudTutoria[] {
  const peso = (s: SolicitudTutoria) =>
    s.estado === "enviada" ? (esSensible(s.motivo) ? 0 : 1) : s.estado === "vista" ? 2 : s.estado === "agendada" ? 3 : 4;
  return [...lista].sort((a, b) => peso(a) - peso(b) || (peso(a) === 3 ? (a.cita ?? "").localeCompare(b.cita ?? "") : b.creada_en.localeCompare(a.creada_en)));
}

/**
 * Valida un cambio (alta o edición) igual que el trigger validar_solicitud_tutoria. Devuelve la fila
 * normalizada o lanza un error con el mensaje para la persona.
 */
export function validarSolicitud(p: {
  antes: SolicitudTutoria | null;
  nueva: SolicitudTutoria;
  usuario: { id: string; roles: Rol[] };
  /** Tutor de la sección del estudiante este año (null si la sección no tiene tutor). */
  tutorDelEstudiante: string | null;
  /** Pedidos abiertos que ya tiene el solicitante (sin contar este). */
  abiertasDelSolicitante: number;
  ahora: string;
}): SolicitudTutoria {
  const { antes, nueva: s, usuario: u } = p;
  if (!antes) {
    if (s.solicitante_id !== u.id) throw new Error("Solo puede enviar pedidos a su nombre.");
    if (!p.tutorDelEstudiante) throw new Error("Tu sección aún no tiene tutor asignado. Comunícate con la dirección.");
    if (!s.mensaje?.trim()) throw new Error("Escribe brevemente en qué necesitas ayuda.");
    if (s.mensaje.length > 1000) throw new Error("El mensaje es demasiado largo (máximo 1000 caracteres).");
    if (p.abiertasDelSolicitante >= LIMITE_ABIERTAS) {
      throw new Error(`Ya tienes ${LIMITE_ABIERTAS} pedidos abiertos. Espera a que tu tutor los atienda o cancela uno.`);
    }
    return {
      ...s, mensaje: s.mensaje.trim(), tutor_id: p.tutorDelEstudiante, estado: "enviada", cita: null, respuesta: null, entrevista_id: null,
      creada_en: s.creada_en && s.creada_en < p.ahora ? s.creada_en : p.ahora,
    };
  }
  const fijos = ["estudiante_id", "solicitante_id", "tutor_id", "motivo", "mensaje", "modalidad", "creada_en"] as const;
  if (fijos.some((k) => s[k] !== antes[k])) throw new Error("El pedido ya enviado no se puede modificar.");
  if (!!s.eliminado !== !!antes.eliminado) throw new Error("Los pedidos no se borran: se cancelan o se atienden.");
  if (antes.estado === "atendida" || antes.estado === "cancelada") {
    if (s.estado !== antes.estado || s.cita !== antes.cita || s.respuesta !== antes.respuesta || s.entrevista_id !== antes.entrevista_id) {
      throw new Error("El pedido ya está cerrado.");
    }
    return s;
  }
  if (puedeAtender(antes, u)) {
    if (s.estado === "enviada" && antes.estado !== "enviada") throw new Error("Estado no válido.");
    if (s.estado === "agendada" && !s.cita) throw new Error("Indique la fecha y hora de la cita.");
    return s;
  }
  if (antes.solicitante_id === u.id) {
    if (s.estado !== "cancelada" || s.cita !== antes.cita || s.respuesta !== antes.respuesta || s.entrevista_id !== antes.entrevista_id) {
      throw new Error("Solo puedes cancelar tu pedido; el tutor es quien responde.");
    }
    return s;
  }
  throw new Error("No puede modificar este pedido.");
}
