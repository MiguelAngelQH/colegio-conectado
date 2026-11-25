import { useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudOff, KeyRound, MonitorSmartphone, Moon, Wifi } from "lucide-react";
import { db, useApp } from "@/app/contexto";
import { NOMBRE_ROL, TONO_ROL } from "@/app/modulos";
import { MODO } from "@/config";
import { alCambiarConexion, forzarSinConexion, sinConexionForzada } from "@/sync/red";
import { fijarSoloWifi, soloWifi } from "@/sync/archivos";
import { useState } from "react";
import { Boton, BotonRegresar, Contenido, Dato, Encabezado, Gema, Tarjeta, cx, iniciales, orden } from "@/ui/componentes";
import { Segmentado } from "@/ui/formulario";
import { fijarTema, usePreferenciaTema, type PreferenciaTema } from "@/ui/tema";
import { DialogoCambiarClave } from "./CambiarClave";

export function Perfil() {
  const { usuario } = useApp();
  const forzado = useSyncExternalStore(alCambiarConexion, sinConexionForzada);
  const [wifi, setWifi] = useState(soloWifi);
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const tema = usePreferenciaTema();
  const colegio = useLiveQuery(() => (usuario?.colegio_id ? db.tabla("colegio").get(usuario.colegio_id) : undefined), [usuario?.colegio_id]);
  if (!usuario) return null;

  return (
    <>
      <Encabezado etiqueta="Cuenta" titulo="Mi perfil" />
      <Contenido ancho="max-w-3xl">
        <Tarjeta className="aparecer flex flex-col items-center p-6 text-center sm:flex-row sm:text-left" style={orden(1)}>
          <span className={cx("gema titulo-display h-24 w-24 !rounded-[1.8rem] text-3xl font-bold", TONO_ROL[usuario.roles[0]])}>
            <span className="relative z-10">{iniciales(usuario.nombres, usuario.apellidos)}</span>
          </span>
          <div className="mt-4 sm:ml-5 sm:mt-0">
            <h2 className="titulo-display text-2xl font-bold">{usuario.nombres} {usuario.apellidos}</h2>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {usuario.roles.map((r) => (
                <span key={r} className="rounded-full bg-sup/60 px-3 py-1 text-xs font-semibold ring-1 ring-sup">{NOMBRE_ROL[r]}</span>
              ))}
            </div>
          </div>
        </Tarjeta>

        <Tarjeta className="aparecer divide-y divide-sup/70" style={orden(2)}>
          <Dato etiqueta="Apellidos y nombres">{usuario.apellidos} {usuario.nombres}</Dato>
          <Dato etiqueta="Institución educativa">
            {colegio?.nombre ?? "-"}
            {colegio && <span className="block text-xs font-normal text-tinta-suave">Código modular {colegio.codigo_modular} · {colegio.ugel}</span>}
          </Dato>
          {usuario.dni && <Dato etiqueta="Documento de identidad">DNI {usuario.dni}</Dato>}
          {usuario.email && <Dato etiqueta="Correo">{usuario.email}</Dato>}
        </Tarjeta>
        <p className="px-2 text-xs text-tinta-suave">Para cambiar sus datos comuníquese con la dirección del colegio.</p>

        <Tarjeta className="aparecer flex flex-col gap-4 p-5 sm:flex-row sm:items-center" style={orden(3)}>
          <Gema icono={KeyRound} tono="tono-laguna" tam="sm" />
          <div className="min-w-0 flex-1">
            <h2 className="font-bold">Acceso a la cuenta</h2>
            <p className="text-xs text-tinta-suave">
              Ingresa con su DNI{usuario.dni ? ` (${usuario.dni})` : ""}{usuario.email ? ` o con ${usuario.email}` : ""}. Si olvida su contraseña, la dirección puede darle una nueva.
            </p>
          </div>
          <Boton variante="vidrio" icono={KeyRound} onClick={() => setCambiandoClave(true)}>Cambiar contraseña</Boton>
        </Tarjeta>
        {cambiandoClave && <DialogoCambiarClave onCerrar={() => setCambiandoClave(false)} />}

        <Tarjeta className="aparecer p-5" style={orden(4)}>
          <div className="flex items-center gap-3">
            <Gema icono={Moon} tono="tono-lila" tam="sm" />
            <div>
              <h2 className="font-bold">Apariencia</h2>
              <p className="text-xs text-tinta-suave">El modo nocturno cansa menos la vista de noche. "Automático" sigue la configuración del equipo.</p>
            </div>
          </div>
          <div className="mt-4">
            <Segmentado<PreferenciaTema> etiqueta="Tema" valor={tema} onCambio={fijarTema}
              opciones={[{ valor: "claro", texto: "Claro" }, { valor: "oscuro", texto: "Oscuro" }, { valor: "auto", texto: "Automático" }]} />
          </div>
        </Tarjeta>

        <Tarjeta className="aparecer p-5" style={orden(5)}>
          <div className="flex items-center gap-3">
            <Gema icono={MonitorSmartphone} tono="tono-pizarra" tam="sm" />
            <div>
              <h2 className="font-bold">Este equipo</h2>
              <p className="text-xs text-tinta-suave">
                {MODO === "demo" ? "Modo demostración: datos de ejemplo, solo en este equipo" : "Conectado al servidor del colegio"}
              </p>
            </div>
          </div>
          <label className="mt-4 flex cursor-pointer items-center gap-4 rounded-2xl bg-sup/40 p-3 ring-1 ring-sup/80">
            <span className="min-w-0 flex-1 text-sm">
              <span className="flex items-center gap-1.5 font-semibold"><CloudOff className="h-4 w-4" aria-hidden /> Simular sin conexión</span>
              <span className="block text-xs text-tinta-suave">Para practicar o comprobar que todo funciona sin internet.</span>
            </span>
            <input type="checkbox" role="switch" checked={forzado} onChange={(e) => forzarSinConexion(e.target.checked)} className="peer sr-only" />
            <span aria-hidden className="relative h-8 w-14 shrink-0 rounded-full bg-tinta/15 shadow-[inset_0_2px_4px_rgba(11,46,51,.2)] transition peer-checked:bg-amber-400 peer-focus-visible:ring-4 peer-focus-visible:ring-blue-300 after:absolute after:left-1 after:top-1 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow-md after:transition peer-checked:after:translate-x-6" />
          </label>
          <label className="mt-2 flex cursor-pointer items-center gap-4 rounded-2xl bg-sup/40 p-3 ring-1 ring-sup/80">
            <span className="min-w-0 flex-1 text-sm">
              <span className="flex items-center gap-1.5 font-semibold"><Wifi className="h-4 w-4" aria-hidden /> Subir fotos solo con wifi</span>
              <span className="block text-xs text-tinta-suave">Ahorra datos móviles. Las notas y la asistencia se envían igual.</span>
            </span>
            <input type="checkbox" role="switch" checked={wifi} onChange={(e) => { fijarSoloWifi(e.target.checked); setWifi(e.target.checked); }} className="peer sr-only" />
            <span aria-hidden className="relative h-8 w-14 shrink-0 rounded-full bg-tinta/15 shadow-[inset_0_2px_4px_rgba(11,46,51,.2)] transition peer-checked:bg-blue-500 peer-focus-visible:ring-4 peer-focus-visible:ring-blue-300 after:absolute after:left-1 after:top-1 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow-md after:transition peer-checked:after:translate-x-6" />
          </label>
        </Tarjeta>

        <div className="flex justify-center pt-2"><BotonRegresar a="/" /></div>
      </Contenido>
    </>
  );
}
