import { Link, Route, Routes } from "react-router-dom";
import { ArrowRight, CalendarRange, CircleCheck, ClipboardCheck, LayoutGrid, Users, GraduationCap } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/app/contexto";
import { useEstructura } from "@/datos/consultas";
import { vivas } from "@/db/repositorio";
import { Contenido, Encabezado, Gema, Tarjeta, cx, orden } from "@/ui/componentes";
import { AnioEscolarPagina } from "./AnioEscolar";
import { SeccionesPagina } from "./Secciones";
import { PersonalPagina, FichaPersonal } from "./Personal";
import { EstudiantesPagina, FichaEstudiante } from "./Estudiantes";
import { ImportarPagina } from "./Importar";
import { CierreAnio } from "./CierreAnio";

export function Configuracion() {
  return (
    <Routes>
      <Route index element={<Centro />} />
      <Route path="anio" element={<AnioEscolarPagina />} />
      <Route path="secciones" element={<SeccionesPagina />} />
      <Route path="personal" element={<PersonalPagina />} />
      <Route path="personal/:id" element={<FichaPersonal />} />
      <Route path="estudiantes" element={<EstudiantesPagina />} />
      <Route path="estudiantes/importar" element={<ImportarPagina />} />
      <Route path="estudiantes/:id" element={<FichaEstudiante />} />
      <Route path="cierre" element={<CierreAnio />} />
    </Routes>
  );
}

function Centro() {
  const e = useEstructura();
  const conteos = useLiveQuery(async () => ({
    personal: vivas(await db.tabla("usuario").toArray()).filter((u) => u.roles.some((r) => r === "docente" || r === "auxiliar")).length,
    asignaciones: vivas(await db.tabla("docente_asignacion").toArray()).length,
  }));
  const matriculados = e?.secciones.reduce((s, x) => s + x.estudiantes, 0) ?? 0;

  const pasos = [
    {
      a: "anio", icono: CalendarRange, tono: "tono-cielo", titulo: "Año escolar y periodos",
      estado: e?.anio ? `${e.anio.anio} · ${e.periodos.length} ${e.anio.regimen === "bimestre" ? "bimestres" : "trimestres"}` : "Sin configurar",
      listo: !!e?.anio && e.periodos.length > 0,
    },
    {
      a: "secciones", icono: LayoutGrid, tono: "tono-lila", titulo: "Grados y secciones",
      estado: e?.secciones.length ? `${e.secciones.length} secciones · ${e.secciones.filter((s) => s.tutor).length} con tutor` : "Sin secciones",
      listo: (e?.secciones.length ?? 0) > 0,
    },
    {
      a: "personal", icono: Users, tono: "tono-ambar", titulo: "Personal y asignaciones",
      estado: conteos ? `${conteos.personal} personas · ${conteos.asignaciones} asignaciones` : "...",
      listo: (conteos?.asignaciones ?? 0) > 0,
    },
    {
      a: "estudiantes", icono: GraduationCap, tono: "tono-musgo", titulo: "Estudiantes y matrícula",
      estado: matriculados ? `${matriculados} matriculados` : "Sin estudiantes",
      listo: matriculados > 0,
    },
  ];
  const listos = pasos.filter((p) => p.listo).length;

  return (
    <>
      <Encabezado etiqueta="Dirección" titulo="Configuración del colegio" subtitulo="Prepare el año escolar en cuatro pasos. Todo funciona sin conexión." />
      <Contenido ancho="max-w-3xl">
        <Tarjeta className="aparecer p-5" style={orden(1)}>
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Avance de la configuración</span>
            <span className="titulo-display text-lg">{listos} de {pasos.length}</span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {pasos.map((p) => (
              <div key={p.a} className={cx("h-2.5 rounded-full", p.listo ? "bg-gradient-to-r from-teal-400 to-sky-500 shadow-[0_0_10px_rgba(45,212,191,.6)]" : "bg-white/60")} />
            ))}
          </div>
        </Tarjeta>

        <div className="space-y-3">
          {pasos.map((p, i) => (
            <Link key={p.a} to={p.a} style={orden(i + 2)}
              className="vidrio aparecer group flex items-center gap-4 p-4 transition hover:bg-white/55 active:scale-[0.99]">
              <span className="titulo-display w-5 text-center text-lg font-bold text-tinta-suave">{i + 1}</span>
              <Gema icono={p.icono} tono={p.tono} />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{p.titulo}</span>
                <span className="block truncate text-sm text-tinta-suave">{p.estado}</span>
              </span>
              {p.listo ? <CircleCheck className="h-6 w-6 text-teal-600" aria-label="Listo" /> : <ArrowRight className="h-5 w-5 text-tinta-suave transition group-hover:translate-x-0.5" aria-hidden />}
            </Link>
          ))}
        </div>

        {e?.anio && (
          <Link to="cierre" className="vidrio aparecer group flex items-center gap-4 p-4 transition hover:bg-white/55">
            <Gema icono={ClipboardCheck} tono="tono-coral" />
            <span className="min-w-0 flex-1">
              <span className="block font-bold">Cierre del año {e.anio.anio}</span>
              <span className="block text-sm text-tinta-suave">
                {e.anio.cerrado_en ? "Año cerrado: ya puede iniciar el siguiente." : "Situación final, actas, libretas anuales y cierre."}
              </span>
            </span>
            <ArrowRight className="h-5 w-5 text-tinta-suave transition group-hover:translate-x-0.5" aria-hidden />
          </Link>
        )}
      </Contenido>
    </>
  );
}
