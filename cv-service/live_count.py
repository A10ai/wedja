#!/usr/bin/env python3
"""
Wedja CV Service — Live People Counter
Captures frames from Senzo Mall cameras, counts people with YOLO,
and pushes results to Supabase.

Usage:
    python live_count.py                    # Run continuous counting
    python live_count.py --once             # Single capture + count
    python live_count.py --test             # Test connection only
"""

import os
import sys
import time
import json
import subprocess
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Config
RTSP_USER = os.getenv("RTSP_USERNAME", "admin")
RTSP_PASS = os.getenv("RTSP_PASSWORD", "senzo1234")
RTSP_PUBLIC_IP = os.getenv("RTSP_PUBLIC_IP", "196.219.205.230")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
YOLO_CONF = float(os.getenv("YOLO_CONFIDENCE", "0.15"))
YOLO_SIZE = int(os.getenv("YOLO_IMAGE_SIZE", "1280"))
INTERVAL = int(os.getenv("CAPTURE_INTERVAL_SECONDS", "30"))

FRAME_DIR = Path("/tmp/wedja_frames")
FRAME_DIR.mkdir(exist_ok=True)

# Property and zone IDs (Senzo Mall)
PROPERTY_ID = "a0000000-0000-0000-0000-000000000001"
ZONE_MAP = {
    "entrance": "b0000000-0000-0000-0000-000000000008",  # Common Areas
    "fashion_core": "b0000000-0000-0000-0000-000000000001",
    "food_court": "b0000000-0000-0000-0000-000000000003",
    "entertainment": "b0000000-0000-0000-0000-000000000004",
    "anchor": "b0000000-0000-0000-0000-000000000005",
    "electronics": "b0000000-0000-0000-0000-000000000006",
    "services": "b0000000-0000-0000-0000-000000000006",
    "parking": "b0000000-0000-0000-0000-000000000007",
    "common": "b0000000-0000-0000-0000-000000000008",
    "kiosk_area": "b0000000-0000-0000-0000-000000000002",
}


def get_rtsp_url(ip=None, channel="101"):
    """Build RTSP URL. Uses public IP if no internal IP given."""
    host = ip or RTSP_PUBLIC_IP
    return f"rtsp://{RTSP_USER}:{RTSP_PASS}@{host}:554/Streaming/Channels/{channel}"


def capture_frame(rtsp_url, output_path):
    """Capture a single frame from RTSP stream using ffmpeg."""
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-rtsp_transport", "tcp",
                "-i", rtsp_url,
                "-frames:v", "1", "-update", "1",
                "-y", str(output_path),
            ],
            capture_output=True,
            timeout=10,
        )
        return output_path.exists() and output_path.stat().st_size > 0
    except (subprocess.TimeoutExpired, Exception) as e:
        print(f"  Capture error: {e}")
        return False


def count_people(image_path):
    """Run YOLO on image, return people count and detections."""
    try:
        from ultralytics import YOLO

        model = YOLO("yolov8n.pt")
        results = model(str(image_path), conf=YOLO_CONF, classes=[0], imgsz=YOLO_SIZE, verbose=False)

        detections = []
        for r in results:
            for b in r.boxes:
                if int(b.cls[0]) == 0:
                    x1, y1, x2, y2 = b.xyxy[0].tolist()
                    detections.append({
                        "confidence": round(float(b.conf[0]), 3),
                        "bbox": [int(x1), int(y1), int(x2), int(y2)],
                    })

        return len(detections), detections
    except Exception as e:
        print(f"  YOLO error: {e}")
        return 0, []


def push_to_supabase(zone_id, count_in, confidence_avg):
    """Push footfall reading to Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("  Supabase not configured, skipping push")
        return False

    now = datetime.now(timezone.utc).isoformat()
    row = {
        "zone_id": zone_id,
        "timestamp": now,
        "count_in": count_in,
        "count_out": max(0, count_in - 1),  # approximate
        "dwell_seconds": 0,
        "confidence": round(confidence_avg, 3),
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
        print(f"  Supabase push error: {e}")
        return False


def run_once(rtsp_url=None, zone="common", push=True):
    """Capture one frame, count people, optionally push to Supabase."""
    url = rtsp_url or get_rtsp_url()
    frame_path = FRAME_DIR / f"frame_{int(time.time())}.jpg"

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Capturing from {url.split('@')[1]}...")

    if not capture_frame(url, frame_path):
        print("  Failed to capture frame")
        return None

    count, detections = count_people(frame_path)
    avg_conf = sum(d["confidence"] for d in detections) / len(detections) if detections else 0

    print(f"  People: {count} (avg confidence: {avg_conf:.2f})")

    if push and count > 0:
        zone_id = ZONE_MAP.get(zone, ZONE_MAP["common"])
        success = push_to_supabase(zone_id, count, avg_conf)
        print(f"  Pushed to Supabase: {'OK' if success else 'FAILED'}")

    # Cleanup frame
    try:
        frame_path.unlink()
    except:
        pass

    return {"count": count, "detections": detections, "confidence": avg_conf}


def run_continuous():
    """Run continuous counting loop."""
    print(f"Wedja CV Service — Live People Counter")
    print(f"Camera: {RTSP_PUBLIC_IP}")
    print(f"Interval: {INTERVAL}s")
    print(f"YOLO: conf={YOLO_CONF}, size={YOLO_SIZE}")
    print(f"Supabase: {'configured' if SUPABASE_URL else 'NOT configured'}")
    print(f"---")

    cycle = 0
    while True:
        cycle += 1
        try:
            result = run_once()
            if result:
                print(f"  Cycle {cycle} complete — {result['count']} people")
        except KeyboardInterrupt:
            print("\nStopping...")
            break
        except Exception as e:
            print(f"  Error in cycle {cycle}: {e}")

        time.sleep(INTERVAL)


def test_connection():
    """Test RTSP connection without YOLO."""
    url = get_rtsp_url()
    print(f"Testing: {url.split('@')[1]}")
    frame_path = FRAME_DIR / "test_frame.jpg"

    if capture_frame(url, frame_path):
        size = frame_path.stat().st_size
        print(f"  SUCCESS — Frame captured ({size} bytes)")
        frame_path.unlink(missing_ok=True)
        return True
    else:
        print("  FAILED — Could not capture frame")
        return False


if __name__ == "__main__":
    if "--test" in sys.argv:
        test_connection()
    elif "--once" in sys.argv:
        run_once()
    else:
        run_continuous()
