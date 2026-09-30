"""GLOF Bridge — polls the ESP32 SoftAP HTTP server for queued events.

The ESP32 (GLOF_Bridge_BLE sketch) runs a SoftAP at 192.168.4.1 and
exposes two endpoints:
  GET /events  — returns queued detections as a JSON array, then clears the queue
  GET /status  — returns {"phone_connected": bool, "pending_events": int}

Each event from the ESP32 looks like:
  {"source": "esp32_node" | "phone_layer", "type": "detected_event", "timestamp": <millis>}

Because the ESP32 has no IMU, this bridge generates a realistic synthetic
sensor window for the backend classifier when it receives an event.
For normal (ambient) keep-alive polls it generates a quiet ambient window.

Usage:
  python esp32_bridge.py                        # default ESP32 IP, local backend
  python esp32_bridge.py --esp32 192.168.4.1    # explicit ESP32 IP
  python esp32_bridge.py --api http://10.154.142.137:8000
  python esp32_bridge.py --demo                 # simulate without real ESP32
  python esp32_bridge.py --node-id BD-002       # override node
"""
from __future__ import annotations

import argparse
import math
import random
import time
from typing import Any

import requests

# ── Sensor window generation ─────────────────────────────────────────────────
SAMPLE_COUNT = 160
SAMPLE_RATE  = 100  # Hz


def _ambient_window() -> list[float]:
    """Quiet ambient noise — classifier should return 'normal'."""
    return [random.gauss(0, random.uniform(0.02, 0.08)) for _ in range(SAMPLE_COUNT)]


def _event_window() -> list[float]:
    """Sharp attack + exponential decay — classifier should return 'event'."""
    amplitude = random.uniform(0.8, 1.8)
    frequency = random.uniform(8, 28)
    decay     = random.uniform(3.0, 7.0)
    onset     = random.uniform(0.02, 0.15)
    t = [i / SAMPLE_RATE for i in range(SAMPLE_COUNT)]
    return [
        amplitude
        * math.sin(2 * math.pi * frequency * ti + random.uniform(0, 2 * math.pi))
        * math.exp(-decay * max(ti - onset, 0))
        + random.gauss(0, random.uniform(0.03, 0.12))
        for ti in t
    ]


# ── Backend communication ─────────────────────────────────────────────────────
def post_event(api: str, node_id: str, source: str, is_event: bool) -> None:
    window = _event_window() if is_event else _ambient_window()
    payload = {
        "node_id":       node_id,
        "sensor_window": window,
        "source":        source,
        "battery_pct":   round(random.uniform(55, 98), 1),
    }
    response = requests.post(
        f"{api.rstrip('/')}/api/ingest",
        json=payload,
        timeout=8,
    )
    response.raise_for_status()
    result = response.json()
    cls    = result["classification"]["classification"]
    conf   = round(result["classification"]["confidence"] * 100)
    cfm    = result.get("confirmation", "")
    peak   = result["classification"]["features"].get("peak_amplitude", 0)
    print(f"[{source:12s}] {result['node_id']}: {cls} ({conf}% conf) | peak={peak:.3f} | {cfm}")


# ── ESP32 polling ─────────────────────────────────────────────────────────────
def poll_esp32(esp32_url: str) -> list[dict[str, Any]]:
    """GET /events from the ESP32, returns list of event dicts (clears the queue)."""
    try:
        response = requests.get(f"{esp32_url}/events", timeout=4)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        print(f"ESP32 poll failed: {exc}")
        return []


def status_esp32(esp32_url: str) -> None:
    """Print ESP32 status (phone connected, pending events)."""
    try:
        response = requests.get(f"{esp32_url}/status", timeout=3)
        data = response.json()
        print(f"ESP32 status → phone_connected={data.get('phone_connected')} "
              f"pending={data.get('pending_events')}")
    except requests.RequestException:
        pass


# ── Main loops ────────────────────────────────────────────────────────────────
def live_loop(api: str, esp32_url: str, node_id: str, interval: float) -> None:
    """Poll the ESP32's HTTP event queue and forward each event to the backend."""
    print(f"Polling {esp32_url}/events every {interval}s → {api}")
    print(f"Node: {node_id}  (Ctrl-C to stop)\n")
    while True:
        events = poll_esp32(esp32_url)
        if events:
            for evt in events:
                source   = evt.get("source", "esp32_node")
                is_event = evt.get("type") == "detected_event"
                try:
                    post_event(api, node_id, source, is_event=is_event)
                except requests.RequestException as exc:
                    print(f"backend post failed: {exc}")
        else:
            # No events queued — send a quiet ambient keep-alive every cycle
            # so the dashboard shows the node is alive and the waveform updates.
            try:
                post_event(api, node_id, "esp32_node", is_event=False)
            except requests.RequestException as exc:
                print(f"keep-alive failed: {exc}")
        time.sleep(interval)


def demo_loop(api: str, node_id: str, interval: float) -> None:
    """Simulate ESP32 events without real hardware."""
    print(f"Demo mode → {api}  node={node_id}  (Ctrl-C to stop)\n")
    while True:
        is_event = random.random() < 0.25
        source   = "phone_layer" if (is_event and random.random() < 0.4) else "esp32_node"
        try:
            post_event(api, node_id, source, is_event=is_event)
        except requests.RequestException as exc:
            print(f"send failed: {exc}")
        time.sleep(interval)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api",     default="http://localhost:8000",  help="BhuDrishti backend URL")
    parser.add_argument("--esp32",   default="http://192.168.4.1",     help="ESP32 SoftAP HTTP base URL")
    parser.add_argument("--node-id", default="BD-001",                 help="Node ID (must exist in seed data)")
    parser.add_argument("--interval",type=float, default=3.0,          help="Poll interval in seconds")
    parser.add_argument("--demo",    action="store_true",              help="Simulate without real ESP32")
    args = parser.parse_args()

    if args.demo:
        demo_loop(args.api, args.node_id, args.interval)
    else:
        live_loop(args.api, args.esp32, args.node_id, args.interval)


if __name__ == "__main__":
    main()
