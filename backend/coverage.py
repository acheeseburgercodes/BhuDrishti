"""Indicative sensing-coverage grid (authoritative implementation).

Mirrors shared/src/coverage.js; both read shared/fixtures/coverage-model.json and a parity
test keeps them identical. See docs/COVERAGE.md for the method and its limitations.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MODEL_PATH = Path(__file__).resolve().parent.parent / "shared" / "fixtures" / "coverage-model.json"
KM_PER_DEG_LAT = 110.57
KM_PER_DEG_LNG_EQ = 111.32


def load_model() -> dict[str, Any]:
    return json.loads(MODEL_PATH.read_text(encoding="utf-8"))


def _round(value: float, digits: int = 3) -> float:
    # Match JS Math.round((v + EPSILON) * f) / f (round-half-up), not banker's rounding.
    factor = 10**digits
    return math.floor((value + 2.220446049250313e-16) * factor + 0.5) / factor


def distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    mean_lat = math.radians((a[0] + b[0]) / 2)
    dy = (b[0] - a[0]) * KM_PER_DEG_LAT
    dx = (b[1] - a[1]) * KM_PER_DEG_LNG_EQ * math.cos(mean_lat)
    return math.hypot(dx, dy)


def point_to_segment_km(p, a, b) -> float:
    cos_lat = math.cos(math.radians(p[0]))

    def xy(q):
        return ((q[1] - p[1]) * KM_PER_DEG_LNG_EQ * cos_lat, (q[0] - p[0]) * KM_PER_DEG_LAT)

    ax, ay = xy(a)
    bx, by = xy(b)
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy
    t = 0.0 if len2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / len2))
    return math.hypot(ax + t * dx, ay + t * dy)


def freshness_factor(age_minutes: float | None, freshness: dict[str, float]) -> float:
    if age_minutes is None or not math.isfinite(age_minutes):
        return 0.0
    full, maximum = freshness["full_minutes"], freshness["max_minutes"]
    if age_minutes <= full:
        return 1.0
    if age_minutes >= maximum:
        return 0.0
    return 1 - (age_minutes - full) / (maximum - full)


def range_factor(distance: float, range_km: float) -> float:
    if not range_km or range_km <= 0 or distance >= range_km:
        return 0.0
    return 1 - (distance / range_km) ** 2


def reliability_factor(node: dict[str, Any], model: dict[str, Any]) -> float:
    if node.get("status") == "offline":
        return 0.0
    value = node["reliability"] if isinstance(node.get("reliability"), (int, float)) else model["default_reliability"]
    battery = node.get("battery_pct")
    if isinstance(battery, (int, float)):
        if battery < 15:
            value *= 0.5
        elif battery < 30:
            value *= 0.8
    if node.get("status") == "warning":
        value *= 0.75
    return max(0.0, min(1.0, float(value)))


def _parse(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        parsed = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def node_inputs(node: dict[str, Any], model: dict[str, Any], as_of: datetime) -> dict[str, Any]:
    last_seen = _parse(node.get("last_seen"))
    age = None if last_seen is None else max(0.0, (as_of - last_seen).total_seconds() / 60)
    source = node.get("source") or "esp32_node"
    ranges = model["default_range_km"]
    return {
        "id": node.get("id"),
        "lat": node["lat"],
        "lng": node["lng"],
        "range_km": node["range_km"] if isinstance(node.get("range_km"), (int, float)) else ranges.get(source, ranges["esp32_node"]),
        "freshness": freshness_factor(age, model["freshness"]),
        "reliability": reliability_factor(node, model),
        "age_minutes": None if age is None else _round(age, 1),
    }


def risk_at(point, model: dict[str, Any], settlements: list[dict[str, Any]]) -> float:
    r = model["risk"]
    river = math.inf
    for line in model["rivers"]:
        for i in range(len(line) - 1):
            river = min(river, point_to_segment_km(point, line[i], line[i + 1]))
    river_factor = math.exp(-river / r["river_scale_km"]) if math.isfinite(river) else 0.0
    exposure = 0.0
    for s in settlements:
        d = distance_km(point, (s["lat"], s["lng"]))
        exposure = max(exposure, math.exp(-d / r["settlement_scale_km"]) * min(1.0, (s.get("population") or 0) / r["population_ref"]))
    return max(0.0, min(1.0, r["base"] + r["river_weight"] * river_factor + r["settlement_weight"] * exposure))


def band(coverage: float, model: dict[str, Any]) -> str:
    if coverage >= model["bands"]["covered"]:
        return "covered"
    if coverage >= model["bands"]["partial"]:
        return "partial"
    return "uncovered"


def compute_coverage(nodes: list[dict[str, Any]], settlements: list[dict[str, Any]], model: dict[str, Any] | None = None,
                     as_of: datetime | None = None, max_age_minutes: float | None = None) -> dict[str, Any]:
    model = dict(model or load_model())
    if max_age_minutes:
        model["freshness"] = {"max_minutes": max_age_minutes, "full_minutes": min(model["freshness"]["full_minutes"], max_age_minutes)}
    as_of = as_of or datetime.now(timezone.utc)
    inputs = [node_inputs(n, model, as_of) for n in nodes
              if isinstance(n.get("lat"), (int, float)) and isinstance(n.get("lng"), (int, float))]
    bbox, step = model["bbox"], model["cell_deg"]
    rows = round((bbox["max_lat"] - bbox["min_lat"]) / step)
    cols = round((bbox["max_lng"] - bbox["min_lng"]) / step)
    features: list[dict[str, Any]] = []
    counts = {"covered": 0, "partial": 0, "uncovered": 0}
    risk_sum = weighted = 0.0
    high = high_uncovered = 0
    for row in range(rows):
        for col in range(cols):
            lat0 = bbox["min_lat"] + row * step
            lng0 = bbox["min_lng"] + col * step
            center = (lat0 + step / 2, lng0 + step / 2)
            miss, contributors = 1.0, 0
            for node in inputs:
                c = range_factor(distance_km(center, (node["lat"], node["lng"])), node["range_km"]) * node["freshness"] * node["reliability"]
                if c > 0:
                    miss *= 1 - c
                    contributors += 1
            coverage = _round(1 - miss)
            risk = _round(risk_at(center, model, settlements))
            b = band(coverage, model)
            counts[b] += 1
            risk_sum += risk
            weighted += risk * coverage
            if risk >= model["risk"]["high_threshold"]:
                high += 1
                if b == "uncovered":
                    high_uncovered += 1
            features.append({
                "type": "Feature",
                "id": row * cols + col,
                "geometry": {"type": "Polygon", "coordinates": [[[lng0, lat0], [lng0 + step, lat0], [lng0 + step, lat0 + step], [lng0, lat0 + step], [lng0, lat0]]]},
                "properties": {"coverage": coverage, "risk": risk, "gap": _round(risk * (1 - coverage)), "band": b, "contributors": contributors},
            })
    return {
        "type": "FeatureCollection",
        "features": features,
        "summary": {
            "cells": len(features),
            **counts,
            "risk_weighted_coverage": _round(weighted / risk_sum) if risk_sum else 0,
            "high_risk_cells": high,
            "high_risk_uncovered": high_uncovered,
            "as_of": as_of.isoformat(),
            "max_age_minutes": model["freshness"]["max_minutes"],
            "nodes_contributing": sum(1 for n in inputs if n["freshness"] * n["reliability"] > 0),
        },
        "nodes": inputs,
        "method": {
            "formula": "coverage = 1 - Π(1 - range·freshness·reliability); gap = risk·(1 - coverage)",
            "inputs": ["node position", "assumed sensing range per source", "last_seen freshness", "reported reliability, battery, status", "river-proximity and settlement exposure as risk proxies"],
            "not_included": ["DEM / slope / line-of-sight", "radio propagation", "measured detection probability"],
            "note": "Indicative planning layer. It shows where sensing evidence is thin, not where hazards are or are not.",
        },
    }
