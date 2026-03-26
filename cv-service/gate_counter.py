#!/usr/bin/env python3
"""
Wedja Gate Counter v2 — Delta-based counting from Hikvision gate cameras.

Cameras show cumulative Enter/Leave counts that DON'T reset at midnight.
They reset only on power cycle or network restart.

This counter:
1. Reads each camera's current cumulative count via OCR
2. Computes the DELTA (increase) since the last reading per camera
3. Maintains a running daily total
4. Pushes the daily total to Supabase (one reading, updated in place)

Usage:
    python gate_counter.py              # Run continuous (every 5 min)
    python gate_counter.py --once       # Single capture
    python gate_counter.py --test       # Test all gates
"""

import os
import sys
import re
import time
import json
import subprocess
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Config
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
INTERVAL = 300  # 5 minutes

PROPERTY_ID = "a0000000-0000-0000-0000-000000000001"
ENTRANCE_ZONE_ID = "b0000000-0000-0000-0000-000000000008"

FRAME_DIR = Path("/tmp/wedja_gates")
FRAME_DIR.mkdir(exist_ok=True)

GATE_USER = os.getenv("GATE_USERNAME", "admin")
GATE_PASS = os.getenv("GATE_PASSWORD", "")
GATE_IP = os.getenv("GATE_IP", "196.219.205.228")

GATES = [
    {"name": "Gate 1 Cam A", "port": 5541, "location": "Gate 1"},
    {"name": "Gate 1 Cam B", "port": 5542, "location": "Gate 1"},
    {"name": "Gate 2 Cam A", "port": 5543, "location": "Gate 2"},
    {"name": "Gate 2 Cam B", "port": 5544, "location": "Gate 2"},
    {"name": "Gate 3",       "port": 5545, "location": "Gate 3"},
    {"name": "Gate 4",       "port": 5546, "location": "Gate 4"},
]

def get_gate_url(gate):
    return f"rtsp://{GATE_USER}:{GATE_PASS}@{GATE_IP}:{gate['port']}/Streaming/Channels/101"

# ── Per-camera state tracking ──
# Stores last known cumulative count per camera
last_cam_counts = {}  # key: gate name, value: {"enter": int, "leave": int}

# Running daily totals (sum of all deltas today)
daily_totals = {"enter": 0, "leave": 0, "date": ""}


def capture_frame(rtsp_url, output_path):
    try:
        subprocess.run(
            ["ffmpeg", "-rtsp_transport", "tcp", "-i", rtsp_url,
             "-frames:v", "1", "-update", "1", "-y", str(output_path)],
            capture_output=True, timeout=15,
        )
        return output_path.exists() and output_path.stat().st_size > 0
    except Exception as e:
        print(f"  Capture error: {e}")
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

        try:
            import pytesseract
            text = pytesseract.image_to_string(thresh, config="--psm 6")
        except ImportError:
            text = ""

        enter_match = re.search(r'[Ee]nter\s*[:\s]\s*(\d+)', text)
        leave_match = re.search(r'[Ll]eave\s*[:\s]\s*(\d+)', text)

        enter_count = int(enter_match.group(1)) if enter_match else None
        leave_count = int(leave_match.group(1)) if leave_match else None
        return enter_count, leave_count
    except Exception as e:
        print(f"  OCR error: {e}")
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

        try:
            import pytesseract
            text = pytesseract.image_to_string(thresh, config="--psm 6 -c tessedit_char_whitelist=0123456789EnterLeavl: ")
            enter_match = re.search(r'(\d{1,6})', text.split('\n')[0] if text.strip() else "")
            leave_match = re.search(r'(\d{1,6})', text.split('\n')[1] if len(text.strip().split('\n')) > 1 else "")
            enter_count = int(enter_match.group(1)) if enter_match else None
            leave_count = int(leave_match.group(1)) if leave_match else None
            return enter_count, leave_count
        except ImportError:
            return None, None
    except:
        return None, None


def compute_delta(gate_name, new_enter, new_leave):
    """Compute delta since last reading for this camera."""
    global last_cam_counts

    if gate_name not in last_cam_counts:
        # First reading for this camera — set baseline, delta = 0
        last_cam_counts[gate_name] = {"enter": new_enter, "leave": new_leave}
        return 0, 0

    last = last_cam_counts[gate_name]

    # Camera reset detection: if new < last, camera was restarted
    if new_enter < last["enter"]:
        # Camera reset — treat new value as the delta since reset
        delta_enter = new_enter
        delta_leave = new_leave
    else:
        # Normal increment
        delta_enter = new_enter - last["enter"]
        delta_leave = (new_leave or 0) - (last["leave"] or 0)

    # Update last known
    last_cam_counts[gate_name] = {"enter": new_enter, "leave": new_leave}

    return max(0, delta_enter), max(0, delta_leave)


