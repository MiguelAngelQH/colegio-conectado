// Cuentas del modo demo: las contraseñas se guardan (con sal y SHA-256) en el servidor de demostración,
// fuera de las tablas que se sincronizan. Mismas reglas que las Edge Functions de Supabase.
import { generarClaveTemporal, leerIdentificador } from "@/dominio/acceso";
import type { Usuario } from "@/db/tipos";
import type { Autenticacion, NuevaCuenta, ResultadoCuenta } from "./autenticacion";
import { ErrorAcceso, MENSAJE_DESACTIVADA, MENSAJE_IDENTIFICADOR, MENSAJE_INCORRECTO } from "./autenticacion";
import type { ServidorDemo } from "./transporte-demo";

interface Credencial { sal: string; hash: string; debeCambiar: boolean }
type Credenciales = Record<string, Credencial>;

const CLAVE_META = "credenciales";

async function sha256(texto: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
}

async function credencial(clave: string, debeCambiar: boolean): Promise<Credencial> {
  const sal = Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => x.toString(16).padStart(2, "0")).join("");
  return { sal, hash: await sha256(`${sal}:${clave}`), debeCambiar };
}

export class AuthDemo implements Autenticacion {
  constructor(private servidor: ServidorDemo) {}

  private leer() {
    return this.servidor.leerMeta<Credenciales>(CLAVE_META, {});
  }

  private async guardar(id: string, c: Credencial) {
    const todas = await this.leer();
    await this.servidor.guardarMeta(CLAVE_META, { ...todas, [id]: c });
  }

  private async usuarios() {
    return (await this.servidor.tabla("usuario").toArray()).filter((u) => !u.eliminado);
  }

  /** Cuentas de prueba con contraseña conocida (sin cambio obligatorio). */
  async sembrar(cuentas: { usuarioId: string; clave: string }[]) {
    const todas: Credenciales = {};
    for (const c of cuentas) todas[c.usuarioId] = await credencial(c.clave, false);
    await this.servidor.guardarMeta(CLAVE_META, todas);
  }

  async ingresar(identificador: string, clave: string) {
    const id = leerIdentificador(identificador);
    if (!id) throw new ErrorAcceso(MENSAJE_IDENTIFICADOR);
    const u = (await this.usuarios()).find((x) => (id.tipo === "dni" ? x.dni === id.dni : x.email?.toLowerCase() === id.correo));
    const cred = u ? (await this.leer())[u.id] : undefined;
    if (!u || !cred || (await sha256(`${cred.sal}:${clave}`)) !== cred.hash) throw new ErrorAcceso(MENSAJE_INCORRECTO);
    if (!u.activo) throw new ErrorAcceso(MENSAJE_DESACTIVADA);
    return { usuarioId: u.id, debeCambiarClave: cred.debeCambiar };
  }

  async cambiarClave(usuarioId: string, nueva: string) {
    const actual = (await this.leer())[usuarioId];
    if (actual && (await sha256(`${actual.sal}:${nueva}`)) === actual.hash) throw new ErrorAcceso("La contraseña nueva debe ser distinta de la anterior.");
    await this.guardar(usuarioId, await credencial(nueva, false));
  }

  async sesionVigente(usuarioId: string) {
    const u = await this.servidor.tabla("usuario").get(usuarioId);
    return !!u && !u.eliminado && u.activo && !!(await this.leer())[usuarioId];
  }

  async salir() {}

  /** Igual que direccionQueLlama() en las Edge Functions. */
  private async direccion(porUsuarioId: string): Promise<Usuario> {
    const u = await this.servidor.tabla("usuario").get(porUsuarioId);
    if (!u || u.eliminado || !u.activo || !u.roles.some((r) => r === "director" || r === "subdirector")) {
      throw new ErrorAcceso("Solo la dirección puede administrar cuentas.");
    }
    return u;
  }

  async crearCuenta(d: NuevaCuenta, porUsuarioId: string): Promise<ResultadoCuenta> {
    const dir = await this.direccion(porUsuarioId);
    if (!/^\d{8}$/.test(d.dni)) throw new ErrorAcceso("El DNI debe tener 8 dígitos.");
    const email = d.email?.trim().toLowerCase() || null;
    if (d.vincular) {
      const fila = await this.servidor.tabla(d.vincular.tabla).get(d.vincular.id);
      if (!fila || fila.colegio_id !== dir.colegio_id) throw new ErrorAcceso("No se encontró a la persona en este colegio.");
      if (fila.usuario_id) throw new ErrorAcceso("Esta persona ya tiene una cuenta.");
    }
    const vincular = async (usuarioId: string) => {
      if (d.vincular) await this.servidor.aplicar(d.vincular.tabla, { id: d.vincular.id, usuario_id: usuarioId }, porUsuarioId, false);
    };

    const todos = await this.usuarios();
    const existente = todos.find((u) => u.dni === d.dni);
    if (existente) {
      if (existente.colegio_id !== dir.colegio_id) throw new ErrorAcceso("Ese DNI ya tiene una cuenta en otro colegio.");
      await this.servidor.aplicar("usuario", { id: existente.id, roles: [...new Set([...existente.roles, ...d.roles])], email: existente.email ?? email }, porUsuarioId, false);
      await vincular(existente.id);
      // Una persona registrada antes sin cuenta de ingreso recibe aquí su contraseña.
      if (!(await this.leer())[existente.id]) {
        const clave = generarClaveTemporal();
        await this.guardar(existente.id, await credencial(clave, true));
        return { id: existente.id, claveTemporal: clave, existente: true };
      }
      return { id: existente.id, claveTemporal: null, existente: true };
    }
    if (email && todos.some((u) => u.email?.toLowerCase() === email)) throw new ErrorAcceso("Ese correo ya está registrado en otra cuenta.");

    const id = crypto.randomUUID();
    await this.servidor.aplicar("usuario", { id, colegio_id: dir.colegio_id, nombres: d.nombres, apellidos: d.apellidos, dni: d.dni, email, roles: d.roles, activo: true }, porUsuarioId, false);
    await vincular(id);
    const clave = generarClaveTemporal();
    await this.guardar(id, await credencial(clave, true));
    return { id, claveTemporal: clave, existente: false };
  }

  private async cuentaDelColegio(usuarioId: string, porUsuarioId: string) {
    const dir = await this.direccion(porUsuarioId);
    const u = await this.servidor.tabla("usuario").get(usuarioId);
    if (!u || u.eliminado || u.colegio_id !== dir.colegio_id) throw new ErrorAcceso("No se encontró la cuenta en este colegio.");
    if (u.roles.includes("ugel")) throw new ErrorAcceso("La cuenta de la UGEL la administra la plataforma.");
    return u;
  }

  async restablecerClave(usuarioId: string, porUsuarioId: string) {
    await this.cuentaDelColegio(usuarioId, porUsuarioId);
    const clave = generarClaveTemporal();
    await this.guardar(usuarioId, await credencial(clave, true));
    return clave;
  }

  async cambiarEstado(usuarioId: string, activo: boolean, porUsuarioId: string) {
    await this.cuentaDelColegio(usuarioId, porUsuarioId);
    if (!activo && usuarioId === porUsuarioId) throw new ErrorAcceso("No puede desactivar su propia cuenta.");
    await this.servidor.aplicar("usuario", { id: usuarioId, activo }, porUsuarioId, false);
  }
}
