import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Estudiante, Usuario } from "@/db/tipos";
import { AuthDemo } from "@/sync/auth-demo";
import { ErrorAcceso, MENSAJE_DESACTIVADA, MENSAJE_INCORRECTO } from "@/sync/autenticacion";
import { ServidorDemo } from "@/sync/transporte-demo";

const COL = "c1";
const usuario = (id: string, dni: string, roles: Usuario["roles"], extra: Partial<Usuario> = {}): Usuario =>
  ({ id, colegio_id: COL, nombres: id, apellidos: "Prueba", dni, email: null, roles, activo: true, ...extra });

let n = 0;
let servidor: ServidorDemo;
let auth: AuthDemo;

beforeEach(async () => {
  servidor = new ServidorDemo(`auth-${++n}`);
  await servidor.sembrar({
    usuario: [
      usuario("dir", "40000001", ["director"], { email: "director@colegio.pe" }),
      usuario("doc", "40000002", ["docente"]),
      usuario("ugel", "40000003", ["ugel"]),
    ],
    estudiante: [{ id: "est1", colegio_id: COL, usuario_id: null, dni: "70000001", nombres: "Luis", apellidos: "M", fecha_nacimiento: null, sexo: "M", codigo_carne: "C1" } as Estudiante],
  });
  auth = new AuthDemo(servidor);
  await auth.sembrar([{ usuarioId: "dir", clave: "Director2026" }, { usuarioId: "doc", clave: "Docente2026" }]);
});

describe("ingreso en el demo", () => {
  it("entra con DNI o con correo y la contraseña correcta", async () => {
    expect(await auth.ingresar("40000001", "Director2026")).toEqual({ usuarioId: "dir", debeCambiarClave: false });
    expect(await auth.ingresar("Director@Colegio.pe", "Director2026")).toMatchObject({ usuarioId: "dir" });
  });

  it("con clave incorrecta o DNI inexistente responde siempre el mismo mensaje", async () => {
    await expect(auth.ingresar("40000001", "otra")).rejects.toThrow(MENSAJE_INCORRECTO);
    await expect(auth.ingresar("49999999", "Director2026")).rejects.toThrow(MENSAJE_INCORRECTO);
    // La cuenta UGEL no tiene contraseña en este equipo: tampoco revela que existe.
    await expect(auth.ingresar("40000003", "x")).rejects.toThrow(MENSAJE_INCORRECTO);
  });

  it("una cuenta desactivada no puede entrar y su sesión deja de ser vigente", async () => {
    expect(await auth.sesionVigente("doc")).toBe(true);
    await auth.cambiarEstado("doc", false, "dir");
    await expect(auth.ingresar("40000002", "Docente2026")).rejects.toThrow(MENSAJE_DESACTIVADA);
    expect(await auth.sesionVigente("doc")).toBe(false);
  });
});

describe("cuentas creadas por la dirección", () => {
  it("la cuenta nueva entra con la clave temporal y debe cambiarla", async () => {
    const r = await auth.crearCuenta({ nombres: "Ana", apellidos: "Paz", dni: "41111111", email: null, roles: ["docente"] }, "dir");
    expect(r.existente).toBe(false);
    expect(r.claveTemporal).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(await auth.ingresar("41111111", r.claveTemporal!)).toEqual({ usuarioId: r.id, debeCambiarClave: true });

    await expect(auth.cambiarClave(r.id, r.claveTemporal!)).rejects.toThrow(/distinta/);
    await auth.cambiarClave(r.id, "MiClave2026");
    expect(await auth.ingresar("41111111", "MiClave2026")).toEqual({ usuarioId: r.id, debeCambiarClave: false });
    await expect(auth.ingresar("41111111", r.claveTemporal!)).rejects.toThrow(MENSAJE_INCORRECTO);
  });

  it("vincula la cuenta al estudiante y no permite una segunda cuenta para él", async () => {
    const r = await auth.crearCuenta({ nombres: "Luis", apellidos: "M", dni: "70000001", email: null, roles: ["estudiante"], vincular: { tabla: "estudiante", id: "est1" } }, "dir");
    expect((await servidor.tabla("estudiante").get("est1"))?.usuario_id).toBe(r.id);
    await expect(auth.crearCuenta({ nombres: "X", apellidos: "Y", dni: "70000009", email: null, roles: ["estudiante"], vincular: { tabla: "estudiante", id: "est1" } }, "dir"))
      .rejects.toThrow(/ya tiene una cuenta/);
  });

  it("si el DNI ya tiene cuenta le agrega el rol, sin otra contraseña", async () => {
    const r = await auth.crearCuenta({ nombres: "doc", apellidos: "Prueba", dni: "40000002", email: null, roles: ["apoderado"] }, "dir");
    expect(r).toEqual({ id: "doc", claveTemporal: null, existente: true });
    expect((await servidor.tabla("usuario").get("doc"))?.roles).toEqual(["docente", "apoderado"]);
  });

  it("restablece la contraseña: la anterior deja de servir", async () => {
    const nueva = await auth.restablecerClave("doc", "dir");
    await expect(auth.ingresar("40000002", "Docente2026")).rejects.toThrow(MENSAJE_INCORRECTO);
    expect(await auth.ingresar("40000002", nueva)).toEqual({ usuarioId: "doc", debeCambiarClave: true });
  });

  it("solo la dirección administra cuentas, nunca la de la UGEL ni la propia desactivación", async () => {
    await expect(auth.crearCuenta({ nombres: "A", apellidos: "B", dni: "42222222", email: null, roles: ["docente"] }, "doc")).rejects.toBeInstanceOf(ErrorAcceso);
    await expect(auth.restablecerClave("ugel", "dir")).rejects.toThrow(/UGEL/);
    await expect(auth.cambiarEstado("dir", false, "dir")).rejects.toThrow(/propia/);
    await expect(auth.crearCuenta({ nombres: "A", apellidos: "B", dni: "123", email: null, roles: ["docente"] }, "dir")).rejects.toThrow(/8 dígitos/);
    await expect(auth.crearCuenta({ nombres: "A", apellidos: "B", dni: "43333333", email: "DIRECTOR@colegio.pe", roles: ["docente"] }, "dir")).rejects.toThrow(/correo/);
  });
});
