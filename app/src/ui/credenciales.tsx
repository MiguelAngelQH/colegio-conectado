import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Boton, Dialogo } from "./componentes";

/** Muestra una sola vez la contraseña temporal para entregarla a la persona. */
export function DialogoCredencial({ titulo, nombre, dni, email, clave, onCerrar }: {
  titulo: string; nombre: string; dni: string | null; email?: string | null; clave: string; onCerrar(): void;
}) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard?.writeText(clave);
      setCopiado(true);
    } catch {
      /* sin portapapeles: se copia a mano */
    }
  };
  return (
    <Dialogo tam="chico" abierto titulo={titulo} onCerrar={onCerrar} acciones={<Boton onClick={onCerrar}>Entendido</Boton>}>
      <p>Entregue estos datos a <strong className="text-tinta">{nombre}</strong>. Al ingresar deberá elegir una contraseña propia.</p>
      <dl className="mt-3 space-y-2 rounded-2xl bg-sup/70 p-4 text-tinta ring-1 ring-sup">
        <div>
          <dt className="etiqueta">Usuario</dt>
          <dd className="font-semibold">DNI {dni}{email && <span className="font-normal text-tinta-suave"> · o {email}</span>}</dd>
        </div>
        <div>
          <dt className="etiqueta">Contraseña temporal</dt>
          <dd className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
            <strong className="font-mono text-lg tracking-wider">{clave}</strong>
            <button type="button" onClick={copiar} className="ml-auto rounded-full p-2 hover:bg-sup" aria-label="Copiar contraseña">
              {copiado ? <Check className="h-4 w-4 text-emerald-700" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            </button>
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs">Esta contraseña no se volverá a mostrar. Si se pierde, puede restablecerla de nuevo.</p>
    </Dialogo>
  );
}
