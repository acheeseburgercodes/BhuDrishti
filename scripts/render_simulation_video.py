"""
BhuDrishti — Simulation video renderer.

Renders the end-to-end early-warning data flow as an MP4:
  Edge detection (ESP32 / phone) -> WiFi transmit -> FastAPI classify
  -> Supabase persist + WebSocket broadcast -> Dashboard alert.

Frames are drawn with Pillow and encoded with ffmpeg. Signal windows and the
classifier weights mirror backend/model_artifact.json so the on-screen waveform
and verdict match the real system.

Usage:
    python scripts/render_simulation_video.py
Output:
    docs/bhudrishti_simulation.mp4
"""
from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ARTIFACT = json.loads((ROOT / "backend" / "model_artifact.json").read_text(encoding="utf-8"))
OUT_DIR = ROOT / "docs"
FRAME_DIR = OUT_DIR / "_frames"
OUT_MP4 = OUT_DIR / "bhudrishti_simulation.mp4"

W, H = 1280, 720
FPS = 30

# palette
BG = (11, 15, 20)
PANEL = (18, 24, 32)
PANEL2 = (14, 20, 27)
BORDER = (30, 42, 54)
TEXT = (230, 237, 243)
MUTED = (125, 139, 153)
ACCENT = (56, 189, 248)
ESP = (45, 212, 191)
PHONE = (96, 165, 250)
OK = (52, 211, 153)
CRIT = (248, 113, 113)
WARN = (251, 191, 36)


def load_font(size, bold=False):
    candidates = [
        r"C:\Windows\Fonts\segoeui.ttf" if not bold else r"C:\Windows\Fonts\segoeuib.ttf",
        r"C:\Windows\Fonts\arial.ttf" if not bold else r"C:\Windows\Fonts\arialbd.ttf",
    ]
    for c in candidates:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


F_TITLE = load_font(34, bold=True)
F_H = load_font(20, bold=True)
F_LBL = load_font(15)
F_SMALL = load_font(13)
F_BIG = load_font(46, bold=True)
F_ICON = load_font(40)


# ── classifier (mirrors backend/model.py) ──────────────────────────────────
FEATURES = ARTIFACT["features"]
MEAN = ARTIFACT["mean"]
SCALE = ARTIFACT["scale"]
COEF = ARTIFACT["coefficients"][0]
INTERCEPT = ARTIFACT["intercepts"][0]


def make_window(kind: str) -> np.ndarray:
    n = 160
    t = np.arange(n) / 100.0
    v = (np.random.rand(n) - 0.5) * 0.12
    if kind == "event":
        amp = 1.35
        v = v + amp * np.sin(2 * math.pi * 18 * t) * np.exp(-3 * np.maximum(t - 0.08, 0))
    elif kind == "watch":
        v = v + 0.8 * np.sin(2 * math.pi * 15 * t) * np.exp(-3.5 * np.maximum(t - 0.08, 0))
    return v


def extract(w: np.ndarray):
    n = len(w)
    peak = float(np.max(np.abs(w)))
    rms = float(np.sqrt(np.mean(w ** 2)))
    zc = int(np.sum(np.abs(np.diff(np.sign(w))) > 0))
    zcr = zc / n
    dom = zcr * 100 / 2
    q = n // 4
    head = float(np.mean(np.abs(w[:q])))
    tail = float(np.mean(np.abs(w[-q:]))) or 1e-6
    decay = min(3.0, head / tail)
    return [peak, rms, zcr, dom, decay]


def classify(w: np.ndarray):
    x = extract(w)
    z = INTERCEPT + sum(COEF[i] * ((x[i] - MEAN[i]) / SCALE[i]) for i in range(5))
    p = 1 / (1 + math.exp(-z))
    cls = "event" if p >= 0.5 else "normal"
    conf = p if p >= 0.5 else 1 - p
    return cls, conf, x


