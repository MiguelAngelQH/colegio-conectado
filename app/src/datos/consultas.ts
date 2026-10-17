// Consultas locales reutilizables sobre la estructura del colegio.
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/app/contexto";
import { vivas } from "@/db/repositorio";
import type { AnioEscolar, Grado, Periodo, Seccion, Usuario } from "@/db/tipos";

export interface SeccionDetalle extends Seccion {
  grado: Grado | undefined;
  nombre: string;       // 2.º año "B"
  nombreLargo: string;  // 2.º año "B" - Secundaria
  tutor: Usuario | undefined;
  estudiantes: number;
}

export function nombreSeccion(g: Grado | undefined, s: Pick<Seccion, "letra">) {
  return g ? `${g.nombre} "${s.letra}"` : `Sección "${s.letra}"`;
}

export const NIVEL_TEXTO = { primaria: "Primaria", secundaria: "Secundaria" } as const;

export async function anioActivo(): Promise<AnioEscolar | undefined> {
  const anios = vivas(await db.tabla("anio_escolar").toArray());
  return anios.find((a) => a.activo) ?? anios.sort((a, b) => b.anio - a.anio)[0];
}

export async function seccionesDetalle(anioId: string): Promise<SeccionDetalle[]> {
  const [secciones, grados, usuarios, matriculas] = await Promise.all([
    db.tabla("seccion").where("anio_id").equals(anioId).toArray(),
    db.tabla("grado").toArray(),
    db.tabla("usuario").toArray(),
    db.tabla("matricula").toArray(),
  ]);
  const porGrado = new Map(grados.map((g) => [g.id, g]));
  const porUsuario = new Map(usuarios.map((u) => [u.id, u]));
  return vivas(secciones)
    .map((s) => {
      const g = porGrado.get(s.grado_id);
      return {
        ...s,
        grado: g,
        nombre: nombreSeccion(g, s),
        nombreLargo: `${nombreSeccion(g, s)} - ${g ? NIVEL_TEXTO[g.nivel] : ""}`,
        tutor: s.tutor_id ? porUsuario.get(s.tutor_id) : undefined,
        estudiantes: matriculas.filter((m) => m.seccion_id === s.id && !m.eliminado && m.estado === "matriculado").length,
      };
    })
    .sort((a, b) =>
      (a.grado?.nivel ?? "").localeCompare(b.grado?.nivel ?? "") ||
      (a.grado?.numero ?? 0) - (b.grado?.numero ?? 0) ||
      a.letra.localeCompare(b.letra));
}

/** Año activo, sus periodos, grados y secciones; se actualiza solo. */
export function useEstructura() {
  return useLiveQuery(async () => {
    const anio = await anioActivo();
    const periodos: Periodo[] = anio ? vivas(await db.tabla("periodo").where("anio_id").equals(anio.id).toArray()).sort((a, b) => a.numero - b.numero) : [];
    const grados = vivas(await db.tabla("grado").toArray()).sort((a, b) => a.nivel.localeCompare(b.nivel) || a.numero - b.numero);
    const secciones = anio ? await seccionesDetalle(anio.id) : [];
    return { anio, periodos, grados, secciones };
  });
}

export const PERSONAL = ["director", "subdirector", "docente", "tutor", "auxiliar"] as const;

export function usePersonal() {
  return useLiveQuery(async () =>
    vivas(await db.tabla("usuario").toArray())
      .filter((u) => u.roles.some((r) => (PERSONAL as readonly string[]).includes(r) || r === "ugel"))
      .sort((a, b) => a.apellidos.localeCompare(b.apellidos)),
  );
}

export const nombreCompleto = (p: { nombres: string; apellidos: string }) => `${p.apellidos}, ${p.nombres}`;

/** Estudiantes matriculados (activos) de una sección, por apellido. */
export async function estudiantesDeSeccion(seccionId: string) {
  const mats = vivas(await db.tabla("matricula").where("seccion_id").equals(seccionId).toArray()).filter((m) => m.estado === "matriculado");
  const ests = await db.tabla("estudiante").bulkGet(mats.map((m) => m.estudiante_id));
  return vivas(ests.filter((e): e is NonNullable<typeof e> => !!e)).sort((a, b) => a.apellidos.localeCompare(b.apellidos));
}

/** Secciones que el usuario puede ver en tutoría: las suyas como tutor, o todas para la dirección. */
export async function seccionesDeTutoria(usuario: Usuario) {
  const anio = await anioActivo();
  if (!anio) return [];
  const todas = await seccionesDetalle(anio.id);
  return usuario.roles.some((r) => r === "director" || r === "subdirector") ? todas : todas.filter((s) => s.tutor_id === usuario.id);
}
