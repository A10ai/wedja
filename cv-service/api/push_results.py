"""
Push counting results to Supabase (PostgREST over HTTPS).
Sends only numbers — never images or video.

Design rules (see audit C1/C2):
  * Only UUIDs that were resolved from the database are ever written to UUID
    columns (camera_id, zone_id, unit_id). Callers are responsible for passing
    resolved ids; ``push_*`` helpers validate them and refuse anything else.
  * A snapshot "people visible in this frame" count is OCCUPANCY, not entries.
    It goes to ``occupancy_readings.current_count`` and never to
    ``footfall_readings.count_in``.
  * ``footfall_readings`` only receives measured entries/exits for a time
    interval (e.g. gate line-crossing counter deltas). Nothing is invented.
  * Every write failure is logged at ERROR level and counted. After
    ``MAX_CONSECUTIVE_PUSH_FAILURES`` consecutive failures a
    ``TooManyPushFailures`` exception is raised so the process exits non-zero
    instead of looking healthy while writing nothing.

Environment:
  SUPABASE_URL                     required
  SUPABASE_SERVICE_KEY             required (service-role key; SUPABASE_KEY is
                                   accepted as a deprecated alias)
  MAX_CONSECUTIVE_PUSH_FAILURES    optional, default 5
"""

from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def is_uuid(value: Any) -> bool:
    """True when value is a canonical UUID string."""
    return isinstance(value, str) and bool(_UUID_RE.match(value))


class ConfigError(SystemExit):
    """Missing/invalid configuration. Subclasses SystemExit so that, when
    uncaught, the message is printed to stderr and the process exits with
    status 1 (generic ``except Exception`` blocks do not swallow it)."""

    def __init__(self, message: str):
        super().__init__(f"CONFIG ERROR: {message}")
        self.message = message


def require_env(name: str, hint: str = "") -> str:
    """Return a required env var or fail fast with a clear message."""
    value = os.getenv(name, "").strip()
    if not value:
        msg = f"environment variable {name} is required"
        if hint:
            msg += f" ({hint})"
        msg += ". See cv-service/.env.example."
        raise ConfigError(msg)
    return value


def require_uuid_env(name: str, default: Optional[str] = None) -> str:
    """Return an env var that must be a UUID (falls back to default if given)."""
    value = os.getenv(name, "").strip() or (default or "")
    if not is_uuid(value):
        raise ConfigError(f"{name} must be a UUID (got {value!r}). See cv-service/.env.example.")
    return value


# ---------------------------------------------------------------------------
# Failure tracking
# ---------------------------------------------------------------------------

class TooManyPushFailures(RuntimeError):
    """Raised after N consecutive write failures."""


class FailureTracker:
    """Counts write failures; raises after ``max_consecutive`` in a row."""

    def __init__(self, max_consecutive: Optional[int] = None):
        if max_consecutive is None:
            max_consecutive = int(os.getenv("MAX_CONSECUTIVE_PUSH_FAILURES", "5"))
        self.max_consecutive = max(1, max_consecutive)
        self.consecutive = 0
        self.total_failures = 0
        self.total_successes = 0

    def success(self) -> None:
        self.consecutive = 0
        self.total_successes += 1

    def failure(self, what: str, err: Exception) -> None:
        self.consecutive += 1
        self.total_failures += 1
        logger.error(
            "Supabase write failed (%s): %s [consecutive=%d/%d, total_failures=%d]",
            what, err, self.consecutive, self.max_consecutive, self.total_failures,
        )
        if self.consecutive >= self.max_consecutive:
            raise TooManyPushFailures(
                f"{self.consecutive} consecutive Supabase write failures; last error: {err}"
            ) from err


# ---------------------------------------------------------------------------
# Minimal PostgREST client (urllib, TLS verification always on)
# ---------------------------------------------------------------------------

class SupabaseError(RuntimeError):
    pass


