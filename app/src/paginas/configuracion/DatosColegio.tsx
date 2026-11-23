// Datos del colegio que edita la dirección: identificación (códigos, UGEL, DRE), ubicación, contacto,
// lema e insignia. Aparecen en la app, la libreta, las actas, los carnés y los reportes.
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Save, School, Trash2, TriangleAlert } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { useColegio } from "@/datos/consultas";
import { procesarInsignia } from "@/datos/insignia";
import { guardar } from "@/db/repositorio";
import type { Colegio } from "@/db/tipos";
import { textoGuardado, useAvisar } from "@/ui/avisos";
import { Aviso, Boton, BotonRegresar, Contenido, Encabezado, Gema, Tarjeta } from "@/ui/componentes";
import { Campo, Entrada } from "@/ui/formulario";

type Formulario = Required<Pick<Colegio, "nombre" | "codigo_modular" | "codigo_local" | "ugel" | "dre" | "region" | "provincia" | "distrito" | "direccion" | "telefono" | "correo" | "lema">>;

const desde = (c: Colegio): Formulario => ({
  nombre: c.nombre ?? "", codigo_modular: c.codigo_modular ?? "", codigo_local: c.codigo_local ?? "", ugel: c.ugel ?? "", dre: c.dre ?? "",
  region: c.region ?? "", provincia: c.provincia ?? "", distrito: c.distrito ?? "", direccion: c.direccion ?? "", telefono: c.telefono ?? "",
  correo: c.correo ?? "", lema: c.lema ?? "",
});

export function DatosColegio() {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const colegio = useColegio();
  const [f, setF] = useState<Formulario | null>(null);
  const [insignia, setInsignia] = useState<string | null | undefined>(undefined);
  const [procesando, setProcesando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (colegio && !f) {
      setF(desde(colegio));
      setInsignia(colegio.insignia ?? null);
    }
  }, [colegio, f]);
  if (!colegio || !f) return null;

  const campo = (k: keyof Formulario) => ({ value: f[k], onChange: (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }) });
  const errores = {
    nombre: !f.nombre.trim() ? "Obligatorio" : null,
    codigo_modular: f.codigo_modular.trim() && !/^\d{7}$/.test(f.codigo_modular.trim()) ? "7 dígitos" : null,
    codigo_local: f.codigo_local.trim() && !/^\d{6}$/.test(f.codigo_local.trim()) ? "6 dígitos" : null,
    correo: f.correo.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.correo.trim()) ? "Correo no válido" : null,
  };
  const valido = Object.values(errores).every((x) => !x);
  const cambioInsignia = insignia !== (colegio.insignia ?? null);
  const cambioDatos = (Object.keys(f) as (keyof Formulario)[]).some((k) => f[k].trim() !== (desde(colegio)[k] ?? "").trim());

  const elegirArchivo = async (e: ChangeEvent<HTMLInputElement>) => {
    const a = e.target.files?.[0];
    e.target.value = "";
    if (!a) return;
    setError(null);
    setProcesando(true);
    try {
      setInsignia(await procesarInsignia(a));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcesando(false);
    }
  };

  const guardarCambios = async () => {
    setGuardando(true);
    try {
      const datos = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])) as Formulario;
      await guardar(db, "colegio", { id: colegio.id, ...datos, insignia: insignia ?? null }, colegioId);
      avisar(textoGuardado("Datos del colegio guardados"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Encabezado etiqueta="Configuración" titulo="Datos del colegio" subtitulo="Aparecen en la app, la libreta, las actas, los carnés y los reportes." />
      <Contenido ancho="max-w-3xl">
        <Tarjeta className="aparecer flex flex-col items-center gap-4 p-5 sm:flex-row">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white/80 ring-1 ring-white">
            {insignia ? <img src={insignia} alt="Insignia del colegio" className="h-full w-full object-contain p-1" /> : <Gema icono={School} tono="tono-laguna" tam="lg" />}
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="font-bold">Insignia</h2>
            <p className="text-sm text-tinta-suave">PNG o JPG, de preferencia cuadrada y con fondo transparente. Se reduce sola a 256 px para que funcione sin internet.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <input ref={archivo} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void elegirArchivo(e)} aria-label="Elegir insignia" />
              <Boton variante="vidrio" icono={ImagePlus} cargando={procesando} onClick={() => archivo.current?.click()}>{insignia ? "Cambiar insignia" : "Subir insignia"}</Boton>
              {insignia && <Boton variante="fantasma" icono={Trash2} onClick={() => setInsignia(null)}>Quitar</Boton>}
            </div>
          </div>
        </Tarjeta>
        {error && <Aviso tipo="error" icono={TriangleAlert}>{error}</Aviso>}

        <Tarjeta className="aparecer space-y-4 p-5">
          <h2 className="font-bold">Identificación</h2>
          <Campo etiqueta="Nombre de la institución educativa" error={errores.nombre}><Entrada {...campo("nombre")} placeholder="I.E. N.° 50001 Nombre del colegio" /></Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Código modular" ayuda="Del ESCALE o el SIAGIE" error={errores.codigo_modular}><Entrada inputMode="numeric" {...campo("codigo_modular")} /></Campo>
            <Campo etiqueta="Código de local" error={errores.codigo_local}><Entrada inputMode="numeric" {...campo("codigo_local")} /></Campo>
            <Campo etiqueta="UGEL"><Entrada {...campo("ugel")} placeholder="UGEL Cusco" /></Campo>
            <Campo etiqueta="DRE / GRE"><Entrada {...campo("dre")} placeholder="DRE Cusco" /></Campo>
          </div>
          <Campo etiqueta="Lema (opcional)"><Entrada {...campo("lema")} /></Campo>
        </Tarjeta>

        <Tarjeta className="aparecer space-y-4 p-5">
          <h2 className="font-bold">Ubicación y contacto</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo etiqueta="Región"><Entrada {...campo("region")} /></Campo>
            <Campo etiqueta="Provincia"><Entrada {...campo("provincia")} /></Campo>
            <Campo etiqueta="Distrito"><Entrada {...campo("distrito")} /></Campo>
          </div>
          <Campo etiqueta="Dirección"><Entrada {...campo("direccion")} /></Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Teléfono"><Entrada inputMode="tel" {...campo("telefono")} /></Campo>
            <Campo etiqueta="Correo institucional" error={errores.correo}><Entrada type="email" {...campo("correo")} /></Campo>
          </div>
        </Tarjeta>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {(cambioDatos || cambioInsignia) && <span className="text-xs text-tinta-suave">Hay cambios sin guardar.</span>}
          <Boton icono={Save} onClick={() => void guardarCambios()} cargando={guardando} disabled={!valido || !(cambioDatos || cambioInsignia)}>Guardar</Boton>
        </div>
        <div className="flex justify-center pt-2"><BotonRegresar a="/configuracion" /></div>
      </Contenido>
    </>
  );
}
