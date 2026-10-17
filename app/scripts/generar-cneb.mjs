// Fuente única del catálogo del Currículo Nacional (CNEB 2016).
// Genera:  app/src/data/cneb.json  y  supabase/migrations/0004_cneb.sql
// Uso: node scripts/generar-cneb.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));

// Competencias del CNEB por número oficial.
const C = {
  1: "Se desenvuelve de manera autónoma a través de su motricidad",
  2: "Asume una vida saludable",
  3: "Interactúa a través de sus habilidades sociomotrices",
  4: "Construye su identidad",
  5: "Se comunica oralmente en su lengua materna",
  6: "Lee diversos tipos de textos escritos en su lengua materna",
  7: "Escribe diversos tipos de textos en su lengua materna",
  8: "Aprecia de manera crítica manifestaciones artístico-culturales",
  9: "Crea proyectos desde los lenguajes artísticos",
  10: "Se comunica oralmente en castellano como segunda lengua",
  11: "Lee diversos tipos de textos escritos en castellano como segunda lengua",
  12: "Escribe diversos tipos de textos en castellano como segunda lengua",
  13: "Se comunica oralmente en inglés como lengua extranjera",
  14: "Lee diversos tipos de textos escritos en inglés como lengua extranjera",
  15: "Escribe diversos tipos de textos en inglés como lengua extranjera",
  16: "Convive y participa democráticamente en la búsqueda del bien común",
  17: "Construye interpretaciones históricas",
  18: "Gestiona responsablemente el espacio y el ambiente",
  19: "Gestiona responsablemente los recursos económicos",
  20: "Indaga mediante métodos científicos para construir sus conocimientos",
  21: "Explica el mundo físico basándose en conocimientos sobre los seres vivos, materia y energía, biodiversidad, Tierra y universo",
  22: "Diseña y construye soluciones tecnológicas para resolver problemas de su entorno",
  23: "Resuelve problemas de cantidad",
  24: "Resuelve problemas de regularidad, equivalencia y cambio",
  25: "Resuelve problemas de forma, movimiento y localización",
  26: "Resuelve problemas de gestión de datos e incertidumbre",
  27: "Gestiona proyectos de emprendimiento económico o social",
  28: "Construye su identidad como persona humana, amada por Dios, digna, libre y trascendente, comprendiendo la doctrina de su propia religión, abierto al diálogo con las que le son cercanas",
  29: "Asume la experiencia del encuentro personal y comunitario con Dios en su proyecto de vida en coherencia con su creencia religiosa",
  30: "Se desenvuelve en entornos virtuales generados por las TIC",
  31: "Gestiona su aprendizaje de manera autónoma",
};

// [codigo, nombre, competencias, opcional]
const AREAS = {
  primaria: [
    ["MAT", "Matemática", [23, 24, 25, 26]],
    ["COM", "Comunicación", [5, 6, 7]],
    ["PS", "Personal Social", [4, 16, 17, 18, 19]],
    ["CYT", "Ciencia y Tecnología", [20, 21, 22]],
    ["AYC", "Arte y Cultura", [8, 9]],
    ["EF", "Educación Física", [1, 2, 3]],
    ["ER", "Educación Religiosa", [28, 29]],
    ["ING", "Inglés como lengua extranjera", [13, 14, 15], true],
    ["C2L", "Castellano como segunda lengua", [10, 11, 12], true],
    ["TRV", "Competencias transversales", [30, 31]],
  ],
  secundaria: [
    ["MAT", "Matemática", [23, 24, 25, 26]],
    ["COM", "Comunicación", [5, 6, 7]],
    ["ING", "Inglés como lengua extranjera", [13, 14, 15]],
    ["CCSS", "Ciencias Sociales", [17, 18, 19]],
    ["DPCC", "Desarrollo Personal, Ciudadanía y Cívica", [4, 16]],
    ["CYT", "Ciencia y Tecnología", [20, 21, 22]],
    ["EPT", "Educación para el Trabajo", [27]],
    ["AYC", "Arte y Cultura", [8, 9]],
    ["EF", "Educación Física", [1, 2, 3]],
    ["ER", "Educación Religiosa", [28, 29]],
    ["C2L", "Castellano como segunda lengua", [10, 11, 12], true],
    ["TRV", "Competencias transversales", [30, 31]],
  ],
};

const hex = (n, len) => n.toString(16).padStart(len, "0");
const areas = [];
const competencias = [];
let na = 0;
for (const [nivel, lista] of Object.entries(AREAS)) {
  lista.forEach(([codigo, nombre, comps, opcional = false], i) => {
    na++;
    const area_id = `a0000000-0000-4000-8000-${hex(na, 12)}`;
    areas.push({ id: area_id, colegio_id: null, nivel, codigo, nombre, opcional, orden: i + 1 });
    comps.forEach((num, j) => {
      competencias.push({
        id: `c0000000-0000-4000-8000-${hex(na, 6)}${hex(num, 6)}`,
        colegio_id: null,
        area_id,
        numero: num,
        nombre: C[num],
        orden: j + 1,
      });
    });
  });
}

const json = resolve(aqui, "../src/data/cneb.json");
mkdirSync(dirname(json), { recursive: true });
writeFileSync(json, JSON.stringify({ areas, competencias }, null, 1));

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
let sql = "-- GENERADO por app/scripts/generar-cneb.mjs. No editar a mano.\n";
sql += "-- Catálogo oficial del CNEB (colegio_id = null).\n\n";
sql += "insert into area (id, colegio_id, nivel, codigo, nombre, opcional, orden) values\n";
sql += areas.map((a) => `  (${q(a.id)}, null, ${q(a.nivel)}, ${q(a.codigo)}, ${q(a.nombre)}, ${a.opcional}, ${a.orden})`).join(",\n");
sql += "\non conflict (id) do update set nombre = excluded.nombre, opcional = excluded.opcional, orden = excluded.orden;\n\n";
sql += "insert into competencia (id, colegio_id, area_id, numero, nombre, orden) values\n";
sql += competencias.map((c) => `  (${q(c.id)}, null, ${q(c.area_id)}, ${c.numero}, ${q(c.nombre)}, ${c.orden})`).join(",\n");
sql += "\non conflict (id) do update set nombre = excluded.nombre, orden = excluded.orden;\n";
writeFileSync(resolve(aqui, "../../supabase/migrations/0004_cneb.sql"), sql);

console.log(`CNEB: ${areas.length} áreas, ${competencias.length} competencias`);
