"""Regenerate shared/fixtures/coverage-parity.json from the Python coverage model.

Run after intentionally changing the coverage model; both the pytest and node test suites
compare their implementation against this file.
    python scripts/gen_coverage_parity.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from backend.coverage import compute_coverage  # noqa: E402

AS_OF = datetime(2026, 9, 30, 6, 0, tzinfo=timezone.utc)
seed = json.loads((ROOT / "nepal-flood-corridor-seed-data.json").read_text(encoding="utf-8"))
nodes = []
for n in seed["nodes"]:
    node = {k: v for k, v in n.items() if k != "demo_last_seen_offset_s"}
    node["last_seen"] = (AS_OF - timedelta(seconds=n.get("demo_last_seen_offset_s", 0))).isoformat()
    nodes.append(node)
nodes.append({"id": "PH-1", "lat": 28.02, "lng": 85.23, "source": "phone_layer", "battery_pct": 12, "last_seen": (AS_OF - timedelta(minutes=20)).isoformat()})
data = {"input": {"as_of": AS_OF.isoformat(), "max_age_minutes": 60, "nodes": nodes, "settlements": seed["settlements"]}}
result = compute_coverage(nodes, seed["settlements"], as_of=AS_OF, max_age_minutes=60)
data["expected"] = {"summary": result["summary"], "coverage": [f["properties"]["coverage"] for f in result["features"]],
                    "risk": [f["properties"]["risk"] for f in result["features"]]}
out = ROOT / "shared" / "fixtures" / "coverage-parity.json"
out.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
print(f"wrote {out} ({result['summary']})")
