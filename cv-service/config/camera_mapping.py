"""
Resolve configured cameras (config/cameras.py, ids like "N2-D1") to rows in the
``camera_feeds`` table so that only real UUIDs are ever written to the database.

Matching rules, in order:
  1. ``feed_id`` in the camera config (explicit camera_feeds UUID).
  2. camera_feeds.name equal (case-insensitive) to the config ``id``
     (register feeds in the dashboard named exactly "N2-D1", "S1", ...).
  3. camera_feeds.name equal to the config ``location`` — only when that
     location is unique on both sides (e.g. "Gate 1" is NOT unique).

zone_id comes from an explicit ``zone_id`` UUID in config, else from the
camera_feeds row. camera_feeds has no unit_id column, so unit_id can only come
from an explicit ``unit_id`` UUID in config.

Cameras that cannot be resolved (or have no zone) are returned in ``skipped``
with a reason; callers must log them and never write data for them.
"""

from __future__ import annotations

from collections import Counter
from typing import Iterable, Optional

from api.push_results import is_uuid


def _norm(s: Optional[str]) -> str:
    return " ".join((s or "").split()).casefold()


def resolve_cameras(configured: Iterable[dict], feeds: Iterable[dict]):
    """Return (mapped, skipped).

    mapped:  list of camera dicts with added keys feed_id, zone_id, unit_id
    skipped: list of (camera_id, reason)
    """
    configured = list(configured)
    feeds = list(feeds)
    by_id = {f["id"]: f for f in feeds if is_uuid(f.get("id"))}

    feeds_by_name: dict[str, list[dict]] = {}
    for f in feeds:
        feeds_by_name.setdefault(_norm(f.get("name")), []).append(f)
    location_counts = Counter(_norm(c.get("location")) for c in configured)

    mapped: list[dict] = []
    skipped: list[tuple[str, str]] = []

    for cam in configured:
        cam_id = str(cam.get("id", "?"))
        feed: Optional[dict] = None

        explicit = cam.get("feed_id")
        if explicit is not None:
            if not is_uuid(explicit):
                skipped.append((cam_id, f"feed_id {explicit!r} is not a UUID"))
                continue
            feed = by_id.get(explicit)
            if feed is None:
                skipped.append((cam_id, f"feed_id {explicit} not found in camera_feeds"))
                continue
        else:
            candidates = feeds_by_name.get(_norm(cam_id), [])
            if len(candidates) > 1:
                skipped.append((cam_id, f"{len(candidates)} camera_feeds rows named {cam_id!r} (ambiguous)"))
                continue
            if not candidates:
                loc = _norm(cam.get("location"))
                loc_candidates = feeds_by_name.get(loc, []) if loc else []
                if len(loc_candidates) == 1 and location_counts[loc] == 1:
                    candidates = loc_candidates
            if not candidates:
                skipped.append((cam_id, "no camera_feeds row named after its id or (unique) location; "
                                        "register it in the dashboard or set feed_id in config/cameras.py"))
                continue
            feed = candidates[0]

        if not is_uuid(feed.get("id")):
            skipped.append((cam_id, f"camera_feeds id {feed.get('id')!r} is not a UUID"))
            continue

        zone_id = cam.get("zone_id") or feed.get("zone_id")
        if not is_uuid(zone_id):
            skipped.append((cam_id, "no zone_id (set zone on the camera_feeds row or zone_id in config)"))
            continue

        unit_id = cam.get("unit_id")
        if unit_id is not None and not is_uuid(unit_id):
            skipped.append((cam_id, f"unit_id {unit_id!r} is not a UUID"))
            continue

        mapped.append({**cam, "feed_id": feed["id"], "zone_id": zone_id, "unit_id": unit_id})

    return mapped, skipped