def push_daily_total(enter_total, leave_total):
    """Push today's running total to Supabase footfall_readings."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return False

    now = datetime.now(timezone.utc).isoformat()
    row = {
        "zone_id": ENTRANCE_ZONE_ID,
        "timestamp": now,
        "count_in": enter_total,
        "count_out": leave_total,
        "dwell_seconds": 0,
        "confidence": 0.95,
    }

    data = json.dumps(row).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/footfall_readings",
        data=data,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="POST",
    )
    try:
        urllib.request.urlopen(req)
        return True
    except Exception as e:
        print(f"  Push error: {e}")
        return False


def run_once():
    """Capture all gates, compute deltas, update daily total."""
    global daily_totals

    timestamp = datetime.now().strftime("%H:%M:%S")
    today = datetime.now().strftime("%Y-%m-%d")

    # Reset daily totals at midnight
    if daily_totals["date"] != today:
        print(f"\n  === New day: {today} — resetting daily totals ===")
        daily_totals = {"enter": 0, "leave": 0, "date": today}
        last_cam_counts.clear()

    print(f"\n[{timestamp}] Reading gate cameras...")

    cycle_delta_enter = 0
    cycle_delta_leave = 0

    for i, gate in enumerate(GATES):
        frame_path = FRAME_DIR / f"gate_{i+1}.jpg"

        if not capture_frame(get_gate_url(gate), frame_path):
            print(f"  {gate['name']}: CAPTURE FAILED")
            continue

        # OCR
        enter_count, leave_count = read_osd_counts(frame_path)
        if enter_count is None:
            enter_count, leave_count = read_osd_simple(frame_path)

        if enter_count is not None:
            delta_e, delta_l = compute_delta(gate["name"], enter_count, leave_count or 0)
            print(f"  {gate['name']}: Cum={enter_count}/{leave_count or 0}  Delta=+{delta_e}/+{delta_l}")
            cycle_delta_enter += delta_e
            cycle_delta_leave += delta_l
        else:
            print(f"  {gate['name']}: OCR failed")

        try:
            frame_path.unlink()
        except:
            pass

    # Update daily running total
    daily_totals["enter"] += cycle_delta_enter
    daily_totals["leave"] += cycle_delta_leave

    print(f"\n  Cycle delta: +{cycle_delta_enter} enter, +{cycle_delta_leave} leave")
    print(f"  DAILY TOTAL: {daily_totals['enter']} enter, {daily_totals['leave']} leave")

    # Push to Supabase
    if daily_totals["enter"] > 0 or daily_totals["leave"] > 0:
        success = push_daily_total(daily_totals["enter"], daily_totals["leave"])
        print(f"  Pushed: {'OK' if success else 'FAILED'}")

    return daily_totals.copy()


def run_continuous():
    print("Wedja Gate Counter v2 — Delta-based")
    print(f"Cameras: {len(GATES)} gates on {GATE_IP}")
    print(f"Interval: {INTERVAL}s ({INTERVAL//60} min)")
    print(f"Supabase: {'configured' if SUPABASE_URL else 'NOT configured'}")
    print("---")

    cycle = 0
    while True:
        cycle += 1
        try:
            result = run_once()
            print(f"  Cycle {cycle} complete")
        except KeyboardInterrupt:
            print("\nStopping...")
            break
        except Exception as e:
            print(f"  Error in cycle {cycle}: {e}")

        time.sleep(INTERVAL)


def test_gates():
    print("Testing 6 gate cameras...")
    for i, gate in enumerate(GATES):
        frame_path = FRAME_DIR / f"test_gate_{i+1}.jpg"
        if capture_frame(get_gate_url(gate), frame_path):
            size = frame_path.stat().st_size
            enter, leave = read_osd_counts(frame_path)
            if enter is None:
                enter, leave = read_osd_simple(frame_path)
            if enter is not None:
                print(f"  ✓ {gate['name']}: Enter={enter}, Leave={leave or '?'} ({size} bytes)")
            else:
                print(f"  ~ {gate['name']}: Connected but OCR failed ({size} bytes)")
            frame_path.unlink(missing_ok=True)
        else:
            print(f"  ✗ {gate['name']}: FAILED")


if __name__ == "__main__":
    if "--test" in sys.argv:
        test_gates()
    elif "--once" in sys.argv:
        run_once()
    else:
        run_continuous()