class SupabaseRest:
    def __init__(self, url: str, key: str, timeout: float = 15.0,
                 opener: Optional[Callable[..., Any]] = None):
        self.base = url.rstrip("/") + "/rest/v1"
        self.key = key
        self.timeout = timeout
        self._open = opener or urllib.request.urlopen

    @classmethod
    def from_env(cls) -> "SupabaseRest":
        url = require_env("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
        if not key:
            legacy = os.getenv("SUPABASE_KEY", "").strip()
            if legacy:
                logger.warning("SUPABASE_KEY is deprecated; rename it to SUPABASE_SERVICE_KEY")
                key = legacy
        if not key:
            raise ConfigError(
                "environment variable SUPABASE_SERVICE_KEY is required. See cv-service/.env.example."
            )
        return cls(url, key)

    def _request(self, method: str, table: str, query: str = "",
                 body: Any = None, prefer: str = "return=minimal") -> Any:
        url = f"{self.base}/{table}"
        if query:
            url += "?" + query
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        }
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with self._open(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8")
            except Exception:
                pass
            raise SupabaseError(f"{method} {table} -> HTTP {e.code}: {detail[:500]}") from e
        except urllib.error.URLError as e:
            raise SupabaseError(f"{method} {table} -> {e.reason}") from e

    def select(self, table: str, query: str) -> list:
        res = self._request("GET", table, query)
        return res if isinstance(res, list) else []

    def insert(self, table: str, rows: Any) -> None:
        self._request("POST", table, body=rows)

    def update(self, table: str, query: str, values: dict) -> None:
        self._request("PATCH", table, query, body=values)


def eq(value: str) -> str:
    return "eq." + urllib.parse.quote(str(value), safe="")


# ---------------------------------------------------------------------------
# Writers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def push_occupancy(client: SupabaseRest, tracker: FailureTracker, *,
                   property_id: str, zone_id: str, people_visible: int,
                   timestamp: Optional[str] = None) -> bool:
    """Write a snapshot people count as zone occupancy (NOT footfall entries).

    ``people_visible`` is the number of people YOLO saw in the latest frame(s) of
    the zone's mapped cameras. Capacity/percentage/status are left unset because
    mapped cameras do not cover the whole zone.
    """
    if not (is_uuid(property_id) and is_uuid(zone_id)):
        raise ValueError(f"refusing to write non-UUID ids: property={property_id!r} zone={zone_id!r}")
    row = {
        "property_id": property_id,
        "zone_id": zone_id,
        "timestamp": timestamp or _now_iso(),
        "current_count": int(people_visible),
    }
    try:
        client.insert("occupancy_readings", row)
    except Exception as e:  # noqa: BLE001 - tracked & re-raised after N
        tracker.failure(f"occupancy_readings zone={zone_id}", e)
        return False
    tracker.success()
    return True


def push_interval_footfall(client: SupabaseRest, tracker: FailureTracker, *,
                           zone_id: str, entries: int, exits: int,
                           confidence: float, camera_id: Optional[str] = None,
                           unit_id: Optional[str] = None,
                           timestamp: Optional[str] = None) -> bool:
    """Write MEASURED entries/exits for one interval to footfall_readings."""
    for label, val in (("zone_id", zone_id), ("camera_id", camera_id), ("unit_id", unit_id)):
        if val is not None and not is_uuid(val):
            raise ValueError(f"refusing to write non-UUID {label}={val!r}")
    row = {
        "zone_id": zone_id,
        "unit_id": unit_id,
        "camera_id": camera_id,
        "timestamp": timestamp or _now_iso(),
        "count_in": int(entries),
        "count_out": int(exits),
        "confidence": round(float(confidence), 4),
    }
    try:
        client.insert("footfall_readings", row)
    except Exception as e:  # noqa: BLE001
        tracker.failure(f"footfall_readings zone={zone_id}", e)
        return False
    tracker.success()
    return True


def add_to_footfall_daily(client: SupabaseRest, tracker: FailureTracker, *,
                          property_id: str, zone_id: str, date: str,
                          add_in: int, add_out: int, hour: int) -> bool:
    """Increment the (property, zone, date, unit IS NULL) footfall_daily row.

    Mirrors the manual-entry route (/api/v1/footfall/manual): read existing row,
    add the interval delta, update; insert if missing. No unique constraint
    exists, so this is application-level idempotence per day.
    """
    if not (is_uuid(property_id) and is_uuid(zone_id)):
        raise ValueError("refusing to write non-UUID ids to footfall_daily")
    try:
        existing = client.select(
            "footfall_daily",
            f"select=id,total_in,total_out,peak_hour,peak_count"
            f"&property_id={eq(property_id)}&zone_id={eq(zone_id)}"
            f"&date={eq(date)}&unit_id=is.null&limit=1",
        )
        if existing:
            row = existing[0]
            peak_count = row.get("peak_count") or 0
            values = {
                "total_in": (row.get("total_in") or 0) + int(add_in),
                "total_out": (row.get("total_out") or 0) + int(add_out),
            }
            if add_in > peak_count:
                values["peak_count"] = int(add_in)
                values["peak_hour"] = hour
            client.update("footfall_daily", f"id={eq(row['id'])}", values)
        else:
            client.insert("footfall_daily", {
                "property_id": property_id,
                "zone_id": zone_id,
                "unit_id": None,
                "date": date,
                "total_in": int(add_in),
                "total_out": int(add_out),
                "peak_hour": hour,
                "peak_count": int(add_in),
            })
    except Exception as e:  # noqa: BLE001
        tracker.failure(f"footfall_daily zone={zone_id} date={date}", e)
        return False
    tracker.success()
    return True


def fetch_camera_feeds(client: SupabaseRest, property_id: str) -> list:
    """camera_feeds rows for the property (id, name, zone_id, status)."""
    return client.select(
        "camera_feeds",
        f"select=id,name,zone_id,status&property_id={eq(property_id)}&limit=1000",
    )