# ── drawing helpers ─────────────────────────────────────────────────────────
def rrect(d, box, radius, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def center_text(d, xy, text, font, fill):
    bb = d.textbbox((0, 0), text, font=font)
    w = bb[2] - bb[0]
    h = bb[3] - bb[1]
    d.text((xy[0] - w / 2, xy[1] - h / 2), text, font=font, fill=fill)


def lerp(a, b, t):
    return a + (b - a) * t


def bezier(p0, p1, p2, t):
    x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
    y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
    return x, y


# node anchor points
NODES = {
    "esp":    (230, 250, "⌁", "ESP32 Node", "GLOF_Bridge AP"),
    "phone":  (230, 470, "[P]", "Phone Layer", "accelerometer"),
    "laptop": (640, 360, "==", "Laptop", "FastAPI :8000"),
    "cloud":  (1050, 250, "( )", "Supabase", "persistence"),
    "dash":   (1050, 470, "|||", "Dashboard", "WebSocket live"),
}
CTRL = {  # bezier control points for wires
    "esp":   ((230, 250), (440, 250), (640, 360)),
    "phone": ((230, 470), (440, 470), (640, 360)),
    "cloud": ((640, 360), (850, 250), (1050, 250)),
    "dash":  ((640, 360), (850, 470), (1050, 470)),
}


def draw_node(d, key, state="ok"):
    x, y, icon, name, sub = NODES[key]
    col = {"ok": OK, "hot": CRIT, "tx": ACCENT}.get(state, OK)
    # glow ring
    for r, a in [(46, 30), (40, 60)]:
        d.ellipse([x - r, y - r, x + r, y + r], outline=col, width=2)
    rrect(d, [x - 34, y - 34, x + 34, y + 34], 14, fill=(11, 18, 24), outline=col, width=3)
    center_text(d, (x, y - 4), icon, F_ICON, col)
    center_text(d, (x, y + 52), name, F_LBL, TEXT)
    center_text(d, (x, y + 72), sub, F_SMALL, MUTED)


def draw_wire(d, key, active=False):
    p0, p1, p2 = CTRL[key]
    pts = [bezier(p0, p1, p2, i / 40) for i in range(41)]
    d.line(pts, fill=(ACCENT if active else BORDER), width=(3 if active else 2), joint="curve")


def draw_packet(d, key, t, color):
    p0, p1, p2 = CTRL[key]
    x, y = bezier(p0, p1, p2, t)
    for r, a in [(9, 1), (6, 1), (4, 1)]:
        d.ellipse([x - r, y - r, x + r, y + r], fill=color)


def draw_waveform(d, box, w, color, progress=1.0):
    x0, y0, x1, y1 = box
    rrect(d, box, 8, fill=PANEL2, outline=BORDER, width=1)
    mid = (y0 + y1) / 2
    # grid
    for gy in range(1, 4):
        yy = y0 + (y1 - y0) * gy / 4
        d.line([(x0, yy), (x1, yy)], fill=(22, 32, 43), width=1)
    d.line([(x0, mid), (x1, mid)], fill=(34, 48, 61), width=1)
    n = len(w)
    maxa = max(0.5, float(np.max(np.abs(w))))
    shown = max(2, int(n * progress))
    pts = []
    for i in range(shown):
        px = x0 + (x1 - x0) * i / (n - 1)
        py = mid - (w[i] / maxa) * ((y1 - y0) / 2 * 0.85)
        pts.append((px, py))
    if len(pts) > 1:
        d.line(pts, fill=color, width=2)
    if progress < 1 and pts:
        d.ellipse([pts[-1][0] - 4, pts[-1][1] - 4, pts[-1][0] + 4, pts[-1][1] + 4], fill=color)


def base_frame():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # header
    d.ellipse([40, 34, 54, 48], fill=OK)
    d.text((66, 26), "BhuDrishti", font=F_TITLE, fill=TEXT)
    d.text((68, 66), "GLOF / flash-flood early-warning — Trishuli-Bhote Koshi corridor, Nepal",
           font=F_SMALL, fill=MUTED)
    d.line([(40, 96), (W - 40, 96)], fill=BORDER, width=1)
    return img, d


def draw_caption(d, text, color=ACCENT):
    box = [40, H - 120, W - 40, H - 70]
    rrect(d, box, 8, fill=PANEL2, outline=BORDER, width=1)
    center_text(d, ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), text, F_H, color)


def draw_stepbar(d, step, total=5):
    labels = ["Detect", "Transmit", "Classify", "Persist+Push", "Alert"]
    x = 40
    y = H - 52
    seg = (W - 80) / total
    for i, lab in enumerate(labels):
        cx = x + seg * i + seg / 2
        done = i < step
        cur = i == step
        col = ACCENT if cur else (OK if done else MUTED)
        d.ellipse([cx - 8, y - 8, cx + 8, y + 8], fill=col if (done or cur) else PANEL2,
                  outline=col, width=2)
        center_text(d, (cx, y + 26), lab, F_SMALL, col)
        if i < total - 1:
            d.line([(cx + 12, y), (cx + seg - 12, y)], fill=(OK if done else BORDER), width=2)


def draw_scene(d, win, color, src_label, states, wave_progress, verdict, caption, cap_col, step,
               packets=None):
    for key in CTRL:
        draw_wire(d, key, active=(states.get(key) == "tx"))
    if packets:
        for key, t, col in packets:
            draw_packet(d, key, t, col)
    for key in NODES:
        draw_node(d, key, states.get(key, "ok"))
    # waveform panel bottom-left area overlay
    wf_box = [40, 470, 430, 590]
    d.text((40, 442), f"Sensor window · {src_label}", font=F_SMALL, fill=color)
    draw_waveform(d, wf_box, win, color, wave_progress)
    # verdict panel
    if verdict:
        cls, conf = verdict
        vb = [460, 470, 830, 590]
        vc = CRIT if cls == "event" else OK
        rrect(d, vb, 10, fill=PANEL2, outline=vc, width=2)
        center_text(d, (510, 530), "!" if cls == "event" else "OK", F_BIG, vc)
        d.text((560, 495), "EVENT DETECTED" if cls == "event" else "Normal", font=F_H, fill=vc)
        d.text((560, 528), f"confidence {conf * 100:.1f}%", font=F_LBL, fill=MUTED)
        d.text((560, 552), "logistic regression · 5 features", font=F_SMALL, fill=MUTED)
    draw_caption(d, caption, cap_col)
    draw_stepbar(d, step)


