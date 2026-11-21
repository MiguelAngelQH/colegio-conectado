// Cuentas de estudiantes y apoderados: desde la ficha (una por una) o para toda una sección,
// con un PDF de tarjetas para entregar las contraseñas temporales.
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CircleCheck, FileDown, GraduationCap, HeartHandshake, KeyRound, TriangleAlert, UserPlus } from "lucide-react";
import { db } from "@/app/contexto";
import { nombreCompleto } from "@/datos/consultas";
import { descargarCredenciales, type Credencial } from "@/datos/credenciales";
import { useCuentas, type NuevaCuenta } from "@/datos/cuentas";
import { vivas } from "@/db/repositorio";
import type { Apoderado, Estudiante } from "@/db/tipos";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Aviso, Boton, Dialogo, Gema, Tarjeta } from "@/ui/componentes";
import { DialogoCredencial } from "@/ui/credenciales";
import { Casilla } from "@/ui/formulario";

type Persona = { tabla: "estudiante"; fila: Estudiante; detalle: string } | { tabla: "apoderado"; fila: Apoderado; detalle: string };

const nuevaCuenta = (p: Persona): NuevaCuenta => ({
  nombres: p.fila.nombres, apellidos: p.fila.apellidos, dni: p.fila.dni!, email: null,
  roles: [p.tabla === "estudiante" ? "estudiante" : "apoderado"], vincular: { tabla: p.tabla, id: p.fila.id },
});

