"""Render the BhuDrishti app icon, adaptive-icon foreground and splash into mobile/assets.

Run: python scripts/render_app_icons.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "mobile" / "assets"
BG = (13, 20, 19)
TEAL = (45, 212, 191)
SNOW = (226, 240, 236)
RIDGE = (30, 58, 54)


def mark(size: int, pad: float) -> Image.Image:
    """Transparent mark: a snow-capped peak with a seismic trace across its foot."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size * (1 - 2 * pad)
    ox = oy = size * pad

    def p(x, y):
        return (ox + x * s, oy + y * s)

    d.polygon([p(0.05, 0.72), p(0.38, 0.18), p(0.55, 0.42), p(0.68, 0.30), p(0.95, 0.72)], fill=RIDGE)
    d.polygon([p(0.29, 0.33), p(0.38, 0.18), p(0.47, 0.31), p(0.42, 0.29), p(0.38, 0.34), p(0.34, 0.30)], fill=SNOW)
    d.polygon([p(0.63, 0.37), p(0.68, 0.30), p(0.74, 0.38), p(0.68, 0.36)], fill=SNOW)
    pts = []
    for i in range(121):
        x = i / 120
        env = math.exp(-((x - 0.5) ** 2) / 0.018)
        y = 0.72 - 0.16 * env * math.sin(x * 2 * math.pi * 7)
        pts.append(p(0.02 + x * 0.96, y))
    d.line(pts, fill=TEAL, width=max(2, int(size * 0.035)), joint="curve")
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    icon = Image.new("RGBA", (1024, 1024), BG + (255,))
    icon.alpha_composite(mark(1024, 0.12))
    icon.convert("RGB").save(OUT / "icon.png")
    # Adaptive icons are cropped to a circle/squircle: keep the mark in the inner 66%.
    mark(1024, 0.22).save(OUT / "adaptive-icon.png")
    mark(600, 0.05).save(OUT / "splash.png")
    print("wrote", sorted(x.name for x in OUT.glob("*.png")))


if __name__ == "__main__":
    main()
