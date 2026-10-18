import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, CameraOff, Keyboard } from "lucide-react";
import { Boton, cx } from "./componentes";

/** Dibuja un código QR (SVG, nítido a cualquier tamaño, también al proyectarlo). */
export function CodigoQr({ texto, className }: { texto: string; className?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let vivo = true;
    void import("qrcode").then((QR) =>
      QR.toString(texto, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b2e33", light: "#ffffff" } })
        .then((s) => vivo && setSvg(s)),
    );
    return () => { vivo = false; };
  }, [texto]);
  // El SVG lo genera la librería a partir de nuestro propio texto (no hay contenido externo).
  return <div role="img" aria-label="Código QR" className={cx("[&>svg]:h-full [&>svg]:w-full", className)} dangerouslySetInnerHTML={{ __html: svg }} />;
}

type Detector = { detect(fuente: CanvasImageSource): Promise<{ rawValue: string }[]> };

/**
 * Lector de QR con la cámara trasera. Usa el detector nativo del navegador (Android Chrome)
 * y, si no existe, jsQR. Siempre permite escribir el código a mano.
 */
export function Escaner({ onLeer, pausado, textoManual = "Escribir el código" }: { onLeer(texto: string): void; pausado?: boolean; textoManual?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const ultimo = useRef<{ texto: string; t: number }>({ texto: "", t: 0 });
  const pausadoRef = useRef(pausado);
  pausadoRef.current = pausado;
  const onLeerRef = useRef(onLeer);
  onLeerRef.current = onLeer;
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [codigo, setCodigo] = useState("");

  useEffect(() => {
    if (manual) return;
    let flujo: MediaStream | null = null;
    let parar = false;
    let temporizador: ReturnType<typeof setTimeout>;

    const entregar = (texto: string) => {
      const ahora = Date.now();
      // La misma lectura repetida en menos de 2,5 s se ignora (la cámara ve el código varias veces).
      if (pausadoRef.current || (texto === ultimo.current.texto && ahora - ultimo.current.t < 2500)) return;
      ultimo.current = { texto, t: ahora };
      navigator.vibrate?.(60);
      onLeerRef.current(texto);
    };

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError("La cámara necesita que la app se abra con HTTPS. Escriba el código a mano.");
        return;
      }
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      } catch (e) {
        const n = (e as DOMException).name;
        setError(n === "NotAllowedError" ? "Permita el uso de la cámara para escanear." : n === "NotFoundError" ? "Este equipo no tiene cámara." : "No se pudo abrir la cámara.");
        return;
      }
      if (parar || !video.current) { flujo.getTracks().forEach((t) => t.stop()); return; }
      video.current.srcObject = flujo;
      await video.current.play().catch(() => undefined);

      const Nativo = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      const detector = Nativo ? new Nativo({ formats: ["qr_code"] }) : null;
      const jsQR = detector ? null : (await import("jsqr")).default;
      const lienzo = document.createElement("canvas");
      const ctx = lienzo.getContext("2d", { willReadFrequently: true });

      const ciclo = async () => {
        if (parar) return;
        const v = video.current;
        if (v && v.readyState >= 2) {
          try {
            if (detector) {
              const r = await detector.detect(v);
              if (r[0]?.rawValue) entregar(r[0].rawValue);
            } else if (jsQR && ctx) {
              // Se reduce la imagen: más rápido en celulares de gama baja.
              const escala = Math.min(1, 640 / v.videoWidth);
              lienzo.width = v.videoWidth * escala;
              lienzo.height = v.videoHeight * escala;
              ctx.drawImage(v, 0, 0, lienzo.width, lienzo.height);
              const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
              const r = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
              if (r?.data) entregar(r.data);
            }
          } catch {
            /* un cuadro ilegible no es un error */
          }
        }
        temporizador = setTimeout(ciclo, 220);
      };
      void ciclo();
    })();

    return () => {
      parar = true;
      clearTimeout(temporizador);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, [manual]);

  const enviarManual = (e: FormEvent) => {
    e.preventDefault();
    if (codigo.trim()) {
      onLeerRef.current(codigo.trim());
      setCodigo("");
    }
  };

  return (
    <div className="space-y-3">
      {!manual && (
        <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-[1.75rem] bg-tinta shadow-[0_20px_50px_-20px_rgba(11,46,51,.8)]">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-white">
              <CameraOff className="h-10 w-10 opacity-80" aria-hidden />
              <p className="text-sm">{error}</p>
            </div>
          ) : (
            <>
              <video ref={video} playsInline muted poster="data:image/gif;base64,R0lGODlhAQABAAAAACw=" className="h-full w-full object-cover" aria-label="Vista de la cámara" />
              {/* Marco de enfoque */}
              <div aria-hidden className="pointer-events-none absolute inset-[14%] rounded-3xl shadow-[0_0_0_999px_rgba(11,46,51,.45)]">
                {["left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl",
                  "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-3xl", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-3xl"].map((c) => (
                  <span key={c} className={cx("absolute h-10 w-10 border-teal-300", c)} />
                ))}
                <span className="linea-escaneo absolute inset-x-4 h-0.5 rounded-full bg-teal-300 shadow-[0_0_12px_rgba(94,234,212,.9)]" />
              </div>
              {pausado && <div className="absolute inset-0 bg-tinta/40" />}
            </>
          )}
        </div>
      )}
      {manual ? (
        <form onSubmit={enviarManual} className="flex gap-2">
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="campo flex-1" placeholder="Código" aria-label="Código" autoFocus />
          <Boton type="submit" disabled={!codigo.trim()}>Registrar</Boton>
        </form>
      ) : null}
      <div className="flex justify-center">
        <Boton variante="fantasma" icono={manual ? Camera : Keyboard} onClick={() => { setManual(!manual); setError(null); }}>
          {manual ? "Usar la cámara" : textoManual}
        </Boton>
      </div>
    </div>
  );
}
