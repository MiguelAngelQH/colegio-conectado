import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ProveedorApp } from "./app/contexto";
import { ActualizacionPWA } from "./ui/ActualizacionPWA";
import { ProveedorAvisos } from "./ui/avisos";
import { BarreraErrores } from "./ui/BarreraErrores";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BarreraErrores>
      <BrowserRouter>
        <ProveedorApp>
          <ProveedorAvisos>
            <App />
            <ActualizacionPWA />
          </ProveedorAvisos>
        </ProveedorApp>
      </BrowserRouter>
    </BarreraErrores>
  </StrictMode>,
);
