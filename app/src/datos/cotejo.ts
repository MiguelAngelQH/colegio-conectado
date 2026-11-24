// Listas de cotejo por sesión y su paso al registro de notas (como las hojas S.. y C1..C4 del
// registro auxiliar del colegio: cada capacidad se consolida con las sesiones del bimestre).
import { db } from "@/app/contexto";
import { nuevoId } from "@/db/local";
import { guardar, vivas } from "@/db/repositorio";
import type { ListaCotejo, NivelLogro } from "@/db/tipos";
import { logroDeCapacidades, logroPromedio } from "@/dominio/capacidades";
import { guardarNota } from "./notas";

export async function listasDelCurso(seccionId: string, areaId: string, periodoId: string) {
  return vivas(await db.tabla("lista_cotejo").where("[seccion_id+area_id+periodo_id]").equals([seccionId, areaId, periodoId]).toArray())
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.numero ?? 0) - (b.numero ?? 0));
}

export async function guardarLista(lista: Partial<ListaCotejo> & Pick<ListaCotejo, "seccion_id" | "area_id" | "periodo_id" | "docente_id" | "titulo" | "fecha" | "criterios">, colegioId: string | null) {
  const id = lista.id ?? nuevoId();
  await guardar(db, "lista_cotejo", { notas: {}, numero: null, experiencia: null, evidencia: null, ...lista, id }, colegioId);
  return id;
}

// Los clics seguidos se guardan en orden (cada uno parte de lo que dejó el anterior).
let cola: Promise<unknown> = Promise.resolve();

/** Pone (o quita, si se repite) el nivel de un estudiante en un criterio. */
export function marcarCriterio(listaId: string, estudianteId: string, criterio: number, nivel: NivelLogro, colegioId: string | null) {
  const tarea = cola.then(async () => {
    const l = await db.tabla("lista_cotejo").get(listaId);
    if (!l) return;
    const notas = { ...l.notas, [estudianteId]: { ...(l.notas[estudianteId] ?? {}) } };
    const clave = String(criterio);
    if (notas[estudianteId][clave] === nivel) delete notas[estudianteId][clave];
    else notas[estudianteId][clave] = nivel;
    await guardar(db, "lista_cotejo", { id: listaId, notas }, colegioId);
  });
  cola = tarea.catch(() => undefined);
  return tarea;
}

/** Promedio de los criterios de cada capacidad: "estudiante|competencia" -> {capacidad: nivel}. */
export function consolidar(listas: Pick<ListaCotejo, "criterios" | "notas">[]) {
  const acumulado = new Map<string, Map<number, NivelLogro[]>>();
  for (const l of listas) {
    l.criterios.forEach((c, i) => {
      if (!c.capacidad) return;
      for (const [est, notas] of Object.entries(l.notas)) {
        const n = notas[String(i)];
        if (!n) continue;
        const k = `${est}|${c.competencia_id}`;
        if (!acumulado.has(k)) acumulado.set(k, new Map());
        const porCap = acumulado.get(k)!;
        porCap.set(c.capacidad, [...(porCap.get(c.capacidad) ?? []), n]);
      }
    });
  }
  const res = new Map<string, Record<string, NivelLogro>>();
  for (const [k, porCap] of acumulado) {
    const caps: Record<string, NivelLogro> = {};
    for (const [cap, niveles] of porCap) {
      const v = logroPromedio(niveles);
      if (v) caps[String(cap)] = v;
    }
    res.set(k, caps);
  }
  return res;
}

/**
 * Consolida las listas del bimestre en el registro: cada capacidad recibe el promedio de los
 * criterios que la evalúan (AD=3, A=2, B=1, C=0, redondeado) y el logro de la competencia se
 * recalcula. Las capacidades sin criterios no se tocan. Devuelve cuántas notas actualizó.
 */
export async function pasarAlRegistro(p: { seccionId: string; areaId: string; periodoId: string }, colegioId: string | null) {
  const acumulado = consolidar(await listasDelCurso(p.seccionId, p.areaId, p.periodoId));
  let n = 0;
  for (const [k, nuevas] of acumulado) {
    const [estudianteId, competenciaId] = k.split("|");
    const actual = await db.tabla("calificacion").where("[estudiante_id+competencia_id+periodo_id]").equals([estudianteId, competenciaId, p.periodoId]).first();
    const caps = { ...(actual?.capacidades ?? {}), ...nuevas };
    await guardarNota({ estudianteId, competenciaId, periodoId: p.periodoId, seccionId: p.seccionId, cambios: { capacidades: caps, nivel_logro: logroDeCapacidades(caps) } }, colegioId);
    n++;
  }
  return n;
}
