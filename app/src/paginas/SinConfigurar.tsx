import { ServerOff } from "lucide-react";
import { Gema } from "@/ui/componentes";

/** Versión publicada sin servidor: no se puede ingresar. Solo debería verla quien instala la app. */
export function SinConfigurar() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4">
      <div className="fondo-cielo" aria-hidden />
      <section className="vidrio-fuerte relative max-w-md p-6 text-center sm:p-8">
        <div className="flex justify-center"><Gema icono={ServerOff} tono="tono-pizarra" /></div>
        <h1 className="titulo-display mt-4 text-2xl font-bold">La app no está configurada</h1>
        <p className="mt-2 text-sm text-tinta-suave">
          Esta versión no está conectada al servidor del colegio. Si usted la instaló, complete VITE_SUPABASE_URL y
          VITE_SUPABASE_ANON_KEY en app/.env y vuelva a compilarla. Si es usuario, comuníquese con la dirección.
        </p>
      </section>
    </div>
  );
}
