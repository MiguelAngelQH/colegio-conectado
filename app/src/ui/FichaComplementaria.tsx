// Salud y contacto de emergencia del estudiante. La dirección la edita; el tutor y los docentes
// la consultan (por ejemplo, ante una emergencia o para atender una necesidad educativa especial).
import { useState } from "react";
import { HeartPulse, Pencil, Phone, Save, TriangleAlert } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { guardar } from "@/db/repositorio";
import type { Estudiante } from "@/db/tipos";
import { textoGuardado, useAvisar } from "./avisos";
import { Boton, Dialogo, Tarjeta } from "./componentes";
import { Campo, Entrada, Segmentado } from "./formulario";

const SEGUROS = ["SIS", "EsSalud", "Privado", "Ninguno"] as const;
type Campos = Pick<Estudiante, "direccion" | "contacto_emergencia" | "telefono_emergencia" | "seguro" | "salud" | "nee" | "lengua_materna" | "vive_con">;

export function FichaComplementaria({ est, editable }: { est: Estudiante; editable: boolean }) {
  const [editando, setEditando] = useState(false);
  const vacio = !est.contacto_emergencia && !est.telefono_emergencia && !est.salud && !est.nee && !est.direccion && !est.seguro;
  const fila = (etiqueta: string, valor: string | null | undefined, destacado = false) => (
    <div className="px-5 py-3">
      <p className="etiqueta">{etiqueta}</p>
      <p className={destacado && valor ? "mt-0.5 font-semibold text-red-800" : "mt-0.5 font-semibold text-tinta"}>{valor?.trim() || <span className="font-normal text-tinta-suave">No registrado</span>}</p>
    </div>
  );
  return (
    <Tarjeta className="aparecer overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4">
        <HeartPulse className="h-5 w-5 text-rose-600" aria-hidden />
        <h2 className="flex-1 font-bold">Salud y contacto de emergencia</h2>
        {editable && <Boton variante="vidrio" icono={Pencil} className="!min-h-9 !px-3" onClick={() => setEditando(true)}>Editar</Boton>}
      </div>
      {vacio && editable && (
        <p className="flex items-center gap-2 px-5 pt-2 text-xs text-amber-800"><TriangleAlert className="h-4 w-4" aria-hidden /> Complete estos datos: el tutor los necesita ante una emergencia.</p>
      )}
      <div className="grid divide-y divide-sup/70 sm:grid-cols-2 sm:divide-y-0">
        <div className="divide-y divide-sup/70">
          <div className="px-5 py-3">
            <p className="etiqueta">Contacto de emergencia</p>
            <p className="mt-0.5 font-semibold">{est.contacto_emergencia || <span className="font-normal text-tinta-suave">No registrado</span>}</p>
            {est.telefono_emergencia && (
              <a href={`tel:${est.telefono_emergencia.replace(/\s+/g, "")}`} className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 underline">
                <Phone className="h-4 w-4" aria-hidden /> {est.telefono_emergencia}
              </a>
            )}
          </div>
          {fila("Seguro de salud", est.seguro)}
          {fila("Alergias, enfermedades o medicamentos", est.salud, true)}
        </div>
        <div className="divide-y divide-sup/70">
          {fila("Necesidades educativas especiales", est.nee, true)}
          {fila("Vive con", est.vive_con)}
          {fila("Lengua materna", est.lengua_materna)}
          {fila("Dirección", est.direccion)}
        </div>
      </div>
      {editando && <DialogoFicha est={est} onCerrar={() => setEditando(false)} />}
    </Tarjeta>
  );
}

function DialogoFicha({ est, onCerrar }: { est: Estudiante; onCerrar(): void }) {
  const { colegioId } = useApp();
  const avisar = useAvisar();
  const [f, setF] = useState<Campos>({
    direccion: est.direccion ?? "", contacto_emergencia: est.contacto_emergencia ?? "", telefono_emergencia: est.telefono_emergencia ?? "",
    seguro: est.seguro ?? null, salud: est.salud ?? "", nee: est.nee ?? "", lengua_materna: est.lengua_materna ?? "Castellano", vive_con: est.vive_con ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const tel = (f.telefono_emergencia ?? "").replace(/\s+/g, "");
  const telValido = !tel || /^\+?\d{6,12}$/.test(tel);
  const campo = (k: Exclude<keyof Campos, "seguro">) => ({ value: f[k] ?? "", onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });

  const guardarTodo = async () => {
    setGuardando(true);
    try {
      const limpio = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]));
      await guardar(db, "estudiante", { id: est.id, ...limpio }, colegioId);
      avisar(textoGuardado("Ficha actualizada"));
      onCerrar();
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo tam="grande" abierto titulo="Salud y contacto de emergencia" onCerrar={onCerrar}
      acciones={<><Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton><Boton icono={Save} cargando={guardando} disabled={!telValido} onClick={guardarTodo}>Guardar</Boton></>}>
      <div className="grid gap-3 pt-2 text-tinta sm:grid-cols-2">
        <Campo etiqueta="Contacto de emergencia"><Entrada {...campo("contacto_emergencia")} placeholder="Rosa Quispe (madre)" /></Campo>
        <Campo etiqueta="Teléfono de emergencia" error={telValido ? null : "Solo números (6 a 12 dígitos)"}><Entrada inputMode="tel" {...campo("telefono_emergencia")} placeholder="987654321" /></Campo>
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-semibold">Seguro de salud</span>
          <Segmentado etiqueta="Seguro de salud" valor={f.seguro ?? ""} onCambio={(v) => setF({ ...f, seguro: (v || null) as Campos["seguro"] })}
            opciones={SEGUROS.map((s) => ({ valor: s, texto: s }))} />
        </div>
        <Campo etiqueta="Alergias, enfermedades o medicamentos" className="sm:col-span-2"><Entrada {...campo("salud")} placeholder="Alérgico a la penicilina; asma (usa inhalador)" /></Campo>
        <Campo etiqueta="Necesidades educativas especiales" className="sm:col-span-2"><Entrada {...campo("nee")} placeholder="Baja visión: sentarlo adelante y usar letra grande" /></Campo>
        <Campo etiqueta="Vive con"><Entrada {...campo("vive_con")} placeholder="Madre y abuela" /></Campo>
        <Campo etiqueta="Lengua materna"><Entrada {...campo("lengua_materna")} placeholder="Castellano, quechua..." /></Campo>
        <Campo etiqueta="Dirección" className="sm:col-span-2"><Entrada {...campo("direccion")} placeholder="Jr. Los Andes 123, Cusco" /></Campo>
      </div>
    </Dialogo>
  );
}
