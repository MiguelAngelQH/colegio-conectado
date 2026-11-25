import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ProveedorApp } from "./app/contexto";
import { MODO } from "./config";
import { SinConfigurar } from "./paginas/SinConfigurar";
import { ActualizacionPWA } from "./ui/ActualizacionPWA";
import { ProveedorAvisos } from "./ui/avisos";
import { BarreraErrores } from "./ui/BarreraErrores";
import { iniciarTema } from "./ui/tema";
import "./index.css";

iniciarTema();

// Dentro del APK la app ya está empaquetada: no se registra el service worker de la PWA.
const esApp = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BarreraErrores>
      {MODO === "sin-configurar" ? <SinConfigurar /> : (
        <BrowserRouter>
          <ProveedorApp>
            <ProveedorAvisos>
              <App />
              {!esApp && <ActualizacionPWA />}
            </ProveedorAvisos>
          </ProveedorApp>
        </BrowserRouter>
      )}
    </BarreraErrores>
  </StrictMode>,
);