/** Una fila de la ficha del estudiante: crear la cuenta o restablecer su contraseña. */
function FilaAcceso({ persona }: { persona: Persona }) {
  const cuentas = useCuentas();
  const avisar = useAvisar();
  const [ocupado, setOcupado] = useState(false);
  const [clave, setClave] = useState<{ clave: string; titulo: string } | null>(null);
  const { fila, tabla } = persona;

  const accion = async () => {
    setOcupado(true);
    try {
      if (fila.usuario_id) setClave({ clave: await cuentas.restablecer(fila.usuario_id), titulo: "Contraseña restablecida" });
      else {
        const r = await cuentas.crear(nuevaCuenta(persona));
        if (r.claveTemporal) setClave({ clave: r.claveTemporal, titulo: "Cuenta creada" });
        else avisar(textoGuardado("Ya tenía cuenta en el colegio: quedó vinculada"));
      }
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Gema icono={tabla === "estudiante" ? GraduationCap : HeartHandshake} tono={tabla === "estudiante" ? "tono-musgo" : "tono-coral"} tam="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{nombreCompleto(fila)} <span className="font-normal text-tinta-suave">· {persona.detalle}</span></p>
        <p className="text-xs text-tinta-suave">
          {fila.usuario_id
            ? <span className="inline-flex items-center gap-1 text-emerald-800"><CircleCheck className="h-3.5 w-3.5" aria-hidden /> Tiene cuenta · ingresa con DNI {fila.dni}</span>
            : fila.dni ? "Sin cuenta todavía" : "Registre su DNI para crearle una cuenta"}
        </p>
      </div>
      <Boton variante="vidrio" icono={fila.usuario_id ? KeyRound : UserPlus} onClick={accion} cargando={ocupado} disabled={!fila.dni}>
        {fila.usuario_id ? "Restablecer" : "Crear cuenta"}
      </Boton>
      {clave && <DialogoCredencial titulo={clave.titulo} nombre={nombreCompleto(fila)} dni={fila.dni} clave={clave.clave} onCerrar={() => setClave(null)} />}
    </div>
  );
}

/** Sección "Acceso a la app" de la ficha del estudiante. */
export function AccesoFicha({ estudiante, apoderados }: { estudiante: Estudiante; apoderados: { a: Apoderado | undefined; parentesco: string }[] }) {
  return (
    <section className="aparecer space-y-2">
      <h2 className="etiqueta px-1">Acceso a la app</h2>
      <Tarjeta className="divide-y divide-white/70">
        <FilaAcceso persona={{ tabla: "estudiante", fila: estudiante, detalle: "Estudiante" }} />
        {apoderados.filter((x): x is { a: Apoderado; parentesco: string } => !!x.a).map(({ a, parentesco }) => (
          <FilaAcceso key={a.id} persona={{ tabla: "apoderado", fila: a, detalle: parentesco }} />
        ))}
      </Tarjeta>
      <p className="px-2 text-xs text-tinta-suave">Cada persona ingresa con su DNI y una contraseña temporal que debe cambiar la primera vez. Necesita conexión a internet.</p>
    </section>
  );
}

/** Crear de una vez las cuentas que faltan en una sección y descargar las tarjetas en PDF. */
export function DialogoCuentasSeccion({ seccionId, seccionNombre, colegio, onCerrar }: { seccionId: string; seccionNombre: string; colegio: string; onCerrar(): void }) {
  const cuentas = useCuentas();
  const [conEstudiantes, setConEstudiantes] = useState(true);
  const [conApoderados, setConApoderados] = useState(true);
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<{ credenciales: Credencial[]; vinculadas: number; errores: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const personas = useLiveQuery(async () => {
    const mats = vivas(await db.tabla("matricula").where("seccion_id").equals(seccionId).toArray()).filter((m) => m.estado === "matriculado");
    const ests = (await db.tabla("estudiante").bulkGet(mats.map((m) => m.estudiante_id))).filter((e): e is Estudiante => !!e && !e.eliminado);
    const vinculos = vivas(await db.tabla("estudiante_apoderado").toArray()).filter((v) => ests.some((e) => e.id === v.estudiante_id));
    const apos = new Map<string, Persona>();
    for (const v of vinculos) {
      const a = await db.tabla("apoderado").get(v.apoderado_id);
      const hijo = ests.find((e) => e.id === v.estudiante_id)!;
      if (a && !a.eliminado && !apos.has(a.id)) apos.set(a.id, { tabla: "apoderado", fila: a, detalle: `${v.parentesco} de ${hijo.nombres} ${hijo.apellidos}` });
    }
    const lista: Persona[] = [...ests.sort((a, b) => a.apellidos.localeCompare(b.apellidos)).map((e) => ({ tabla: "estudiante" as const, fila: e, detalle: `Estudiante de ${seccionNombre}` })), ...apos.values()];
    return lista;
  }, [seccionId]);

  if (!personas) return null;
  const elegibles = personas.filter((p) => (p.tabla === "estudiante" ? conEstudiantes : conApoderados));
  const pendientes = elegibles.filter((p) => !p.fila.usuario_id && p.fila.dni);
  const sinDni = elegibles.filter((p) => !p.fila.usuario_id && !p.fila.dni);
  const conCuenta = elegibles.filter((p) => p.fila.usuario_id);

  const crear = async () => {
    setError(null);
    setAvance({ hechas: 0, total: pendientes.length });
    try {
      const r = await cuentas.crearVarias(pendientes.map(nuevaCuenta), (hechas) => setAvance({ hechas, total: pendientes.length }));
      const credenciales: Credencial[] = [];
      const errores: string[] = [];
      let vinculadas = 0;
      r.forEach((x, i) => {
        const p = pendientes[i];
        if ("error" in x) errores.push(`${nombreCompleto(p.fila)}: ${x.error}`);
        else if (x.claveTemporal) credenciales.push({ nombre: nombreCompleto(p.fila), rol: p.tabla === "estudiante" ? "Estudiante" : "Apoderado(a)", detalle: p.detalle, dni: p.fila.dni!, clave: x.claveTemporal });
        else vinculadas++;
      });
      setResultado({ credenciales, vinculadas, errores });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAvance(null);
    }
  };

  const descargar = () => resultado && void descargarCredenciales({ colegio, titulo: `Cuentas ${seccionNombre}`, credenciales: resultado.credenciales, direccionWeb: window.location.origin });

  if (resultado) {
    return (
      <Dialogo abierto titulo="Cuentas creadas" onCerrar={onCerrar}
        acciones={<>
          <Boton variante="fantasma" onClick={onCerrar}>Cerrar</Boton>
          {resultado.credenciales.length > 0 && <Boton icono={FileDown} onClick={descargar}>Descargar tarjetas (PDF)</Boton>}
        </>}>
        <div className="space-y-3 pt-1">
          <p><strong className="text-tinta">{resultado.credenciales.length}</strong> cuentas nuevas
            {resultado.vinculadas > 0 && <> y <strong className="text-tinta">{resultado.vinculadas}</strong> vinculadas a una cuenta que ya existía</>}.</p>
          <Aviso tipo="alerta" icono={KeyRound}>
            Descargue e imprima las tarjetas ahora: las contraseñas temporales no se vuelven a mostrar. Si se pierde alguna, puede restablecerla desde la ficha del estudiante.
          </Aviso>
          {resultado.errores.length > 0 && (
            <Aviso tipo="error" icono={TriangleAlert} titulo={`${resultado.errores.length} no se pudieron crear`}>
              <ul className="list-disc pl-4">{resultado.errores.map((e) => <li key={e}>{e}</li>)}</ul>
            </Aviso>
          )}
        </div>
      </Dialogo>
    );
  }

  return (
    <Dialogo abierto titulo={`Cuentas de ${seccionNombre}`} onCerrar={onCerrar}
      acciones={<>
        <Boton variante="fantasma" onClick={onCerrar} disabled={!!avance}>Cancelar</Boton>
        <Boton icono={UserPlus} onClick={crear} cargando={!!avance} disabled={!pendientes.length}>
          {avance ? `Creando ${avance.hechas} de ${avance.total}...` : `Crear ${pendientes.length} cuenta${pendientes.length === 1 ? "" : "s"}`}
        </Boton>
      </>}>
      <div className="space-y-3 pt-2 text-tinta">
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="grid gap-2 sm:grid-cols-2">
          <Casilla marcada={conEstudiantes} onCambio={setConEstudiantes}>Estudiantes</Casilla>
          <Casilla marcada={conApoderados} onCambio={setConApoderados}>Padres y apoderados</Casilla>
        </div>
        <ul className="space-y-1 text-sm">
          <li><strong>{pendientes.length}</strong> sin cuenta, con DNI: se les crea ahora.</li>
          <li><strong>{conCuenta.length}</strong> ya tienen cuenta.</li>
          {sinDni.length > 0 && <li className="text-amber-800"><strong>{sinDni.length}</strong> sin DNI registrado: complete su DNI en la ficha para crearles cuenta.</li>}
        </ul>
        <p className="text-xs text-tinta-suave">Al terminar podrá descargar un PDF con una tarjeta por persona (usuario y contraseña temporal) para imprimir y entregar. Necesita conexión a internet.</p>
      </div>
    </Dialogo>
  );
}
