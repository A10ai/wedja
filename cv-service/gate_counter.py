#!/usr/bin/env python3
"""
Wedja Gate Counter v3 — per-interval entries/exits from Hikvision gate cameras.

The gate cameras' OSD shows CUMULATIVE Enter/Leave counts that do not reset
at midnight (only on power cycle). Each cycle this script:
  1. Reads every gate's cumulative counts via OCR.
  2. Converts them to per-interval deltas (detection/gate_delta.py):
     camera restarts are handled, implausible jumps are CAPPED and flagged
     (never silently zeroed), unreadable counters are carried to the next read.
  3. Inserts ONE footfall_readings row for the interval holding the measured
     entries (count_in) and exits (count_out) for that interval only.
  4. Adds the same delta to today's footfall_daily row for the gate zone
     (date = Africa/Cairo local date), so the daily total survives restarts.

Required environment (fails fast if missing):
    GATE_HOST, GATE_PASSWORD             gate camera NAT host and password
    SUPABASE_URL, SUPABASE_SERVICE_KEY   database
    PROPERTY_ID, GATE_ZONE_ID            UUIDs (zone the gates belong to)
Optional:
    GATE_USERNAME (admin), GATE_INTERVAL_SECONDS (300),
    GATE_MAX_ENTRIES_PER_MINUTE (100, per gate counter; above it the delta is
    capped and flagged), MAX_CONSECUTIVE_PUSH_FAILURES (5)

Usage:
    python gate_counter.py              # Run continuous
    python gate_counter.py --once       # Single cycle (first cycle only sets baselines)
    python gate_counter.py --test       # Test all gates (no database writes)
"""

import importlib
import logging
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

from api.push_results import (
    ConfigError,
    FailureTracker,
    SupabaseRest,
    TooManyPushFailures,
    add_to_footfall_daily,
    push_interval_footfall,
    require_env,
    require_uuid_env,
)
from detection.gate_delta import GateState

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("wedja-gates")

CAIRO = ZoneInfo("Africa/Cairo")
INTERVAL = int(os.getenv("GATE_INTERVAL_SECONDS", "300"))
MAX_PER_MINUTE = float(os.getenv("GATE_MAX_ENTRIES_PER_MINUTE", "100"))
CONFIDENCE_OK = 0.95
CONFIDENCE_FLAGGED = 0.6

FRAME_DIR = Path(tempfile.gettempdir()) / "wedja_gates"

GATES = [
    {"name": "Gate 1 Cam A", "port": 5541, "location": "Gate 1"},
    {"name": "Gate 1 Cam B", "port": 5542, "location": "Gate 1"},
    {"name": "Gate 2 Cam A", "port": 5543, "location": "Gate 2"},
    {"name": "Gate 2 Cam B", "port": 5544, "location": "Gate 2"},
    {"name": "Gate 3",       "port": 5545, "location": "Gate 3"},
    {"name": "Gate 4",       "port": 5546, "location": "Gate 4"},
]


def get_gate_url(gate):
    host = require_env("GATE_HOST", "gate camera NAT host; never commit real values")
    password = require_env("GATE_PASSWORD")
    user = os.getenv("GATE_USERNAME", "admin")
    return f"rtsp://{user}:{password}@{host}:{gate['port']}/Streaming/Channels/101"


def check_ocr_dependencies():
    """OCR is the only data source; missing deps must fail at startup, not
    silently produce 'OCR failed' forever."""
    try:
        importlib.import_module("cv2")
        pytesseract = importlib.import_module("pytesseract")
        pytesseract.get_tesseract_version()
    except Exception as e:  # ImportError or TesseractNotFoundError
        raise ConfigError(
            f"gate OCR needs opencv, pytesseract and the tesseract binary ({e})"
        ) from e


def capture_frame(rtsp_url, output_path):
    try:
        subprocess.run(
            ["ffmpeg", "-rtsp_transport", "tcp", "-i", rtsp_url,
             "-frames:v", "1", "-update", "1", "-y", str(output_path)],
            capture_output=True, timeout=15,
        )
        return output_path.exists() and output_path.stat().st_size > 0
    except Exception as e:
        logger.warning(f"Capture error: {e}")
        return False


def read_osd_counts(image_path):
    try:
        import cv2
        img = cv2.imread(str(image_path))
        if img is None:
            return None, None

        h, w = img.shape[:2]
        roi = img[0:int(h * 0.12), int(w * 0.65):]
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)

        import pytesseract
        text = pytesseract.image_to_string(thresh, config="--psm 6")

        enter_match = re.search(r'[Ee]nter\s*[:\s]\s*(\d+)', text)
        leave_match = re.search(r'[Ll]eave\s*[:\s]\s*(\d+)', text)

        enter_count = int(enter_match.group(1)) if enter_match else None
        leave_count = int(leave_match.group(1)) if leave_match else None
        return enter_count, leave_count
    except Exception as e:
        logger.warning(f"OCR error: {e}")
        return None, None


