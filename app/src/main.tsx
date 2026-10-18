import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ProveedorApp } from "./app/contexto";
import { ActualizacionPWA } from "./ui/ActualizacionPWA";
import { ProveedorAvisos } from "./ui/avisos";
import { BarreraErrores } from "./ui/BarreraErrores";
import "./index.css";

// Dentro del APK la app ya está empaquetada: no se registra el service worker de la PWA.
const esApp = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BarreraErrores>
      <BrowserRouter>
        <ProveedorApp>
          <ProveedorAvisos>
            <App />
            {!esApp && <ActualizacionPWA />}
          </ProveedorAvisos>
        </ProveedorApp>
      </BrowserRouter>
    </BarreraErrores>
  </StrictMode>,
);
