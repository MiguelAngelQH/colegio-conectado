// Decide qué escribir al importar una nómina: crear estudiantes nuevos, actualizar los que ya
// existen (por DNI) y matricularlos en su sección. Es una función pura para poder probarla.
import { nuevoId } from "@/db/local";
import type { Escritura } from "@/db/repositorio";
import type { Estudiante, Grado, Matricula, Seccion } from "@/db/tipos";
import type { FilaImportada } from "./importar";
import { normalizar } from "./texto";

export type Destino =
  | { tipo: "seccion"; seccionId: string }
  | { tipo: "columnas"; nivel: Grado["nivel"] };

export interface ResultadoPlan {
  escrituras: Escritura[];
  nuevos: number;
  actualizados: number;
  matriculados: number;
  yaMatriculados: number;
  omitidas: { fila: number; motivo: string }[];
}

const ORDINALES: Record<string, number> = {
  primero: 1, primer: 1, segundo: 2, tercero: 3, tercer: 3, cuarto: 4, quinto: 5, sexto: 6,
};

/** "2", "2°", "2do", "SEGUNDO", "2.º grado" -> 2 */
export function numeroGrado(v: string): number | null {
  const s = normalizar(v);
  const n = s.match(/\d+/);
  if (n) return +n[0];
  for (const [k, num] of Object.entries(ORDINALES)) if (s.startsWith(k)) return num;
  return null;
}

export function codigoCarne(existentes: Set<string>, preferido?: string | null): string {
  if (preferido && !existentes.has(preferido)) return preferido;
  for (;;) {
    const c = `E${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    if (!existentes.has(c)) return c;
  }
}

export function planificarImportacion(params: {
  filas: FilaImportada[];
  destino: Destino;
  anioId: string;
  secciones: Seccion[];
  grados: Grado[];
  estudiantes: Estudiante[];
  matriculas: Matricula[];
  actualizarExistentes: boolean;
}): ResultadoPlan {
  const { filas, destino, anioId, secciones, grados, estudiantes, matriculas, actualizarExistentes } = params;
  const r: ResultadoPlan = { escrituras: [], nuevos: 0, actualizados: 0, matriculados: 0, yaMatriculados: 0, omitidas: [] };
  const porDni = new Map(estudiantes.filter((e) => e.dni && !e.eliminado).map((e) => [e.dni!, e]));
  const carnes = new Set(estudiantes.map((e) => e.codigo_carne));
  const matriculaDe = new Map(
    matriculas.filter((m) => m.anio_id === anioId && !m.eliminado).map((m) => [m.estudiante_id, m]),
  );
  const gradoPorId = new Map(grados.map((g) => [g.id, g]));

  const buscarSeccion = (f: FilaImportada): Seccion | string => {
    if (destino.tipo === "seccion") return secciones.find((s) => s.id === destino.seccionId) ?? "La sección elegida no existe";
    if (!f.grado || !f.seccion) return "Falta grado o sección en el archivo";
    const num = numeroGrado(f.grado);
    const letra = normalizar(f.seccion).replace(/[^a-z]/g, "").toUpperCase();
    const s = secciones.find((x) => {
      const g = gradoPorId.get(x.grado_id);
      return !x.eliminado && x.anio_id === anioId && g?.nivel === destino.nivel && g.numero === num && x.letra.toUpperCase() === letra;
    });
    return s ?? `No existe la sección ${f.grado} "${f.seccion}" en ${destino.nivel}`;
  };

  for (const f of filas) {
    if (f.errores.length) {
      r.omitidas.push({ fila: f.fila, motivo: f.errores.join("; ") });
      continue;
    }
    const seccion = buscarSeccion(f);
    if (typeof seccion === "string") {
      r.omitidas.push({ fila: f.fila, motivo: seccion });
      continue;
    }

    const existente = f.dni ? porDni.get(f.dni) : undefined;
    let estudianteId: string;
    if (existente) {
      estudianteId = existente.id;
      if (actualizarExistentes) {
        r.escrituras.push({
          tabla: "estudiante",
          datos: {
            id: existente.id, nombres: f.nombres, apellidos: f.apellidos,
            ...(f.sexo ? { sexo: f.sexo } : {}), ...(f.fecha_nacimiento ? { fecha_nacimiento: f.fecha_nacimiento } : {}),
          },
        });
        r.actualizados++;
      }
    } else {
      estudianteId = nuevoId();
      const codigo = codigoCarne(carnes, f.codigo ?? f.dni);
      carnes.add(codigo);
      r.escrituras.push({
        tabla: "estudiante",
        datos: {
          id: estudianteId, usuario_id: null, dni: f.dni, nombres: f.nombres, apellidos: f.apellidos,
          sexo: f.sexo, fecha_nacimiento: f.fecha_nacimiento, codigo_carne: codigo,
        },
      });
      if (f.dni) porDni.set(f.dni, { id: estudianteId } as Estudiante);
      r.nuevos++;
    }

    const actual = matriculaDe.get(estudianteId);
    if (actual) {
      if (actual.seccion_id === seccion.id) {
        r.yaMatriculados++;
      } else {
        r.omitidas.push({ fila: f.fila, motivo: "Ya está matriculado en otra sección este año (cámbielo desde su ficha)" });
      }
      continue;
    }
    const m: Partial<Matricula> = { id: nuevoId(), anio_id: anioId, seccion_id: seccion.id, estudiante_id: estudianteId, estado: "matriculado" };
    r.escrituras.push({ tabla: "matricula", datos: m });
    matriculaDe.set(estudianteId, m as Matricula);
    r.matriculados++;
  }
  return r;
}
