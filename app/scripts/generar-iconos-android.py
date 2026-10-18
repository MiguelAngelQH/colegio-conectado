"""Genera los íconos de Android (normal, redondo y adaptativo) y la pantalla de inicio.

Uso: python scripts/generar-iconos-android.py   (desde app/, después de `npx cap add android`)
Mismo diseño que public/icon.svg: birrete blanco sobre fondo verde laguna.
"""
import os
from PIL import Image, ImageDraw

RES = os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main", "res")
TEAL_A = (20, 196, 179)
TEAL_B = (11, 110, 106)
DENSIDADES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
SS = 4  # sobremuestreo para bordes suaves


def degradado(tam):
    img = Image.new("RGB", (tam, tam))
    px = img.load()
    for y in range(tam):
        for x in range(tam):
            t = (x + y) / (2 * tam)
            px[x, y] = tuple(int(TEAL_A[i] + (TEAL_B[i] - TEAL_A[i]) * t) for i in range(3))
    return img


def birrete(draw, cx, cy, s):
    """Dibuja el birrete centrado en (cx, cy) con escala s (ancho total ~ 2*s)."""
    blanco = (255, 255, 255, 255)
    claro = (204, 251, 241, 255)
    ambar = (253, 230, 138, 255)
    draw.polygon([(cx, cy - 0.62 * s), (cx + s, cy - 0.12 * s), (cx, cy + 0.38 * s), (cx - s, cy - 0.12 * s)], fill=blanco)
    draw.polygon([(cx - 0.6 * s, cy + 0.15 * s), (cx - 0.6 * s, cy + 0.55 * s), (cx, cy + 0.85 * s), (cx + 0.6 * s, cy + 0.55 * s),
                  (cx + 0.6 * s, cy + 0.15 * s), (cx, cy + 0.45 * s)], fill=claro)
    w = max(2, int(0.1 * s))
    draw.line([(cx + 0.88 * s, cy - 0.05 * s), (cx + 0.88 * s, cy + 0.55 * s)], fill=ambar, width=w)
    draw.ellipse([cx + 0.88 * s - w, cy + 0.55 * s - w, cx + 0.88 * s + w, cy + 0.55 * s + w], fill=ambar)


def icono(tam, redondo=False):
    t = tam * SS
    base = degradado(t).convert("RGBA")
    mascara = Image.new("L", (t, t), 0)
    md = ImageDraw.Draw(mascara)
    if redondo:
        md.ellipse([0, 0, t - 1, t - 1], fill=255)
    else:
        md.rounded_rectangle([0, 0, t - 1, t - 1], radius=int(t * 0.22), fill=255)
    capa = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    birrete(ImageDraw.Draw(capa), t / 2, t / 2 - t * 0.04, t * 0.3)
    base.alpha_composite(capa)
    base.putalpha(mascara)
    return base.resize((tam, tam), Image.LANCZOS)


def frente_adaptativo(tam):
    # Zona segura del ícono adaptativo: el contenido ocupa ~ el 60% central.
    t = tam * SS
    capa = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    birrete(ImageDraw.Draw(capa), t / 2, t / 2 - t * 0.03, t * 0.2)
    return capa.resize((tam, tam), Image.LANCZOS)


for nombre, f in DENSIDADES.items():
    carpeta = os.path.join(RES, f"mipmap-{nombre}")
    os.makedirs(carpeta, exist_ok=True)
    icono(int(48 * f)).save(os.path.join(carpeta, "ic_launcher.png"))
    icono(int(48 * f), redondo=True).save(os.path.join(carpeta, "ic_launcher_round.png"))
    frente_adaptativo(int(108 * f)).save(os.path.join(carpeta, "ic_launcher_foreground.png"))

with open(os.path.join(RES, "values", "ic_launcher_background.xml"), "w", encoding="utf-8") as fh:
    fh.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0F8F84</color>\n</resources>\n')

# Pantalla de inicio (splash): fondo laguna con el ícono al centro, en todas las carpetas existentes.
for carpeta in os.listdir(RES):
    ruta = os.path.join(RES, carpeta, "splash.png")
    if carpeta.startswith("drawable") and os.path.exists(ruta):
        w, h = Image.open(ruta).size
        fondo = Image.new("RGBA", (w, h), (15, 143, 132, 255))
        lado = int(min(w, h) * 0.28)
        ic = icono(lado)
        fondo.alpha_composite(ic, ((w - lado) // 2, (h - lado) // 2))
        fondo.convert("RGB").save(ruta)

print("Íconos y splash generados")
