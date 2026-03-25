#!/usr/bin/env python3
"""
Wedja Gate Counter — Reads built-in people counting from 6 Hikvision gate cameras.

These DS-2CD6825G0/C-IVS cameras have built-in counting displayed on the OSD:
  Enter: XXX
  Leave: XXX

We capture a frame from each gate, OCR the Enter/Leave numbers,
and push the totals to Supabase.

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
INTERVAL = 300  # 5 minutes — gate counts don't change fast

PROPERTY_ID = "a0000000-0000-0000-0000-000000000001"
ENTRANCE_ZONE_ID = "b0000000-0000-0000-0000-000000000008"  # Common Areas

FRAME_DIR = Path("/tmp/wedja_gates")
FRAME_DIR.mkdir(exist_ok=True)

GATES = [
    {"name": "Gate 1 Cam A", "url": "rtsp://admin:Hik12345@196.219.205.228:5541/Streaming/Channels/101", "location": "Gate 1"},
    {"name": "Gate 1 Cam B", "url": "rtsp://admin:Hik12345@196.219.205.228:5542/Streaming/Channels/101", "location": "Gate 1"},
    {"name": "Gate 2 Cam A", "url": "rtsp://admin:Hik12345@196.219.205.228:5543/Streaming/Channels/101", "location": "Gate 2"},
    {"name": "Gate 2 Cam B", "url": "rtsp://admin:Hik12345@196.219.205.228:5544/Streaming/Channels/101", "location": "Gate 2"},
    {"name": "Gate 3",       "url": "rtsp://admin:Hik12345@196.219.205.228:5545/Streaming/Channels/101", "location": "Gate 3"},
    {"name": "Gate 4",       "url": "rtsp://admin:Hik12345@196.219.205.228:5546/Streaming/Channels/101", "location": "Gate 4"},
]


def capture_frame(rtsp_url, output_path):
    """Capture one frame via ffmpeg."""
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
    """Read Enter/Leave counts from Hikvision OSD overlay using OCR on the top-right corner."""
    try:
        import cv2
        import numpy as np

        img = cv2.imread(str(image_path))
        if img is None:
            return None, None

        h, w = img.shape[:2]
        # OSD text is in top-right corner — crop that region
        roi = img[0:int(h * 0.12), int(w * 0.65):]

        # Convert to grayscale and threshold for white text
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)

        # Try pytesseract OCR
        try:
            import pytesseract
            text = pytesseract.image_to_string(thresh, config="--psm 6")
        except ImportError:
            # Fallback: use the full image and regex on any OCR
            text = ""

        # Parse Enter:XXX and Leave:XXX
        enter_match = re.search(r'[Ee]nter\s*[:\s]\s*(\d+)', text)
        leave_match = re.search(r'[Ll]eave\s*[:\s]\s*(\d+)', text)

        enter_count = int(enter_match.group(1)) if enter_match else None
        leave_count = int(leave_match.group(1)) if leave_match else None

        return enter_count, leave_count

    except Exception as e:
        print(f"  OCR error: {e}")
        return None, None


def read_osd_simple(image_path):
    """Simple approach: read OSD by looking at pixel patterns in the white text area."""
    try:
        import cv2

        img = cv2.imread(str(image_path))
        if img is None:
            return None, None

        h, w = img.shape[:2]

        # The OSD shows "Enter:XXX" and "Leave:XXX" in white text
        # Top-right corner, approximately top 10% height, right 30% width
        roi = img[0:int(h * 0.10), int(w * 0.70):]

        # Convert to grayscale
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

        # Threshold high (white text on dark/gray background)
        _, thresh = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)

        # Try tesseract
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

    except Exception as e:
        return None, None


def push_gate_reading(gate_name, location, enter_count, leave_count):
    """Push gate reading to Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return False

    now = datetime.now(timezone.utc).isoformat()
    row = {
        "zone_id": ENTRANCE_ZONE_ID,
        "timestamp": now,
        "count_in": enter_count or 0,
        "count_out": leave_count or 0,
        "dwell_seconds": 0,
        "confidence": 0.95,  # built-in counting is highly accurate
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
    """Capture all gates, read counts, push to Supabase."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"\n[{timestamp}] Reading all gate cameras...")

    total_enter = 0
    total_leave = 0
    gate_results = []

    for i, gate in enumerate(GATES):
        frame_path = FRAME_DIR / f"gate_{i+1}.jpg"

        if not capture_frame(gate["url"], frame_path):
            print(f"  {gate['name']}: CAPTURE FAILED")
            continue

        # Try OCR
        enter_count, leave_count = read_osd_counts(frame_path)
        if enter_count is None:
            enter_count, leave_count = read_osd_simple(frame_path)

        if enter_count is not None:
            print(f"  {gate['name']}: Enter={enter_count}, Leave={leave_count or 0}")
            total_enter += enter_count
            total_leave += (leave_count or 0)
            gate_results.append({
                "gate": gate["name"],
                "location": gate["location"],
                "enter": enter_count,
                "leave": leave_count or 0,
            })
        else:
            # Fallback: run YOLO
            try:
                from ultralytics import YOLO
                model = YOLO("yolov8n.pt")
                results = model(str(frame_path), conf=0.15, classes=[0], imgsz=1280, verbose=False)
                count = sum(1 for r in results for b in r.boxes if int(b.cls[0]) == 0)
                print(f"  {gate['name']}: YOLO fallback = {count} people")
                total_enter += count
                gate_results.append({
                    "gate": gate["name"],
                    "location": gate["location"],
                    "enter": count,
                    "leave": 0,
                    "method": "yolo",
                })
            except Exception as e:
                print(f"  {gate['name']}: No count available ({e})")

        # Cleanup
        try:
            frame_path.unlink()
        except:
            pass

    # Push total to Supabase
    if total_enter > 0 or total_leave > 0:
        success = push_gate_reading("all_gates", "All Gates", total_enter, total_leave)
        print(f"\n  TOTAL: Enter={total_enter}, Leave={total_leave}")
        print(f"  Pushed to Supabase: {'OK' if success else 'FAILED'}")
    else:
        print(f"\n  No counts detected from any gate")

    return {"total_enter": total_enter, "total_leave": total_leave, "gates": gate_results}


def run_continuous():
    """Run gate counting loop."""
    print("Wedja Gate Counter — 6 Gate Cameras")
    print(f"Interval: {INTERVAL}s ({INTERVAL//60} minutes)")
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
            print(f"  Error: {e}")

        time.sleep(INTERVAL)


def test_gates():
    """Test all gate connections."""
    print("Testing 6 gate cameras...")
    for i, gate in enumerate(GATES):
        frame_path = FRAME_DIR / f"test_gate_{i+1}.jpg"
        if capture_frame(gate["url"], frame_path):
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
