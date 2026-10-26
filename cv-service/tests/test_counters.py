"""Integration-style tests of the cycle functions with fakes (no cameras, no network)."""
import sys
import types

from api.push_results import FailureTracker
from conftest import FakeSupabase
from detection.gate_delta import GateState

P = "a0000000-0000-0000-0000-000000000001"
Z1 = "b0000000-0000-0000-0000-000000000001"
Z2 = "b0000000-0000-0000-0000-000000000003"


def test_gate_cycle_writes_interval_delta_rows_and_daily_total(monkeypatch):
    import gate_counter

    readings = iter([
        {"Gate 1 Cam A": (1000, 900), "Gate 3": (50, 40)},   # baselines only
        {"Gate 1 Cam A": (1030, 920), "Gate 3": (55, 41)},
        {"Gate 1 Cam A": (1100, 990), "Gate 3": None},       # Gate 3 OCR failed
    ])
    state = {}

    def fake_read_gate(gate, frame_path):
        cur = state["cycle"].get(gate["name"])
        if cur is None:
            return None, None, "OCR failed"
        return cur[0], cur[1], None

    monkeypatch.setattr(gate_counter, "read_gate", fake_read_gate)
    ctx = gate_counter.GateContext.__new__(gate_counter.GateContext)
    ctx.client = FakeSupabase()
    ctx.tracker = FailureTracker(5)
    ctx.state = GateState(100)
    ctx.property_id, ctx.zone_id, ctx.current_date = P, Z1, ""

    results = []
    for r in readings:
        state["cycle"] = r
        results.append(gate_counter.run_once(ctx))

    assert results[0] is None  # first cycle only sets baselines
    rows = [row for t, row in ctx.client.inserts if t == "footfall_readings"]
    assert [(r["count_in"], r["count_out"]) for r in rows] == [(35, 21), (70, 70)]
    assert rows[1]["confidence"] == gate_counter.CONFIDENCE_FLAGGED  # a gate was unreadable
    daily = ctx.client.tables["footfall_daily"]
    assert len(daily) == 1 and (daily[0]["total_in"], daily[0]["total_out"]) == (105, 91)


def test_snapshot_cycle_writes_zone_occupancy_only(monkeypatch):
    fake_reader = types.ModuleType("capture.rtsp_reader")

    class Reader:
        def __init__(self, url, cam_id):
            self.cam_id = cam_id

        def get_snapshot(self):
            return None if self.cam_id == "C3" else object()

    fake_reader.RTSPReader = Reader
    fake_counter = types.ModuleType("detection.people_counter")
    counts = {"C1": 4, "C2": 6}
    fake_counter.count_people = lambda frame, confidence: {"count": counts.pop(next(iter(counts))),
                                                           "processing_time_ms": 1}
    monkeypatch.setitem(sys.modules, "capture.rtsp_reader", fake_reader)
    monkeypatch.setitem(sys.modules, "detection.people_counter", fake_counter)

    import main

    ctx = main.SnapshotContext.__new__(main.SnapshotContext)
    ctx.username, ctx.password, ctx.confidence, ctx.property_id = "u", "p", 0.5, P
    ctx.client, ctx.tracker = FakeSupabase(), FailureTracker(5)
    ctx.cameras = [
        {"id": "C1", "ip": "10.0.0.1", "location": "a", "zone_id": Z1},
        {"id": "C2", "ip": "10.0.0.2", "location": "b", "zone_id": Z1},
        {"id": "C3", "ip": "10.0.0.3", "location": "c", "zone_id": Z2},  # no frame
    ]
    main.run_snapshot_cycle(ctx)

    tables = [t for t, _ in ctx.client.inserts]
    assert tables == ["occupancy_readings"]
    row = ctx.client.inserts[0][1]
    assert row["zone_id"] == Z1 and row["current_count"] == 10