def read_osd_simple(image_path):
    try:
        import cv2
        img = cv2.imread(str(image_path))
        if img is None:
            return None, None

        h, w = img.shape[:2]
        roi = img[0:int(h * 0.10), int(w * 0.70):]
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)

        import pytesseract
        text = pytesseract.image_to_string(thresh, config="--psm 6 -c tessedit_char_whitelist=0123456789EnterLeavl: ")
        enter_match = re.search(r'(\d{1,6})', text.split('\n')[0] if text.strip() else "")
        leave_match = re.search(r'(\d{1,6})', text.split('\n')[1] if len(text.strip().split('\n')) > 1 else "")
        enter_count = int(enter_match.group(1)) if enter_match else None
        leave_count = int(leave_match.group(1)) if leave_match else None
        return enter_count, leave_count
    except Exception as e:
        logger.warning(f"OCR (simple) error: {e}")
        return None, None




def read_gate(gate, frame_path):
    """Return (enter, leave) cumulative counts, either may be None."""
    if not capture_frame(get_gate_url(gate), frame_path):
        return None, None, "capture failed"
    try:
        enter, leave = read_osd_counts(frame_path)
        if enter is None:
            enter, leave = read_osd_simple(frame_path)
    finally:
        frame_path.unlink(missing_ok=True)
    return enter, leave, None if enter is not None else "OCR failed"


class GateContext:
    def __init__(self):
        check_ocr_dependencies()
        get_gate_url(GATES[0])  # validate GATE_HOST / GATE_PASSWORD up front
        self.client = SupabaseRest.from_env()
        self.property_id = require_uuid_env("PROPERTY_ID")
        self.zone_id = require_uuid_env("GATE_ZONE_ID")
        self.tracker = FailureTracker()
        self.state = GateState(MAX_PER_MINUTE)
        self.current_date = ""


def run_once(ctx):
    """Read all gates, write this interval's entries/exits, bump the daily row."""
    now_utc = datetime.now(timezone.utc)
    now_cairo = now_utc.astimezone(CAIRO)
    today = now_cairo.strftime("%Y-%m-%d")
    if ctx.current_date and ctx.current_date != today:
        # Baselines are kept on purpose: the camera counters do not reset at
        # midnight, so the first interval of the new day is still a valid delta.
        logger.info(f"=== New day (Africa/Cairo): {today} ===")
    ctx.current_date = today

    FRAME_DIR.mkdir(parents=True, exist_ok=True)
    now_ts = time.time()
    entries = exits = 0
    measured = False
    flagged = False

    for i, gate in enumerate(GATES):
        enter, leave, err = read_gate(gate, FRAME_DIR / f"gate_{i + 1}.jpg")
        if err:
            logger.warning(f"{gate['name']}: {err}")
            flagged = True
            continue
        d_in, d_out = ctx.state.update(gate["name"], enter, leave, now_ts)
        flags = d_in.flags + d_out.flags
        if any(f.startswith("capped") or f == "counter_reset" for f in flags):
            flagged = True
            logger.warning(f"{gate['name']}: flags={flags}")
        if "baseline" not in d_in.flags:
            measured = True
        entries += d_in.delta
        exits += d_out.delta
        logger.info(f"{gate['name']}: cum={enter}/{leave}  interval=+{d_in.delta}/+{d_out.delta}")

    if not measured:
        logger.info("No gate had a previous baseline yet (or none readable); nothing written this cycle")
        return None

    confidence = CONFIDENCE_FLAGGED if flagged else CONFIDENCE_OK
    ts = now_utc.isoformat()
    push_interval_footfall(ctx.client, ctx.tracker, zone_id=ctx.zone_id,
                           entries=entries, exits=exits, confidence=confidence, timestamp=ts)
    add_to_footfall_daily(ctx.client, ctx.tracker, property_id=ctx.property_id,
                          zone_id=ctx.zone_id, date=today, add_in=entries,
                          add_out=exits, hour=now_cairo.hour)
    logger.info(
        f"Interval: +{entries} in / +{exits} out (confidence {confidence}); "
        f"write failures total={ctx.tracker.total_failures}"
    )
    return {"entries": entries, "exits": exits, "confidence": confidence, "date": today}


def run_continuous(ctx):
    logger.info("Wedja Gate Counter v3 — per-interval deltas")
    logger.info(f"Gates: {len(GATES)}  Interval: {INTERVAL}s  Cap: {MAX_PER_MINUTE}/min per counter")
    cycle = 0
    while True:
        cycle += 1
        try:
            run_once(ctx)
        except TooManyPushFailures:
            raise
        except Exception as e:
            logger.error(f"Error in cycle {cycle}: {e}")
        time.sleep(INTERVAL)


def test_gates():
    check_ocr_dependencies()
    FRAME_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Testing {len(GATES)} gate cameras...")
    ok = True
    for i, gate in enumerate(GATES):
        enter, leave, err = read_gate(gate, FRAME_DIR / f"test_gate_{i + 1}.jpg")
        if err:
            ok = False
            logger.warning(f"  {gate['name']}: {err}")
        else:
            logger.info(f"  {gate['name']}: Enter={enter}, Leave={leave if leave is not None else '?'}")
    return ok


def main(argv):
    if "--test" in argv:
        return 0 if test_gates() else 1
    ctx = GateContext()
    try:
        if "--once" in argv:
            run_once(ctx)
        else:
            run_continuous(ctx)
    except TooManyPushFailures as e:
        logger.critical(f"Exiting: {e}")
        return 1
    except KeyboardInterrupt:
        logger.info("Stopping...")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
