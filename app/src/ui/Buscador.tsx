import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, CornerDownLeft, GraduationCap, House, RefreshCw, Search, User, X } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { menuPara, type ItemMenu } from "@/app/menu";
import { vivas } from "@/db/repositorio";
import { cx } from "./componentes";

interface Resultado {
  id: string;
  titulo: string;
  detalle: string;
  ruta: string;
  icono: LucideIcon;
  grupo: "Páginas" | "Estudiantes";
}

/** Sin tildes ni mayúsculas, para que "garcia" encuentre "García". */
export const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Cada palabra buscada debe aparecer en el texto (en cualquier orden). Devuelve una puntuación o -1. */
export function coincide(texto: string, consulta: string): number {
  const t = normalizar(texto);
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return 0;
  let puntos = 0;
  for (const p of palabras) {
    const i = t.indexOf(p);
    if (i < 0) return -1;
    puntos += i === 0 || t[i - 1] === " " ? 3 : 1; // vale más si empieza una palabra
  }
  return puntos;
}

const todos = (items: ItemMenu[]): ItemMenu[] => items.flatMap((i) => (i.hijos ? i.hijos : [i]));

/** Buscador rápido (Ctrl + K): páginas del menú y, para el personal, estudiantes por nombre o DNI. */
export function Buscador({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { usuario } = useApp();
  const navegar = useNavigate();
  const [texto, setTexto] = useState("");
  const [marcado, setMarcado] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const esPersonal = !!usuario?.roles.some((r) => ["director", "subdirector", "docente", "tutor", "auxiliar"].includes(r));

  const paginas = useMemo<Resultado[]>(() => {
    if (!usuario) return [];
    const fijas: Resultado[] = [
      { id: "inicio", titulo: "Inicio", detalle: "Resumen del día", ruta: "/", icono: House, grupo: "Páginas" },
      { id: "perfil", titulo: "Mi perfil", detalle: "Datos, contraseña y apariencia", ruta: "/perfil", icono: User, grupo: "Páginas" },
      { id: "sync", titulo: "Sincronización", detalle: "Cambios pendientes y conexión", ruta: "/sincronizacion", icono: RefreshCw, grupo: "Páginas" },
    ];
    const vistos = new Set<string>();
    return [...fijas, ...menuPara(usuario.roles).flatMap((g) => todos(g.items).map((i) => ({
      id: i.id, titulo: i.titulo, detalle: i.descripcion ?? g.titulo, ruta: i.ruta, icono: i.icono, grupo: "Páginas" as const,
    })))].filter((r) => !vistos.has(r.ruta + r.titulo) && vistos.add(r.ruta + r.titulo));
  }, [usuario]);

  const estudiantes = useLiveQuery(async () => (abierto && esPersonal ? vivas(await db.tabla("estudiante").toArray()) : []), [abierto, esPersonal]);

  const resultados = useMemo<Resultado[]>(() => {
    const q = texto.trim();
    const pags = paginas
      .map((p) => ({ p, s: q ? coincide(`${p.titulo} ${p.detalle}`, q) : 0 }))
      .filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, q ? 6 : 8).map((x) => x.p);
    const ests = q.length >= 2
      ? (estudiantes ?? [])
          .map((e) => ({ e, s: coincide(`${e.nombres} ${e.apellidos} ${e.dni ?? ""}`, q) }))
          .filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, 6)
          .map(({ e }) => ({ id: e.id, titulo: `${e.apellidos}, ${e.nombres}`, detalle: e.dni ? `DNI ${e.dni}` : "Estudiante", ruta: `/estudiantes/${e.id}`, icono: GraduationCap, grupo: "Estudiantes" as const }))
      : [];
    return [...ests, ...pags];
  }, [texto, paginas, estudiantes]);

  useEffect(() => {
    if (!abierto) return;
    setTexto("");
    setMarcado(0);
    setTimeout(() => entrada.current?.focus(), 0);
  }, [abierto]);
  useEffect(() => setMarcado(0), [texto]);

  if (!abierto) return null;
  const ir = (r: Resultado | undefined) => {
    if (!r) return;
    onCerrar();
    navegar(r.ruta);
  };
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setMarcado((m) => Math.min(m + 1, resultados.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setMarcado((m) => Math.max(m - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); ir(resultados[marcado]); }
    else if (e.key === "Escape") onCerrar();
  };

  return createPortal(
    <div className="fixed inset-0 z-[55] flex items-start justify-center p-3 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Buscar">
      <div className="absolute inset-0 bg-noche/40 backdrop-blur-[3px]" onClick={onCerrar} />
      <div className="vidrio-solido tarjeta-astro relative w-full max-w-xl overflow-hidden !rounded-[1.6rem] p-0 ![background:#f8fafd] dark:![background:#182339]">
        <div className="flex items-center gap-3 border-b border-tinta/10 px-4">
          <Search className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
          <input ref={entrada} autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={tecla}
            placeholder={esPersonal ? "Buscar páginas o estudiantes por nombre o DNI..." : "Buscar en la app..."}
            className="min-h-14 flex-1 bg-transparent text-base outline-none placeholder:text-tinta-suave/70"
            role="combobox" aria-expanded="true" aria-controls="resultados-busqueda" aria-activedescendant={resultados[marcado] ? `res-${resultados[marcado].id}` : undefined} />
          <button onClick={onCerrar} className="rounded-full p-1.5 text-tinta-suave hover:bg-tinta/5" aria-label="Cerrar"><X className="h-4 w-4" aria-hidden /></button>
        </div>
        <ul id="resultados-busqueda" role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
          {resultados.length === 0 && <li className="p-6 text-center text-sm text-tinta-suave">No se encontró "{texto}".</li>}
          {resultados.map((r, i) => (
            <li key={`${r.grupo}-${r.id}`}>
              {(i === 0 || resultados[i - 1].grupo !== r.grupo) && <p className="etiqueta px-3 pb-1 pt-2">{r.grupo}</p>}
              <button id={`res-${r.id}`} role="option" aria-selected={i === marcado} onMouseEnter={() => setMarcado(i)} onClick={() => ir(r)}
                className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition", i === marcado ? "bg-blue-600 text-white" : "hover:bg-tinta/5")}>
                <r.icono className={cx("h-[18px] w-[18px] shrink-0", i === marcado ? "text-white" : "text-tinta-suave")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.titulo}</span>
                  <span className={cx("block truncate text-xs", i === marcado ? "text-white/75" : "text-tinta-suave")}>{r.detalle}</span>
                </span>
                {i === marcado && <CornerDownLeft className="h-4 w-4 shrink-0 text-white/80" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
        <p className="hidden items-center gap-3 border-t border-tinta/10 px-4 py-2 text-[0.7rem] text-tinta-suave sm:flex">
          <span className="flex items-center gap-1"><ArrowUp className="h-3.5 w-3.5" aria-hidden /><ArrowDown className="h-3.5 w-3.5" aria-hidden /> moverse</span>
          <span><kbd className="rounded border border-tinta/20 px-1">Enter</kbd> abrir</span>
          <span><kbd className="rounded border border-tinta/20 px-1">Esc</kbd> cerrar</span>
          <span className="ml-auto"><kbd className="rounded border border-tinta/20 px-1">Ctrl</kbd> + <kbd className="rounded border border-tinta/20 px-1">K</kbd> en cualquier pantalla</span>
        </p>
      </div>
    </div>,
    document.body,
  );
}
