#!/usr/bin/env python3
"""
Wedja CV Service — Live People Counter (single camera, via ffmpeg)

Captures a frame from one camera, counts the people VISIBLE in it with YOLO
and writes that number as zone OCCUPANCY (occupancy_readings.current_count).

A snapshot count is not an entry count: it is never written to
footfall_readings.count_in, and no exit count is invented.

Required environment (no defaults — the script fails fast if missing):
    RTSP_HOST              camera / NAT host to connect to
    RTSP_PASSWORD          camera password
    SUPABASE_URL, SUPABASE_SERVICE_KEY, PROPERTY_ID, LIVE_COUNT_ZONE_ID
                           (only when pushing; not needed with --test/--no-push)
Optional:
    RTSP_USERNAME (admin), RTSP_PORT (554), RTSP_CHANNEL (101),
    YOLO_CONFIDENCE (0.15), YOLO_IMAGE_SIZE (1280), CAPTURE_INTERVAL_SECONDS (300)

Usage:
    python live_count.py                    # Run continuous counting
    python live_count.py --once             # Single capture + count + push
    python live_count.py --once --no-push   # Single capture + count only
    python live_count.py --test             # Test connection only
"""

import logging
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from dotenv import load_dotenv

from api.push_results import (
    FailureTracker,
    SupabaseRest,
    TooManyPushFailures,
    push_occupancy,
    require_env,
    require_uuid_env,
)

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("wedja-live")

YOLO_CONF = float(os.getenv("YOLO_CONFIDENCE", "0.15"))
YOLO_SIZE = int(os.getenv("YOLO_IMAGE_SIZE", "1280"))
INTERVAL = int(os.getenv("CAPTURE_INTERVAL_SECONDS", "300"))

FRAME_DIR = Path(tempfile.gettempdir()) / "wedja_frames"

_model = None


def get_rtsp_url():
    """Build the RTSP URL from required env vars (no baked-in host/password)."""
    host = require_env("RTSP_HOST", "camera or NAT host; never commit real values")
    password = require_env("RTSP_PASSWORD")
    user = os.getenv("RTSP_USERNAME", "admin")
    port = os.getenv("RTSP_PORT", "554")
    channel = os.getenv("RTSP_CHANNEL", "101")
    return f"rtsp://{user}:{password}@{host}:{port}/Streaming/Channels/{channel}"


def redact(url):
    return url.split("@", 1)[-1]


def capture_frame(rtsp_url, output_path):
    """Capture a single frame from RTSP stream using ffmpeg."""
    try:
        subprocess.run(
            [
                "ffmpeg", "-rtsp_transport", "tcp",
                "-i", rtsp_url,
                "-frames:v", "1", "-update", "1",
                "-y", str(output_path),
            ],
            capture_output=True,
            timeout=15,
        )
        return output_path.exists() and output_path.stat().st_size > 0
    except Exception as e:
        logger.error(f"Capture error: {e}")
        return False


def count_people(image_path):
    """Run YOLO on image, return (people visible, detections)."""
    global _model
    if _model is None:
        from ultralytics import YOLO
        _model = YOLO(os.getenv("YOLO_MODEL", "yolov8n.pt"))
    results = _model(str(image_path), conf=YOLO_CONF, classes=[0], imgsz=YOLO_SIZE, verbose=False)

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


class PushTarget:
    def __init__(self):
        self.client = SupabaseRest.from_env()
        self.property_id = require_uuid_env("PROPERTY_ID")
        self.zone_id = require_uuid_env("LIVE_COUNT_ZONE_ID")
        self.tracker = FailureTracker()


def run_once(url, target=None):
    """Capture one frame, count visible people, optionally write occupancy."""
    FRAME_DIR.mkdir(parents=True, exist_ok=True)
    frame_path = FRAME_DIR / f"frame_{int(time.time())}.jpg"
    logger.info(f"Capturing from {redact(url)}...")

    if not capture_frame(url, frame_path):
        logger.warning("Failed to capture frame")
        return None

    try:
        count, detections = count_people(frame_path)
    finally:
        frame_path.unlink(missing_ok=True)

    avg_conf = sum(d["confidence"] for d in detections) / len(detections) if detections else 0
    logger.info(f"People visible: {count} (avg confidence {avg_conf:.2f}) — occupancy, not entries")

    if target is not None:
        ok = push_occupancy(target.client, target.tracker, property_id=target.property_id,
                            zone_id=target.zone_id, people_visible=count)
        logger.info(f"occupancy_readings write: {'OK' if ok else 'FAILED'}")

    return {"count": count, "detections": detections, "confidence": avg_conf}


def run_continuous(url, target):
    logger.info("Wedja CV Service — Live People Counter (occupancy)")
    logger.info(f"Camera: {redact(url)}  Interval: {INTERVAL}s  YOLO: conf={YOLO_CONF}, size={YOLO_SIZE}")
    cycle = 0
    while True:
        cycle += 1
        try:
            run_once(url, target)
        except TooManyPushFailures:
            raise
        except Exception as e:
            logger.error(f"Error in cycle {cycle}: {e}")
        time.sleep(INTERVAL)


def test_connection(url):
    """Test RTSP connection without YOLO."""
    FRAME_DIR.mkdir(parents=True, exist_ok=True)
    frame_path = FRAME_DIR / "test_frame.jpg"
    logger.info(f"Testing: {redact(url)}")
    if capture_frame(url, frame_path):
        logger.info(f"SUCCESS — frame captured ({frame_path.stat().st_size} bytes)")
        frame_path.unlink(missing_ok=True)
        return True
    logger.error("FAILED — could not capture frame")
    return False


def main(argv):
    url = get_rtsp_url()
    if "--test" in argv:
        return 0 if test_connection(url) else 1
    target = None if "--no-push" in argv else PushTarget()
    try:
        if "--once" in argv:
            return 0 if run_once(url, target) is not None else 1
        run_continuous(url, target)
    except TooManyPushFailures as e:
        logger.critical(f"Exiting: {e}")
        return 1
    except KeyboardInterrupt:
        logger.info("Stopping...")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
