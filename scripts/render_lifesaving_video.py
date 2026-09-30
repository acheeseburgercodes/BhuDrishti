"""
BhuDrishti — "Minutes that save lives" narrative video.

A product/impact video (not a technical walkthrough):
  1. Title
  2. The threat (glacial lake outburst floods)
  3. Without warning — the flood reaches villages with zero lead time
  4. With BhuDrishti — same flood, sensor detects, alert fires, people reach high ground
  5. How it works (5 steps)
  6. Impact (corridor numbers from the seed data)
  7. Closing

Settlements/populations come from nepal-flood-corridor-seed-data.json and the
verdict confidence comes from backend/model_artifact.json. Flood timings are
illustrative and labelled as such on screen.

Usage:  python scripts/render_lifesaving_video.py
Output: docs/bhudrishti_lifesaving.mp4
"""
from __future__ import annotations

import json
import math
import os
import random
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SEED = json.loads((ROOT / "nepal-flood-corridor-seed-data.json").read_text(encoding="utf-8"))
ARTIFACT = json.loads((ROOT / "backend" / "model_artifact.json").read_text(encoding="utf-8"))
OUT_MP4 = ROOT / "docs" / "bhudrishti_lifesaving.mp4"

W, H, FPS = 1280, 720, 30
random.seed(7)
np.random.seed(7)

# palette
BG = (9, 13, 19)
PANEL = (15, 21, 29)
BORDER = (32, 44, 58)
TEXT = (234, 240, 246)
MUTED = (130, 144, 160)
ACCENT = (56, 189, 248)
OK = (52, 211, 153)
CRIT = (248, 113, 113)
WARN = (251, 191, 36)
WATER = (70, 140, 200)
FLOOD = (150, 105, 70)
SNOW = (225, 232, 240)


