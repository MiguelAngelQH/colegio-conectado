import { describe, expect, it } from "vitest";
import { correoDeAcceso, generarClaveTemporal, leerIdentificador, validarClaveNueva } from "@/dominio/acceso";

describe("identificador de ingreso", () => {
  it("reconoce un DNI aunque tenga espacios o puntos", () => {
    expect(leerIdentificador("45 678 912")).toEqual({ tipo: "dni", dni: "45678912" });
    expect(leerIdentificador("4567891")).toEqual({ tipo: "dni", dni: "04567891" });
  });

  it("reconoce un correo y lo pasa a minúsculas", () => {
    expect(leerIdentificador("  Director@Colegio.EDU.pe ")).toEqual({ tipo: "correo", correo: "director@colegio.edu.pe" });
  });

  it("rechaza lo que no es DNI ni correo", () => {
    expect(leerIdentificador("123")).toBeNull();
    expect(leerIdentificador("juan")).toBeNull();
    expect(leerIdentificador("juan@")).toBeNull();
    expect(leerIdentificador("")).toBeNull();
  });

  it("deriva el correo interno de la cuenta a partir del DNI", () => {
    expect(correoDeAcceso("45678912")).toBe("45678912@dni.colegio.invalid");
  });
});

describe("contraseñas", () => {
  it("exige largo mínimo, letras y números", () => {
    expect(validarClaveNueva("abc12")).toMatch(/8 caracteres/);
    expect(validarClaveNueva("solamenteletras")).toMatch(/letras y números/);
    expect(validarClaveNueva("12345678901")).toMatch(/letras y números/);
    expect(validarClaveNueva("Arequipa2026")).toBeNull();
  });

  it("no acepta el DNI, la contraseña anterior ni secuencias obvias", () => {
    expect(validarClaveNueva("clave45678912", { dni: "45678912" })).toMatch(/DNI/);
    expect(validarClaveNueva("Temporal9x", { anterior: "Temporal9x" })).toMatch(/distinta/);
    expect(validarClaveNueva("abcdefgh1")).toMatch(/predecible/);
  });

  it("genera claves temporales de 10 caracteres con letras y números, sin caracteres confusos", () => {
    for (let i = 0; i < 50; i++) {
      const c = generarClaveTemporal();
      expect(c).toMatch(/^[A-HJ-NP-Za-km-z2-9]{10}$/);
      expect(c).toMatch(/\d/);
      expect(c).toMatch(/[a-zA-Z]/);
    }
  });
});
