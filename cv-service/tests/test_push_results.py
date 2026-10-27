import io
import json
import urllib.error

import pytest

from api.push_results import (
    ConfigError,
    FailureTracker,
    SupabaseRest,
    TooManyPushFailures,
    add_to_footfall_daily,
    push_interval_footfall,
    push_occupancy,
)
from conftest import FakeSupabase

P = "a0000000-0000-0000-0000-000000000001"
Z = "b0000000-0000-0000-0000-000000000008"


def test_occupancy_goes_to_occupancy_readings_not_footfall():
    db = FakeSupabase()
    assert push_occupancy(db, FailureTracker(5), property_id=P, zone_id=Z, people_visible=7)
    assert [t for t, _ in db.inserts] == ["occupancy_readings"]
    row = db.inserts[0][1]
    assert row["current_count"] == 7 and "count_in" not in row and "count_out" not in row


def test_non_uuid_ids_are_refused_before_any_request():
    db = FakeSupabase()
    with pytest.raises(ValueError):
        push_occupancy(db, FailureTracker(5), property_id=P, zone_id="", people_visible=1)
    with pytest.raises(ValueError):
        push_interval_footfall(db, FailureTracker(5), zone_id=Z, camera_id="N2-D1",
                               entries=1, exits=0, confidence=0.9)
    assert db.inserts == []


def test_interval_footfall_writes_measured_values_only():
    db = FakeSupabase()
    push_interval_footfall(db, FailureTracker(5), zone_id=Z, entries=12, exits=9, confidence=0.95)
    row = db.inserts[0][1]
    assert (row["count_in"], row["count_out"], row["camera_id"]) == (12, 9, None)


def test_failures_are_counted_and_raise_after_n_consecutive():
    db = FakeSupabase(fail=True)
    tracker = FailureTracker(3)
    assert push_occupancy(db, tracker, property_id=P, zone_id=Z, people_visible=1) is False
    assert push_occupancy(db, tracker, property_id=P, zone_id=Z, people_visible=1) is False
    with pytest.raises(TooManyPushFailures):
        push_occupancy(db, tracker, property_id=P, zone_id=Z, people_visible=1)
    assert tracker.total_failures == 3


def test_success_resets_consecutive_failures():
    tracker = FailureTracker(2)
    tracker.failure("x", RuntimeError("boom"))
    tracker.success()
    tracker.failure("x", RuntimeError("boom"))  # would raise if not reset
    assert tracker.consecutive == 1


def test_footfall_daily_inserts_then_increments():
    db = FakeSupabase()
    t = FailureTracker(5)
    add_to_footfall_daily(db, t, property_id=P, zone_id=Z, date="2026-10-26", add_in=10, add_out=4, hour=11)
    add_to_footfall_daily(db, t, property_id=P, zone_id=Z, date="2026-10-26", add_in=25, add_out=20, hour=13)
    rows = db.tables["footfall_daily"]
    assert len(rows) == 1
    assert (rows[0]["total_in"], rows[0]["total_out"]) == (35, 24)
    assert (rows[0]["peak_count"], rows[0]["peak_hour"]) == (25, 13)
    add_to_footfall_daily(db, t, property_id=P, zone_id=Z, date="2026-10-27", add_in=1, add_out=0, hour=10)
    assert len(db.tables["footfall_daily"]) == 2


def test_from_env_requires_service_key(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_KEY", raising=False)
    with pytest.raises(ConfigError):
        SupabaseRest.from_env()
    monkeypatch.setenv("SUPABASE_KEY", "legacy")
    assert SupabaseRest.from_env().key == "legacy"


def test_http_errors_surface_as_exceptions():
    def opener(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 400, "Bad", {}, io.BytesIO(b'{"message":"bad uuid"}'))

    client = SupabaseRest("https://x.supabase.co", "k", opener=opener)
    with pytest.raises(Exception, match="HTTP 400"):
        client.insert("footfall_readings", {"a": 1})


def test_request_shape():
    seen = {}

    class Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def opener(req, timeout):
        seen["url"], seen["method"], seen["body"] = req.full_url, req.get_method(), req.data
        return Resp(b"")

    SupabaseRest("https://x.supabase.co/", "k", opener=opener).insert("occupancy_readings", {"a": 1})
    assert seen["url"] == "https://x.supabase.co/rest/v1/occupancy_readings"
    assert seen["method"] == "POST" and json.loads(seen["body"]) == {"a": 1}
