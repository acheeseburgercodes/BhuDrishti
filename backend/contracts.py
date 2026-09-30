"""Pydantic wire contracts. Mirrors shared/src/contracts.js (the backend is authoritative)."""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Source = Literal["esp32_node", "phone_layer"]
Channel = Literal["esp32_bridge", "serial_bridge", "mobile_app", "web_portal", "simulator", "unknown"]
Transport = Literal["wifi_softap", "ble", "serial", "cellular", "http", "unknown"]
ID_PATTERN = r"^[A-Za-z0-9_.:-]{2,64}$"
MAX_SAMPLES = 2048
MAX_ABS_SAMPLE = 1000.0
MAX_FUTURE_SKEW = timedelta(minutes=5)


def parse_ts(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


class TelemetryIn(BaseModel):
    # ── Original fields (backwards compatible with the ESP32 bridge and old clients) ──
    node_id: str = Field(..., pattern=ID_PATTERN)
    sensor_window: list[float] = Field(..., min_length=8, max_length=MAX_SAMPLES)
    source: Source = "esp32_node"
    water_level_cm: float = Field(0, ge=0, le=1000)
    rainfall_mm: float = Field(0, ge=0, le=1000)
    flow_rate_m3s: float = Field(0, ge=0, le=20000)
    soil_moisture_pct: float = Field(0, ge=0, le=100)
    battery_pct: float = Field(100, ge=0, le=100)
    temperature_c: float | None = Field(None, ge=-60, le=80)
    recorded_at: str | None = None
    # ── Additive provenance fields (all optional) ──
    device_id: str | None = Field(None, pattern=ID_PATTERN)
    channel: Channel = "unknown"
    transport: Transport = "unknown"
    client_event_id: str | None = Field(None, pattern=ID_PATTERN)
    captured_at: str | None = None
    queued: bool = False
    queued_at: str | None = None
    attempt: int = Field(1, ge=1, le=100)
    sample_rate_hz: float = Field(100.0, ge=10, le=1000)
    lat: float | None = Field(None, ge=-90, le=90)
    lng: float | None = Field(None, ge=-180, le=180)
    location_accuracy_m: float | None = Field(None, ge=0, le=100000)
    app_version: str | None = Field(None, max_length=32)
    demo: bool = False
    # True when the waveform was synthesised (e.g. ESP32 bridge: real trigger, no raw IMU samples).
    synthetic_window: bool = False

    @field_validator("sensor_window")
    @classmethod
    def _finite(cls, window: list[float]) -> list[float]:
        if not all(math.isfinite(v) and abs(v) <= MAX_ABS_SAMPLE for v in window):
            raise ValueError("sensor_window values must be finite and within ±1000")
        return window

    @field_validator("recorded_at", "captured_at", "queued_at")
    @classmethod
    def _timestamp(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            parsed = parse_ts(value)
        except ValueError as exc:
            raise ValueError("timestamp must be ISO-8601") from exc
        if parsed - datetime.now(timezone.utc) > MAX_FUTURE_SKEW:
            raise ValueError("timestamp is too far in the future")
        return parsed.isoformat()


class BatchIn(BaseModel):
    readings: list[TelemetryIn] = Field(..., min_length=1, max_length=50)


class SimulationIn(BaseModel):
    node_id: str | None = None
    severity: str = Field("random", pattern="^(random|normal|watch|critical)$")
    source: Source = "esp32_node"


class AlertDecisionIn(BaseModel):
    note: str = Field("", max_length=500)
    operator: str = Field("operator", max_length=64, pattern=r"^[\w .@-]{1,64}$")


class TranslateIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    target: str = Field(..., pattern=r"^[a-z]{2}(-[A-Z]{2})?$")
    source: str = Field("en", pattern=r"^[a-z]{2}(-[A-Z]{2})?$")


class AgentRunIn(BaseModel):
    agents: list[str] | None = Field(None, max_length=8)
    event_id: str | None = Field(None, max_length=64)
    language: str = Field("en", pattern=r"^[a-z]{2}$")