def render():
    if FRAME_DIR.exists():
        shutil.rmtree(FRAME_DIR)
    FRAME_DIR.mkdir(parents=True, exist_ok=True)
    frame_idx = 0

    def save(img):
        nonlocal frame_idx
        img.save(FRAME_DIR / f"f{frame_idx:05d}.png")
        frame_idx += 1

    scenarios = [
        ("esp32_node", "event", ESP, "⌁ esp32_node", "esp"),
        ("phone_layer", "watch", PHONE, "[P] phone_layer", "phone"),
        ("esp32_node", "normal", ESP, "⌁ esp32_node", "esp"),
    ]

    # intro
    for k in range(FPS * 1):
        img, d = base_frame()
        t = k / (FPS * 1)
        for key in CTRL:
            draw_wire(d, key)
        for key in NODES:
            draw_node(d, key, "ok")
        draw_caption(d, "End-to-end early-warning data flow", ACCENT)
        draw_stepbar(d, -1)
        save(img)

    for source, kind, color, src_label, edge in scenarios:
        win = make_window(kind)
        cls, conf, feats = classify(win)

        # 1. DETECT (waveform sweeps in, edge node hot)
        for k in range(int(FPS * 1.6)):
            prog = min(1.0, (k + 1) / (FPS * 1.2))
            img, d = base_frame()
            st = {edge: "hot"}
            cap = ("Phone accelerometer captures vibration" if source == "phone_layer"
                   else "ESP32 node detects ground vibration")
            draw_scene(d, win, color, src_label, st, prog, None, cap + " at upper corridor node…", color, 0)
            save(img)

        # 2. TRANSMIT (packet edge -> laptop)
        for k in range(int(FPS * 1.2)):
            t = (k + 1) / (FPS * 1.2)
            img, d = base_frame()
            st = {edge: "tx", "laptop": "tx"}
            draw_scene(d, win, color, src_label, st, 1.0, None,
                       "Transmitting 160-sample window over GLOF_Bridge WiFi -> laptop",
                       ACCENT, 1, packets=[(edge, t, color)])
            save(img)

        # 3. CLASSIFY (laptop working, verdict appears)
        for k in range(int(FPS * 1.6)):
            img, d = base_frame()
            reveal = k > FPS * 0.6
            st = {"laptop": "hot" if cls == "event" else "ok"}
            draw_scene(d, win, color, src_label, st, 1.0,
                       (cls, conf) if reveal else None,
                       "FastAPI /api/ingest -> 5-feature extraction -> logistic regression",
                       ACCENT, 2)
            save(img)

        # 4. PERSIST + PUSH (two packets laptop -> cloud & dash)
        for k in range(int(FPS * 1.2)):
            t = (k + 1) / (FPS * 1.2)
            img, d = base_frame()
            st = {"laptop": "hot" if cls == "event" else "ok"}
            draw_scene(d, win, color, src_label, st, 1.0, (cls, conf),
                       "Persist to Supabase  +  broadcast over WebSocket",
                       ACCENT, 3, packets=[("cloud", t, ACCENT), ("dash", t, ACCENT)])
            save(img)

        # 5. ALERT (dashboard hot)
        for k in range(int(FPS * 1.6)):
            img, d = base_frame()
            st = {"cloud": "ok", "dash": "hot" if cls == "event" else "ok"}
            cap = ("ALERT on dashboard — downstream settlements notified" if cls == "event"
                   else "Dashboard updated — node nominal")
            draw_scene(d, win, color, src_label, st, 1.0, (cls, conf), cap,
                       CRIT if cls == "event" else OK, 4)
            save(img)

    # outro
    for k in range(FPS * 1):
        img, d = base_frame()
        for key in CTRL:
            draw_wire(d, key)
        for key in NODES:
            draw_node(d, key, "ok")
        center_text(d, (W / 2, 300), "Detect  ->  Transmit  ->  Classify  ->  Persist  ->  Alert",
                    F_H, ACCENT)
        center_text(d, (W / 2, 340),
                    "ESP32 edge  +  phone layer   ·   cross-confirmation boosts confidence +15%",
                    F_LBL, MUTED)
        draw_caption(d, "BhuDrishti — real-time flood corridor monitoring", ACCENT)
        draw_stepbar(d, 5)
        save(img)

    print(f"Rendered {frame_idx} frames -> encoding…")
    OUT_MP4.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-framerate", str(FPS),
        "-i", str(FRAME_DIR / "f%05d.png"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
        "-movflags", "+faststart", str(OUT_MP4),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    shutil.rmtree(FRAME_DIR)
    print(f"Done -> {OUT_MP4}")


if __name__ == "__main__":
    render()
