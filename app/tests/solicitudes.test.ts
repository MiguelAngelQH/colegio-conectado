import { describe, expect, it } from "vitest";
import type { SolicitudTutoria } from "@/db/tipos";
import { ordenarBandeja, puedeVer, validarSolicitud } from "@/dominio/solicitudes";

const AHORA = "2026-11-21T15:00:00.000Z";
const est = { id: "u-est", roles: ["estudiante" as const] };
const apo = { id: "u-apo", roles: ["apoderado" as const] };
const tutor = { id: "u-tutor", roles: ["docente" as const, "tutor" as const] };
const otroDocente = { id: "u-doc", roles: ["docente" as const] };
const director = { id: "u-dir", roles: ["director" as const] };

const pedido = (extra: Partial<SolicitudTutoria> = {}): SolicitudTutoria => ({
  id: "s1", colegio_id: "c", estudiante_id: "e1", solicitante_id: "u-est", tutor_id: null, motivo: "estudios",
  mensaje: "  No entiendo fracciones  ", modalidad: "presencial", estado: "enviada", cita: null, respuesta: null, entrevista_id: null,
  creada_en: "2026-11-21T14:00:00.000Z", ...extra,
});
const alta = (s: SolicitudTutoria, extra: Partial<Parameters<typeof validarSolicitud>[0]> = {}) =>
  validarSolicitud({ antes: null, nueva: s, usuario: est, tutorDelEstudiante: "u-tutor", abiertasDelSolicitante: 0, ahora: AHORA, ...extra });

describe("pedir ayuda al tutor", () => {
  it("el pedido va al tutor de la sección y empieza como enviado, aunque el equipo diga otra cosa", () => {
    const s = alta(pedido({ tutor_id: "u-doc", estado: "atendida", respuesta: "x" }));
    expect(s).toMatchObject({ tutor_id: "u-tutor", estado: "enviada", respuesta: null, mensaje: "No entiendo fracciones" });
    expect(s.creada_en).toBe("2026-11-21T14:00:00.000Z");
    // Una fecha en el futuro (reloj adelantado) se reemplaza por la hora del servidor.
    expect(alta(pedido({ creada_en: "2030-01-01T00:00:00.000Z" })).creada_en).toBe(AHORA);
  });

  it("rechaza pedidos sin tutor, vacíos, a nombre de otro o por encima del límite", () => {
    expect(() => alta(pedido(), { tutorDelEstudiante: null })).toThrow(/no tiene tutor/);
    expect(() => alta(pedido({ mensaje: "   " }))).toThrow(/Escribe/);
    expect(() => alta(pedido({ solicitante_id: "u-apo" }))).toThrow(/a su nombre/);
    expect(() => alta(pedido(), { abiertasDelSolicitante: 2 })).toThrow(/2 pedidos abiertos/);
  });

  it("el tutor responde y agenda; la cita necesita fecha", () => {
    const antes = alta(pedido());
    const upd = (cambio: Partial<SolicitudTutoria>, usuario = tutor) =>
      validarSolicitud({ antes, nueva: { ...antes, ...cambio }, usuario, tutorDelEstudiante: "u-tutor", abiertasDelSolicitante: 0, ahora: AHORA });
    expect(upd({ estado: "agendada", cita: "2026-11-24T10:00:00.000Z", respuesta: "Hablemos el lunes" }).estado).toBe("agendada");
    expect(() => upd({ estado: "agendada" })).toThrow(/fecha y hora/);
    expect(() => upd({ mensaje: "otro" })).toThrow(/no se puede modificar/);
    expect(() => upd({ respuesta: "hola" }, otroDocente)).toThrow(/No puede/);
  });

  it("quien pidió solo puede cancelar mientras está abierto", () => {
    const antes = alta(pedido());
    const upd = (cambio: Partial<SolicitudTutoria>, a = antes) =>
      validarSolicitud({ antes: a, nueva: { ...a, ...cambio }, usuario: est, tutorDelEstudiante: "u-tutor", abiertasDelSolicitante: 0, ahora: AHORA });
    expect(upd({ estado: "cancelada" }).estado).toBe("cancelada");
    expect(() => upd({ estado: "atendida" })).toThrow(/Solo puedes cancelar/);
    expect(() => upd({ estado: "cancelada" }, { ...antes, estado: "atendida" })).toThrow(/cerrado/);
    expect(() => upd({ eliminado: true })).toThrow(/no se borran/);
  });

  it("privacidad: solo quien pidió y el tutor; la dirección únicamente los casos de acoso", () => {
    const s = { ...alta(pedido()), tutor_id: "u-tutor" };
    expect(puedeVer(s, est)).toBe(true);
    expect(puedeVer(s, tutor)).toBe(true);
    expect(puedeVer(s, apo)).toBe(false); // la familia no ve lo que el estudiante pidió
    expect(puedeVer(s, director)).toBe(false);
    expect(puedeVer({ ...s, motivo: "companeros" }, director)).toBe(true);
    expect(puedeVer({ ...s, motivo: "companeros" }, otroDocente)).toBe(false);
  });

  it("la bandeja muestra primero lo nuevo (acoso arriba), luego citas por fecha y al final lo cerrado", () => {
    const l = ordenarBandeja([
      pedido({ id: "cerrado", estado: "atendida" }),
      pedido({ id: "cita-tarde", estado: "agendada", cita: "2026-11-25T10:00:00Z" }),
      pedido({ id: "nuevo" }),
      pedido({ id: "cita-pronto", estado: "agendada", cita: "2026-11-23T10:00:00Z" }),
      pedido({ id: "acoso", motivo: "companeros" }),
    ]);
    expect(l.map((s) => s.id)).toEqual(["acoso", "nuevo", "cita-pronto", "cita-tarde", "cerrado"]);
  });
});
