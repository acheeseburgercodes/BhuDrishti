import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from backend.coverage import compute_coverage, freshness_factor, load_model, range_factor, reliability_factor

PARITY = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "coverage-parity.json"
AS_OF = datetime(2026, 9, 30, 6, 0, tzinfo=timezone.utc)


def parity_input():
    return json.loads(PARITY.read_text(encoding="utf-8"))["input"]


def test_factors():
    model = load_model()
    assert range_factor(0, 3) == 1 and range_factor(3, 3) == 0 and 0 < range_factor(1.5, 3) < 1
    assert freshness_factor(1, model["freshness"]) == 1 and freshness_factor(61, model["freshness"]) == 0
    assert freshness_factor(None, model["freshness"]) == 0
    assert reliability_factor({"status": "offline", "reliability": 1}, model) == 0
    assert reliability_factor({"battery_pct": 10, "reliability": 1}, model) == 0.5
    assert reliability_factor({}, model) == model["default_reliability"]


def test_fresh_node_covers_its_cell_and_stale_node_does_not():
    node = {"id": "N", "lat": 28.161, "lng": 85.345, "status": "online", "reliability": 1, "last_seen": (AS_OF - timedelta(minutes=1)).isoformat()}
    fresh = compute_coverage([node], [], as_of=AS_OF)
    stale = compute_coverage([{**node, "last_seen": (AS_OF - timedelta(hours=3)).isoformat()}], [], as_of=AS_OF)
    never = compute_coverage([{**node, "last_seen": None}], [], as_of=AS_OF)
    assert fresh["summary"]["covered"] >= 1
    assert stale["summary"]["covered"] == 0 and never["summary"]["covered"] == 0
    assert stale["summary"]["uncovered"] == stale["summary"]["cells"]
    # Widening the freshness window brings the 3 h old node back.
    assert compute_coverage([{**node, "last_seen": (AS_OF - timedelta(hours=3)).isoformat()}], [], as_of=AS_OF, max_age_minutes=600)["summary"]["covered"] >= 1


def test_union_of_overlapping_nodes_is_probabilistic():
    base = {"lat": 28.0, "lng": 85.3, "status": "online", "reliability": 0.5, "last_seen": AS_OF.isoformat()}
    one = compute_coverage([{**base, "id": "a"}], [], as_of=AS_OF)
    two = compute_coverage([{**base, "id": "a"}, {**base, "id": "b"}], [], as_of=AS_OF)
    best = lambda r: max(f["properties"]["coverage"] for f in r["features"])  # noqa: E731
    assert best(one) <= 0.5 and 0.5 < best(two) <= 0.75


def test_risk_is_higher_near_river_and_gap_combines_risk_and_coverage():
    grid = compute_coverage([], [], as_of=AS_OF)
    risks = [f["properties"]["risk"] for f in grid["features"]]
    assert max(risks) > 0.6 and min(risks) < 0.2
    assert all(f["properties"]["gap"] == f["properties"]["risk"] for f in grid["features"])
    assert grid["summary"]["high_risk_uncovered"] == grid["summary"]["high_risk_cells"]
    assert "not_included" in grid["method"]


def test_parity_fixture_matches_python():
    data = json.loads(PARITY.read_text(encoding="utf-8"))
    result = compute_coverage(data["input"]["nodes"], data["input"]["settlements"], as_of=AS_OF, max_age_minutes=data["input"]["max_age_minutes"])
    assert {k: v for k, v in result["summary"].items() if k != "as_of"} == {k: v for k, v in data["expected"]["summary"].items() if k != "as_of"}
    assert [f["properties"]["coverage"] for f in result["features"]] == data["expected"]["coverage"]
    assert [f["properties"]["risk"] for f in result["features"]] == data["expected"]["risk"]
