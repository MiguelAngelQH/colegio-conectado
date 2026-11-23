import { describe, expect, it } from "vitest";
import {
  VENTANA_MS, crearTokenQr, evaluarMarca, firmaValida, leerCarne, leerTokenQr, nuevoSecreto, textoCarne,
} from "@/dominio/qr";

const SESION = "11111111-2222-4333-8444-555555555555";
const T0 = 1_792_000_000_000;

describe("token QR", () => {
  it("cambia cada 15 segundos y se puede verificar con el secreto", async () => {
    const s = nuevoSecreto();
    const a = await crearTokenQr(SESION, s, T0);
    const b = await crearTokenQr(SESION, s, T0 + VENTANA_MS);
    expect(a).not.toBe(b);
    const t = leerTokenQr(a)!;
    expect(t.sesionId).toBe(SESION);
    expect(await firmaValida(t, s)).toBe(true);
    expect(await firmaValida(t, nuevoSecreto())).toBe(false);
  });

  it("detecta códigos alterados o ajenos", async () => {
    const s = nuevoSecreto();
    const t = leerTokenQr(await crearTokenQr(SESION, s, T0))!;
    expect(await firmaValida({ ...t, ventana: t.ventana + 1 }, s)).toBe(false);
    expect(leerTokenQr("https://ejemplo.com")).toBeNull();
    expect(leerTokenQr(`CC1.${SESION}.12.corto`)).toBeNull();
  });

  it("lee carnés con y sin prefijo", () => {
    expect(leerCarne(textoCarne("71234567"))).toBe("71234567");
    expect(leerCarne("EAB12CD")).toBe("EAB12CD");
    expect(leerCarne("hola mundo")).toBeNull();
  });
});

describe("reglas de la marca", () => {
  const token = { sesionId: SESION, ventana: Math.floor(T0 / VENTANA_MS), firma: "x".repeat(22) };
  const base = {
    token, firmaOk: true, sesionId: SESION, abiertaEnMs: T0 - 60_000, marcadoEnMs: T0 + 5_000, matriculado: true,
    dispositivoHabitual: "eq1", dispositivo: "eq1", dispositivoUsadoPorOtro: false,
  };

  it("acepta una marca normal", () => {
    expect(evaluarMarca(base)).toEqual({ valida: true, porRevisar: false, motivo: null });
  });

  it("rechaza firma falsa, otra sesión, no matriculado o código vencido", () => {
    expect(evaluarMarca({ ...base, firmaOk: false })).toMatchObject({ valida: false, motivo: "Código QR no válido" });
    expect(evaluarMarca({ ...base, sesionId: "otra" }).valida).toBe(false);
    expect(evaluarMarca({ ...base, matriculado: false }).valida).toBe(false);
    expect(evaluarMarca({ ...base, abiertaEnMs: T0 - 6 * 3600_000 })).toMatchObject({ valida: false, motivo: "El código QR está vencido" });
  });

  it("deja por revisar la foto reenviada y el celular prestado", () => {
    expect(evaluarMarca({ ...base, marcadoEnMs: T0 + 10 * 60_000 })).toMatchObject({ porRevisar: true, motivo: "Escaneó el código fuera de tiempo" });
    expect(evaluarMarca({ ...base, dispositivoUsadoPorOtro: true })).toMatchObject({ porRevisar: true, motivo: "Este celular ya marcó por otro estudiante" });
    expect(evaluarMarca({ ...base, dispositivo: "eq2" })).toMatchObject({ porRevisar: true, motivo: "Usó un celular distinto al habitual" });
  });
});

describe("código de 6 dígitos", () => {
  it("se acepta el de la ventana actual o de hasta un minuto antes, y se lee con o sin espacio", async () => {
    const { codigoCorto, leerCodigoCorto, tokenDeCodigo, ventanaValida } = await import("@/dominio/qr");
    const s = nuevoSecreto();
    const sesion = "6b1f0c2e-1111-4222-8333-444455556666";
    const v = 120_000_000;
    const hace45s = await codigoCorto(sesion, s, v - 3);
    expect(hace45s).toMatch(/^\d{6}$/);
    expect(leerCodigoCorto(`${hace45s.slice(0, 3)} ${hace45s.slice(3)}`)).toBe(hace45s);
    expect(await ventanaValida(leerTokenQr(tokenDeCodigo(sesion, v, hace45s))!, s)).toBe(v - 3);
    const viejo = await codigoCorto(sesion, s, v - 6);
    if (viejo !== hace45s) expect(await ventanaValida(leerTokenQr(tokenDeCodigo(sesion, v, viejo))!, s)).toBeNull();
  });
});