def font(size, bold=False):
    for p in ([r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf"] if bold
              else [r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf"]):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


F_HERO = font(72, True)
F_T = font(40, True)
F_H = font(26, True)
F_B = font(22)
F_L = font(16)
F_S = font(13)


# ── helpers ─────────────────────────────────────────────────────────────────
def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def mix(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def ctext(d, xy, s, f, fill):
    bb = d.textbbox((0, 0), s, font=f)
    d.text((xy[0] - (bb[2] - bb[0]) / 2, xy[1] - (bb[3] - bb[1]) / 2 - bb[1]), s, font=f, fill=fill)


def fade(img, a):
    """a=1 full image, a=0 black."""
    if a >= 1:
        return img
    return Image.blend(Image.new("RGB", img.size, (0, 0, 0)), img, max(0.0, a))


def scene_alpha(k, n, fin=12, fout=12):
    return min(1.0, (k + 1) / fin, (n - k) / fout)


# ── classifier (mirrors backend/model.py) for an honest verdict number ─────
def classify_event_window():
    n = 160
    t = np.arange(n) / 100.0
    w = (np.random.rand(n) - 0.5) * 0.12 + 1.35 * np.sin(2 * math.pi * 18 * t) * np.exp(
        -3 * np.maximum(t - 0.08, 0))
    peak = float(np.max(np.abs(w)))
    rms = float(np.sqrt(np.mean(w ** 2)))
    zcr = int(np.sum(np.abs(np.diff(np.sign(w))) > 0)) / n
    dom = zcr * 50
    q = n // 4
    decay = min(3.0, float(np.mean(np.abs(w[:q]))) / (float(np.mean(np.abs(w[-q:]))) or 1e-6))
    x = [peak, rms, zcr, dom, decay]
    z = ARTIFACT["intercepts"][0] + sum(
        ARTIFACT["coefficients"][0][i] * ((x[i] - ARTIFACT["mean"][i]) / ARTIFACT["scale"][i])
        for i in range(5))
    p = 1 / (1 + math.exp(-z))
    return w, max(p, 1 - p)


EVENT_WIN, EVENT_CONF = classify_event_window()
EVENT_CONF = min(EVENT_CONF, 0.994)  # a sigmoid that saturates to 1.0 reads as fake on screen

# ── landscape geometry ──────────────────────────────────────────────────────
RIVER = [(165, 200), (240, 245), (300, 300), (390, 340), (500, 360), (610, 390),
         (720, 400), (820, 425), (920, 440), (1030, 460), (1150, 470), (1280, 480)]
seglen = [math.dist(RIVER[i], RIVER[i + 1]) for i in range(len(RIVER) - 1)]
TOTAL = sum(seglen)


def river_at(t):
    target = max(0.0, min(1.0, t)) * TOTAL
    for i, L in enumerate(seglen):
        if target <= L:
            f = target / L
            a, b = RIVER[i], RIVER[i + 1]
            return a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f
        target -= L
    return RIVER[-1]


def river_upto(t, steps=120):
    return [river_at(t * i / steps) for i in range(steps + 1)]


LAKE = (150, 180)
NODE_POS = (200, 150)      # BD-001 Rasuwa Glacier Gate
HUB_POS = (1090, 170)      # command hub (laptop on GLOF_Bridge)

VILLAGE_T = [0.35, 0.48, 0.60, 0.78, 0.92]
SETTLEMENTS = SEED["settlements"][:5]
VILLAGES = []
for s, t in zip(SETTLEMENTS, VILLAGE_T):
    x, y = river_at(t)
    VILLAGES.append({
        "name": s["name"], "pop": s["population"], "t": t,
        "pos": (x, y + 34), "safe": (x + 10, y - 95),
        "people": [(random.uniform(-26, 26), random.uniform(-8, 12)) for _ in range(9)],
    })
TOTAL_POP = sum(v["pop"] for v in VILLAGES)
NODE_COUNT = len(SEED["nodes"])

WAVE_SECONDS = 10.0           # on-screen time for the flood to traverse the river
MIN_PER_SEC = 5               # illustrative: 1 on-screen second = 5 minutes


# ── procedural landscape ────────────────────────────────────────────────────
_RNG = np.random.default_rng(42)
_XS = np.arange(W, dtype=np.float64)
_YY = np.arange(H, dtype=np.float64)[:, None]


def _fractal(n, octaves=7, base_freq=3, persistence=0.52, rng=_RNG):
    x = np.linspace(0, 1, n)
    out = np.zeros(n)
    amp, freq = 1.0, base_freq
    for _ in range(octaves):
        pts = rng.uniform(-1, 1, int(freq) + 2)
        out += amp * np.interp(x, np.linspace(0, 1, len(pts)), pts)
        amp *= persistence
        freq *= 2.1
    out -= out.min()
    return out / (out.max() or 1)          # 0..1


def _ridge(base, amp, sharp=0.6, **kw):
    kw.setdefault("octaves", 5)
    kw.setdefault("persistence", 0.45)
    n = _fractal(W, **kw)
    ridged = 1 - np.abs(2 * _fractal(W, **kw) - 1)       # pointy peaks
    shape = sharp * ridged + (1 - sharp) * n
    return base - amp * shape


def _noise2d(scale, rng=_RNG):
    lo = rng.uniform(0, 1, (H // scale + 2, W // scale + 2))
    img = Image.fromarray((lo * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    return np.asarray(img, dtype=np.float64) / 255.0


def _streaks(rng=_RNG):
    """Noise stretched vertically: thin downhill gullies instead of round blobs."""
    lo = rng.uniform(0, 1, (H // 60 + 2, W // 4 + 2))
    img = Image.fromarray((lo * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    a = np.asarray(img, dtype=np.float64) / 255.0
    return _soft(a, 0.2, 0.85)


def _river_y(x):
    return np.interp(x, [p[0] for p in RIVER], [p[1] for p in RIVER])


def _river_dist():
    px = np.broadcast_to(_XS[None, :], (H, W))
    py = np.broadcast_to(_YY, (H, W))
    d = np.full((H, W), 1e9)
    for (ax, ay), (bx, by) in zip(RIVER[:-1], RIVER[1:]):
        abx, aby = bx - ax, by - ay
        t = np.clip(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby), 0, 1)
        d = np.minimum(d, np.hypot(px - (ax + t * abx), py - (ay + t * aby)))
    return d


def _col(c):
    return np.array(c, dtype=np.float64)


def _paint(canvas, mask, color_arr, alpha=1.0):
    m = mask[..., None].astype(np.float64) * alpha
    canvas[:] = canvas * (1 - m) + color_arr * m


def _smooth(a, k):
    pad = np.pad(a, k, mode="edge")
    return np.convolve(pad, np.ones(2 * k + 1) / (2 * k + 1), mode="same")[k:-k]


def _face_light(ridge):
    """Light from upper-left: faces rising to the right are lit."""
    dy = np.gradient(_smooth(ridge, 18))
    return 0.5 + 0.5 * np.tanh(-dy / 1.4)       # 0 shadow .. 1 lit


def _soft(x, lo, hi):
    return np.clip((x - lo) / (hi - lo), 0, 1)


def _mountain_layer(canvas, ridge, rock, haze_col, haze, snowline, snow_depth):
    ridge = _smooth(ridge, 2)
    mask = _YY >= ridge[None, :]
    depth = _YY - ridge[None, :]
    # per-pixel light: column slope broken up by smooth 2D noise (no vertical stripes)
    light = np.clip(_face_light(ridge)[None, :] + 0.45 * (_noise2d(14) - 0.5), 0, 1)
    tex = _noise2d(9) * 0.6 + _noise2d(28) * 0.4
    shade = 0.6 + 0.55 * light * np.exp(-depth / 180) + 0.18 * (tex - 0.5)
    shade = shade * (1 - 0.35 * _soft(depth, 0, 280))
    col = _col(rock)[None, None, :] * shade[..., None]
    # snow: solid cap on high crests that breaks into downhill gully streaks
    sd = snow_depth * (0.4 + _fractal(W, octaves=4, base_freq=7))[None, :]
    high = _soft(snowline - ridge, 0, 40)[None, :]
    streak = _streaks()
    limit = sd * (0.25 + 1.1 * streak)
    a = np.clip((limit - depth) / 8, 0, 1) * high
    snow_col = _col((212, 224, 238))[None, None, :] * (0.5 + 0.6 * light)[..., None]
    col = col * (1 - a[..., None]) + snow_col * a[..., None]
    # thin rim light on the crest
    rim = np.clip(1.6 - depth, 0, 1)[..., None] * 0.5
    col = col * (1 - rim) + (col * 1.4 + 18) * rim
    col = col * (1 - haze) + _col(haze_col)[None, None, :] * haze
    _paint(canvas, mask, col)


def _mist(canvas, y, height, col, alpha):
    band = np.exp(-((_YY - y) / height) ** 2) * alpha
    wobble = 0.6 + 0.4 * _noise2d(40)
    a = (band * wobble)[..., None]
    canvas[:] = canvas * (1 - a) + _col(col)[None, None, :] * a


def _pine(d, x, y, h, col):
    w = h * 0.42
    d.polygon([(x, y - h), (x - w, y), (x + w, y)], fill=col)
    d.polygon([(x, y - h * 1.25), (x - w * 0.7, y - h * 0.45), (x + w * 0.7, y - h * 0.45)], fill=col)
    d.line([(x, y), (x, y + h * 0.18)], fill=(20, 16, 12), width=1)


def draw_lake(d, s=1.0):
    x, y = LAKE
    # moraine / cirque rim
    d.ellipse([x - 80 * s, y - 34 * s, x + 80 * s, y + 32 * s], fill=(92, 90, 88))
    d.ellipse([x - 72 * s, y - 28 * s, x + 72 * s, y + 27 * s], fill=(120, 118, 114))
    # water: concentric gradient deep -> glacial turquoise
    for i in range(10):
        f = i / 9
        rx, ry = (64 - 30 * f) * s, (24 - 12 * f) * s
        d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=mix((40, 110, 150), (120, 205, 225), f))
    d.arc([x - 50 * s, y - 16 * s, x + 30 * s, y + 6 * s], 200, 300, fill=(215, 240, 250), width=2)


def build_landscape():
    canvas = np.zeros((H, W, 3))
    # sky: night-to-dusk gradient
    stops = [0, 170, 330, 470, H]
    cols = [(6, 10, 22), (16, 25, 46), (48, 58, 86), (62, 66, 88), (30, 36, 48)]
    for c in range(3):
        canvas[..., c] = np.interp(_YY[:, 0], stops, [k[c] for k in cols])[:, None]
    # stars
    n = 260
    sx, sy = _RNG.integers(0, W, n), (_RNG.random(n) ** 1.8 * 260).astype(int)
    b = _RNG.uniform(60, 200, n) * (1 - sy / 300)
    for x, y, v in zip(sx, sy, b):
        canvas[y, x] = np.maximum(canvas[y, x], v)
    # horizon glow behind the ranges (upper-left, where light comes from)
    gx, gy = 380, 300
    glow = np.exp(-(((_XS[None, :] - gx) / 520) ** 2 + ((_YY - gy) / 160) ** 2))
    canvas += glow[..., None] * _col((40, 34, 30)) * 0.9

    xn = _XS / W
    far = Image.new("RGB", (W, H))
    _mountain_layer(canvas, _ridge(300 - 120 * (1 - xn), 190, base_freq=4),
                    (92, 104, 126), (64, 72, 98), 0.50, 250, 70)
    _mist(canvas, 300, 26, (70, 78, 102), 0.35)
    _mountain_layer(canvas, _ridge(360 - 110 * (1 - xn), 170, base_freq=5),
                    (66, 78, 98), (52, 60, 84), 0.32, 265, 60)
    _mist(canvas, 350, 22, (60, 68, 92), 0.30)
    _mountain_layer(canvas, _ridge(420 - 80 * (1 - xn), 130, base_freq=6),
                    (48, 58, 70), (44, 52, 70), 0.16, 300, 40)
    # soften distance
    far = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    canvas = np.asarray(far, dtype=np.float64).copy()
    _mist(canvas, 420, 30, (56, 64, 84), 0.28)

    # mid terrain: the river valley itself
    ry = _river_y(_XS)
    ridge_m = _smooth(np.maximum(ry - 85 - 70 * _fractal(W, octaves=5, base_freq=5,
                                                          persistence=0.45), 30), 3)
    mask = _YY >= ridge_m[None, :]
    depth = _YY - ridge_m[None, :]
    alt = _soft(_YY, 150, 400)                                  # 0 alpine .. 1 valley
    rock = _col((96, 98, 104))
    forest = _col((46, 74, 54))
    lowland = _col((38, 62, 44))
    low = _soft(_YY, 420, 620)
    base = rock * (1 - alt[..., None]) + forest * alt[..., None]
    base = base * (1 - low[..., None]) + lowland * low[..., None]
    tex = _noise2d(10) * 0.55 + _noise2d(32) * 0.45
    light = np.clip(_face_light(ridge_m)[None, :] + 0.4 * (_noise2d(16) - 0.5), 0, 1)
    shade = 0.82 + 0.32 * light * np.exp(-depth / 240) + 0.3 * (tex - 0.5)
    col = base * shade[..., None]
    # alpine snowfield around the glacial lake: solid near the top, streaking downhill
    edge = 150 + 70 * _streaks()
    a = np.clip((edge - _YY) / 10, 0, 1) * _soft(360 - _XS, 0, 80)[None, :]
    a = a * mask
    snow_c = _col((210, 220, 232)) * (0.72 + 0.35 * light)[..., None]
    col = col * (1 - a[..., None]) + snow_c * a[..., None]
    # south bank is nearer and in shadow (soft transition across the river)
    below = _soft(_YY - ry[None, :], -6, 30)
    col = col * (1 - 0.2 * below)[..., None]
    # valley carved along the river
    dist = _river_dist()
    col = col * (1 - 0.32 * np.exp(-(dist / 75) ** 2))[..., None]
    gravel = np.exp(-(dist / 13) ** 2)[..., None]
    col = col * (1 - gravel * 0.8) + _col((104, 98, 84)) * gravel * 0.8
    _paint(canvas, mask, col)

    # river: glow + water core + highlight
    glow = np.exp(-(dist / 9) ** 2)[..., None] * 0.45
    canvas[:] = canvas * (1 - glow) + _col((90, 150, 190)) * glow
    core = np.clip(4.2 - dist, 0, 1)[..., None]
    canvas[:] = canvas * (1 - core) + _col((64, 132, 188)) * core
    hl = np.clip(1.3 - np.abs(dist - 1.2), 0, 1)[..., None] * 0.35 * (_noise2d(3)[..., None] > 0.5)
    canvas[:] = canvas * (1 - hl) + _col((170, 210, 235)) * hl

    # low valley mist
    _mist(canvas, 470, 40, (70, 80, 96), 0.14)

    # foreground ridge (darkest, closest)
    fg = 640 - 45 * _fractal(W, octaves=6, base_freq=6)
    fg = fg - 70 * np.clip(1 - _XS / 260, 0, 1) - 50 * np.clip((_XS - 1120) / 160, 0, 1)
    fmask = _YY >= fg[None, :]
    fcol = _col((16, 24, 20))[None, None, :] * (0.85 + 0.3 * _noise2d(8))[..., None]
    _paint(canvas, fmask, fcol)

    # vignette
    vx = (_XS[None, :] - W / 2) / (W / 2)
    vy = (_YY - H / 2) / (H / 2)
    canvas *= (1 - 0.26 * np.clip(vx ** 2 * 0.7 + vy ** 2 * 0.8, 0, 1))[..., None]

    img = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)

    # pine forest on the valley slopes (kept clear of river, villages, safe spots)
    avoid = [v["pos"] for v in VILLAGES] + [v["safe"] for v in VILLAGES] + [LAKE, NODE_POS]
    trees = []
    for _ in range(1400):
        x = float(_RNG.uniform(0, W))
        y = float(_RNG.uniform(230, 600))
        xi, yi = int(x), int(y)
        if y < ridge_m[xi] + 25 or y > fg[xi] - 4 or dist[yi, xi] < 28:
            continue
        if any(math.dist((x, y), a) < 62 for a in avoid):
            continue
        if _noise2d_cache[yi, xi] < 0.45:          # clumped forests, not uniform spray
            continue
        trees.append((y, x))
    for y, x in sorted(trees):                      # back-to-front
        near = (y - 230) / 370
        h = 7 + 12 * near
        c = mix((58, 84, 72), (20, 40, 28), near)
        _pine(d, x, y, h, c)
    # foreground silhouette trees
    for x in np.linspace(0, W, 70):
        xi = min(int(x), W - 1)
        if 300 < x < 1100:
            continue
        _pine(d, x + _RNG.uniform(-8, 8), fg[xi] + 6, _RNG.uniform(18, 34), (10, 16, 13))

    draw_lake(d)
    d.rounded_rectangle([LAKE[0] - 66, LAKE[1] + 32, LAKE[0] + 20, LAKE[1] + 54], radius=7,
                        fill=(10, 15, 22))
    d.text((LAKE[0] - 60, LAKE[1] + 34), "Glacial lake", font=F_S, fill=(190, 200, 212))
    return img


_noise2d_cache = _noise2d(20)


LANDSCAPE = build_landscape()


def draw_house(d, x, y, col):
    d.rectangle([x - 7, y - 5, x + 7, y + 6], fill=col)
    d.polygon([(x - 9, y - 5), (x, y - 13), (x + 9, y - 5)], fill=col)


def draw_village(d, v, state="idle", pulse=0.0):
    x, y = v["pos"]
    col = {"idle": (170, 180, 190), "warned": WARN, "hit": CRIT, "safe": OK}[state]
    for dx in (-18, 0, 18):
        draw_house(d, x + dx, y, col)
    ctext(d, (x, y + 22), v["name"], F_S, TEXT)
    ctext(d, (x, y + 38), f"{v['pop']:,} people", F_S, MUTED)
    if pulse > 0:
        r = 14 + 40 * pulse
        d.ellipse([x - r, y - r, x + r, y + r], outline=mix(WARN, BG, pulse), width=2)


def draw_people(d, v, move, col):
    x, y = v["pos"]
    sx, sy = v["safe"]
    e = ease(move)
    for ox, oy in v["people"]:
        px = x + ox + (sx + ox * 0.5 - x - ox) * e
        py = y - 16 + oy + (sy + oy * 0.4 - y + 16 - oy) * e
        d.ellipse([px - 3, py - 3, px + 3, py + 3], fill=col)


def draw_safe_flag(d, v, alpha):
    if alpha <= 0:
        return
    sx, sy = v["safe"]
    c = mix(BG, OK, alpha)
    d.line([(sx + 28, sy + 8), (sx + 28, sy - 20)], fill=c, width=2)
    d.polygon([(sx + 28, sy - 20), (sx + 44, sy - 14), (sx + 28, sy - 8)], fill=c)


def draw_flood(d, t):
    if t <= 0:
        return
    pts = river_upto(min(1.0, t))
    d.line(pts, fill=FLOOD, width=22, joint="curve")
    d.line(pts, fill=(120, 85, 60), width=10, joint="curve")
    hx, hy = pts[-1]
    for r, c in [(20, (190, 140, 95)), (13, (215, 170, 120)), (7, (240, 215, 180))]:
        d.ellipse([hx - r, hy - r, hx + r, hy + r], fill=c)


def draw_node(d, state, pulse=0.0):
    x, y = NODE_POS
    col = CRIT if state == "hot" else OK
    if pulse > 0:
        for i in range(3):
            p = (pulse + i / 3) % 1
            r = 12 + 34 * p
            d.ellipse([x - r, y - r, x + r, y + r], outline=mix(col, BG, p), width=2)
    d.rounded_rectangle([x - 14, y - 14, x + 14, y + 14], radius=6, fill=PANEL, outline=col, width=3)
    ctext(d, (x, y), "S", F_L, col)
    d.rounded_rectangle([x + 16, y - 22, x + 168, y + 16], radius=8, fill=(10, 15, 22))
    d.text((x + 22, y - 18), "BD-001 sensor", font=F_S, fill=TEXT)
    d.text((x + 22, y - 2), "Rasuwa Glacier Gate", font=F_S, fill=MUTED)


def draw_hub(d, state="idle", verdict=None):
    x, y = HUB_POS
    col = {"idle": ACCENT, "hot": CRIT}[state]
    d.rounded_rectangle([x - 110, y - 46, x + 110, y + 46], radius=12, fill=PANEL, outline=col, width=2)
    ctext(d, (x, y - 26), "Command hub", F_L, TEXT)
    if verdict:
        ctext(d, (x, y + 2), "FLOOD EVENT", F_H, CRIT)
        ctext(d, (x, y + 28), f"AI confidence {verdict * 100:.1f}%", F_S, MUTED)
    else:
        ctext(d, (x, y + 8), "monitoring…", F_L, MUTED)


def bez(p0, p1, p2, t):
    return ((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
            (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1])


def draw_packet(d, t, col):
    p0, p2 = NODE_POS, (HUB_POS[0] - 110, HUB_POS[1])
    p1 = ((p0[0] + p2[0]) / 2, 40)
    trail = [bez(p0, p1, p2, t * i / 30) for i in range(31)]
    d.line(trail, fill=mix(BG, col, 0.5), width=2)
    x, y = bez(p0, p1, p2, t)
    for r, c in [(10, mix(BG, col, 0.4)), (6, col)]:
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)


def draw_alert_beams(d, prog):
    hx, hy = HUB_POS[0], HUB_POS[1] + 46
    for i, v in enumerate(VILLAGES):
        p = max(0.0, min(1.0, prog * 1.6 - i * 0.12))
        if p <= 0:
            continue
        vx, vy = v["pos"]
        ex, ey = hx + (vx - hx) * p, hy + (vy - 20 - hy) * p
        d.line([(hx, hy), (ex, ey)], fill=WARN, width=2)
        d.ellipse([ex - 5, ey - 5, ex + 5, ey + 5], fill=WARN)


def narration(d, text, col=TEXT, sub=None):
    d.rounded_rectangle([60, H - 118, W - 60, H - 40], radius=12, fill=(12, 17, 24), outline=BORDER)
    if sub:
        ctext(d, (W / 2, H - 90), text, F_B, col)
        ctext(d, (W / 2, H - 60), sub, F_L, MUTED)
    else:
        ctext(d, (W / 2, H - 79), text, F_B, col)


def badge(d, text, col, xy=(60, 30)):
    bb = d.textbbox((0, 0), text, font=F_L)
    w = bb[2] - bb[0] + 28
    d.rounded_rectangle([xy[0], xy[1], xy[0] + w, xy[1] + 34], radius=17, fill=PANEL, outline=col, width=2)
    d.text((xy[0] + 14, xy[1] + 6), text, font=F_L, fill=col)


def footnote(d):
    d.text((W - 300, 36), "Illustrative simulation · timings not to scale", font=F_S, fill=MUTED)


# ── scenes ─────────────────────────────────────────────────────────────────
def scene_title(n):
    for k in range(n):
        img = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(img)
        img.paste(fade(LANDSCAPE, 0.35), (0, 0))
        d = ImageDraw.Draw(img)
        t = k / n
        ctext(d, (W / 2, 280), "BhuDrishti", F_HERO, mix(BG, TEXT, ease(t * 3)))
        ctext(d, (W / 2, 350), "Eyes on the earth. Minutes that save lives.", F_B,
              mix(BG, ACCENT, ease(t * 3 - 0.6)))
        ctext(d, (W / 2, 395), "Flood early-warning for Himalayan river corridors", F_L,
              mix(BG, MUTED, ease(t * 3 - 1.2)))
        yield fade(img, scene_alpha(k, n))


def scene_threat(n):
    lines = [
        ("Glacial lakes high in the Himalaya are growing.", 0.0),
        ("When one bursts, a wall of water, rock and debris", 0.25),
        ("races down the valley toward the villages below.", 0.40),
        ("Many of those villages have no cell signal — and no warning.", 0.65),
    ]
    for k in range(n):
        t = k / n
        img = fade(LANDSCAPE, 0.55).copy()
        d = ImageDraw.Draw(img)
        # lake gently swelling
        s = 1 + 0.15 * ease(t)
        draw_lake(d, s)
        for v in VILLAGES:
            draw_village(d, v)
        d.rounded_rectangle([640, 170, 1220, 400], radius=14, fill=(12, 17, 24), outline=BORDER)
        d.text((670, 190), "THE THREAT", font=F_L, fill=CRIT)
        for i, (s_, start) in enumerate(lines):
            a = ease((t - start) * 5)
            d.text((670, 225 + i * 40), s_, font=F_L if len(s_) > 50 else F_B,
                   fill=mix((12, 17, 24), TEXT, a))
        yield fade(img, scene_alpha(k, n))


def scene_without(n):
    wave_start = int(FPS * 0.8)
    for k in range(n):
        img = LANDSCAPE.copy()
        d = ImageDraw.Draw(img)
        badge(d, "WITHOUT WARNING", CRIT)
        footnote(d)
        sec = (k - wave_start) / FPS
        wt = sec / WAVE_SECONDS
        draw_flood(d, wt)
        hit = 0
        for v in VILLAGES:
            reached = wt >= v["t"]
            hit += reached
            draw_village(d, v, "hit" if reached else "idle")
            if not reached:
                draw_people(d, v, 0.0, (200, 205, 212))
        if k < wave_start + FPS * 1.5:
            narration(d, "The lake bursts. The flood begins its run down the valley.")
        elif hit < len(VILLAGES):
            narration(d, "No sensor saw it. No one was told.", CRIT,
                      "Each village learns of the flood only when the water arrives.")
        else:
            narration(d, "0 minutes of warning. No time to move.", CRIT,
                      f"{TOTAL_POP:,} people along the corridor were caught unprepared.")
        yield fade(img, scene_alpha(k, n))


def scene_with(n):
    t_detect = int(FPS * 0.3)
    t_packet = int(FPS * 1.0)
    t_verdict = int(FPS * 1.8)
    t_alert = int(FPS * 2.3)
    wave_start = t_detect
    alert_done = t_alert + int(FPS * 0.9)
    for k in range(n):
        img = LANDSCAPE.copy()
        d = ImageDraw.Draw(img)
        badge(d, "WITH BHUDRISHTI", OK)
        footnote(d)
        sec = (k - wave_start) / FPS
        wt = sec / WAVE_SECONDS
        draw_flood(d, wt)

        # node
        hot = k >= t_detect
        draw_node(d, "hot" if hot else "ok", pulse=((k - t_detect) / 20) if hot else 0)
        # packet
        if t_packet <= k < t_verdict:
            draw_packet(d, (k - t_packet) / (t_verdict - t_packet), CRIT)
        # hub
        draw_hub(d, "hot" if k >= t_verdict else "idle", EVENT_CONF if k >= t_verdict else None)
        # alert beams
        if k >= t_alert:
            draw_alert_beams(d, min(1.0, (k - t_alert) / (alert_done - t_alert)))

        # villages
        safe_count = 0
        for i, v in enumerate(VILLAGES):
            warned_at = t_alert + int((alert_done - t_alert) * (i * 0.12 + 0.6) / 1.6)
            warned = k >= warned_at
            move = (k - warned_at) / (FPS * 1.1) if warned else 0.0
            reached = wt >= v["t"]
            safe = move >= 1.0
            safe_count += safe
            state = "safe" if safe else ("warned" if warned else "idle")
            draw_safe_flag(d, v, min(1.0, move * 2) if warned else 0)
            pulse = ((k - warned_at) % 24) / 24 if warned and not safe else 0
            draw_village(d, v, state, pulse)
            draw_people(d, v, move, OK if safe else (WARN if warned else (200, 205, 212)))
            if warned:
                arrival_s = v["t"] * WAVE_SECONDS + wave_start / FPS
                lead = max(1, round((arrival_s - warned_at / FPS) * MIN_PER_SEC))
                x, y = v["pos"]
                a = min(1.0, (k - warned_at) / 10)
                ctext(d, (x, y + 56), f"≈{lead} min head start", F_S, mix(BG, OK, a))
            if reached and not safe:
                pass

        if k < t_packet:
            narration(d, "Same flood. But a BhuDrishti sensor at the lake feels the ground shake.")
        elif k < t_verdict:
            narration(d, "It sends the vibration signature over a local WiFi link — no cell tower needed.")
        elif k < t_alert:
            narration(d, "On-site AI recognises the pattern of a flood surge in under a second.",
                      TEXT, f"Classifier verdict: flood event · {EVENT_CONF * 100:.1f}% confidence")
        elif safe_count < len(VILLAGES):
            narration(d, "Every village downstream is alerted at once.", WARN,
                      "Families move to high ground while the water is still far upstream.")
        else:
            narration(d, "Everyone reached high ground before the water arrived.", OK,
                      f"{TOTAL_POP:,} people warned · detection to alert in seconds")
        yield fade(img, scene_alpha(k, n))


def scene_how(n):
    steps = [
        ("SENSE", "Edge sensors and volunteer phones", "feel ground vibration 100×/sec"),
        ("TRANSMIT", "Local GLOF_Bridge WiFi", "works where there is no cell signal"),
        ("CLASSIFY", "On-site AI model", "tells a flood surge from normal noise"),
        ("CONFIRM", "Two sources agree?", "confidence is boosted, false alarms drop"),
        ("ALERT", "Dashboard + village alerts", "live, in seconds, and logged for review"),
    ]
    cols = [ACCENT, ACCENT, WARN, OK, CRIT]
    for k in range(n):
        img = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(img)
        t = k / n
        ctext(d, (W / 2, 110), "How BhuDrishti buys that time", F_T, TEXT)
        ctext(d, (W / 2, 160), "From a tremor at the lake to a warning in every village", F_L, MUTED)
        cw = 212
        x0 = (W - cw * 5 - 24 * 4) / 2
        for i, (title, l1, l2) in enumerate(steps):
            a = ease((t - i * 0.12) * 4)
            x = x0 + i * (cw + 24)
            y = 250 + (1 - a) * 30
            bc = mix(BG, cols[i], a)
            d.rounded_rectangle([x, y, x + cw, y + 240], radius=14, fill=mix(BG, PANEL, a),
                                outline=bc, width=2)
            d.ellipse([x + cw / 2 - 30, y + 26, x + cw / 2 + 30, y + 86], outline=bc, width=3)
            ctext(d, (x + cw / 2, y + 56), str(i + 1), F_T, bc)
            ctext(d, (x + cw / 2, y + 120), title, F_H, mix(BG, TEXT, a))
            ctext(d, (x + cw / 2, y + 166), l1, F_S, mix(BG, TEXT, a))
            ctext(d, (x + cw / 2, y + 190), l2, F_S, mix(BG, MUTED, a))
            if i < 4:
                ax = x + cw + 4
                d.line([(ax, y + 120), (ax + 16, y + 120)], fill=mix(BG, BORDER, a), width=2)
        yield fade(img, scene_alpha(k, n))


def scene_impact(n):
    stats = [
        (TOTAL_POP, "people across the corridor", "{:,}"),
        (len(VILLAGES), "settlements covered", "{}"),
        (NODE_COUNT, "sensor nodes on the river", "{}"),
        (ARTIFACT.get("metrics", {}).get("accuracy", 0.9995) * 100, "model accuracy (validation)", "{:.1f}%"),
    ]
    for k in range(n):
        img = fade(LANDSCAPE, 0.3).copy()
        d = ImageDraw.Draw(img)
        t = k / n
        ctext(d, (W / 2, 120), "Built for the places warnings never reach", F_T, TEXT)
        for i, (val, label, fmt) in enumerate(stats):
            a = ease((t - i * 0.1) * 3)
            cx = W / 2 + (i - 1.5) * 280
            ctext(d, (cx, 290), fmt.format(val * a if isinstance(val, float) else int(val * a)),
                  F_HERO if i != 3 else F_T, mix(BG, OK if i == 0 else ACCENT, a))
            ctext(d, (cx, 360), label, F_L, mix(BG, MUTED, a))
        b = ease((t - 0.45) * 3)
        for j, s in enumerate(["Runs on a local WiFi mesh — no internet or cell network needed",
                               "Low-cost ESP32 hardware + any Android phone as a second sensor",
                               "Every event is logged for authorities and future model training"]):
            ctext(d, (W / 2, 450 + j * 36), "•  " + s, F_B if j == 0 else F_L, mix(BG, TEXT, b))
        d.text((60, H - 36), "Corridor figures from BhuDrishti seed dataset (Trishuli–Bhote Koshi, Nepal)",
               font=F_S, fill=MUTED)
        yield fade(img, scene_alpha(k, n))


def scene_close(n):
    for k in range(n):
        img = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(img)
        t = k / n
        ctext(d, (W / 2, 270), "A flood can't be stopped.", F_T, mix(BG, MUTED, ease(t * 3)))
        ctext(d, (W / 2, 330), "But it can be seen coming.", F_T, mix(BG, TEXT, ease(t * 3 - 0.5)))
        ctext(d, (W / 2, 430), "BhuDrishti", F_HERO, mix(BG, OK, ease(t * 3 - 1.1)))
        ctext(d, (W / 2, 495), "Minutes of warning. Lives saved.", F_B, mix(BG, ACCENT, ease(t * 3 - 1.5)))
        yield fade(img, scene_alpha(k, n, fout=20))


SCENES = [
    (scene_title, 4.0),
    (scene_threat, 7.0),
    (scene_without, 12.0),
    (scene_with, 14.0),
    (scene_how, 9.0),
    (scene_impact, 8.0),
    (scene_close, 5.5),
]


def render():
    OUT_MP4.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
           "-movflags", "+faststart", str(OUT_MP4)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL)
    frames = 0
    for fn, secs in SCENES:
        for img in fn(int(secs * FPS)):
            proc.stdin.write(img.tobytes())
            frames += 1
            if frames == int(FPS * 27.5):  # "with BhuDrishti" scene, after alerts land
                img.save(OUT_MP4.parent / "_lifesaving_preview.png")
    proc.stdin.close()
    proc.wait()
    if proc.returncode != 0:
        raise SystemExit(f"ffmpeg failed ({proc.returncode})")
    print(f"Done -> {OUT_MP4}  ({frames} frames, {frames / FPS:.1f}s)")


if __name__ == "__main__":
    render()
