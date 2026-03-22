"""
Wedja CV Service — Main Entry Point

Connects to Senzo Mall's 172 Hikvision cameras,
counts people using YOLO, and pushes results to Supabase.

Usage:
    python main.py                    # Run continuous counting on all cameras
    python main.py --test IP          # Test one camera
    python main.py --snapshot IP      # Take one snapshot and count
    python main.py --list             # List all registered cameras
"""

import os
import sys
import time
import logging
import argparse
import schedule
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("wedja-cv")

from config.cameras import CAMERAS, COUNTING_CAMERAS, GATE_CAMERAS, get_rtsp_url
from capture.rtsp_reader import RTSPReader
from detection.people_counter import count_people, load_model
from api.push_results import push_footfall_reading, push_daily_summary


def test_camera(ip: str):
    """Test connection to a single camera and count people."""
    username = os.getenv("CAMERA_USERNAME", "admin")
    password = os.getenv("CAMERA_PASSWORD", "")

    if not password:
        logger.error("Set CAMERA_PASSWORD in .env file")
        return

    # Find camera in registry
    cam = None
    for c in CAMERAS:
        if c["ip"] == ip:
            cam = c
            break

    if not cam:
        logger.warning(f"Camera {ip} not in registry, using default settings")
        cam = {"id": "test", "ip": ip, "location": "Unknown"}

    rtsp_url = f"rtsp://{username}:{password}@{ip}:554/Streaming/Channels/102"
    logger.info(f"Testing camera: {cam.get('location', ip)}")
    logger.info(f"RTSP URL: rtsp://{username}:***@{ip}:554/Streaming/Channels/102")

    reader = RTSPReader(rtsp_url, cam["id"])
    frame = reader.get_snapshot()

    if frame is None:
        logger.error("❌ Failed to capture frame. Check IP, credentials, and network.")
        return

    logger.info(f"✅ Frame captured: {frame.shape[1]}x{frame.shape[0]}")

    # Load YOLO and count
    logger.info("Loading YOLO model...")
    result = count_people(frame, confidence=float(os.getenv("CONFIDENCE_THRESHOLD", "0.5")))

    logger.info(f"✅ People detected: {result['count']}")
    logger.info(f"   Processing time: {result['processing_time_ms']}ms")
    logger.info(f"   Frame size: {result['frame_size']}")

    for i, det in enumerate(result["detections"]):
        logger.info(f"   Person {i+1}: confidence={det['confidence']:.2f}")

    # Optionally save annotated frame
    try:
        import cv2
        for det in result["detections"]:
            x1, y1, x2, y2 = int(det["x1"]), int(det["y1"]), int(det["x2"]), int(det["y2"])
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(frame, f"{det['confidence']:.2f}", (x1, y1 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

        output_path = f"test_output_{cam['id']}.jpg"
        cv2.imwrite(output_path, frame)
        logger.info(f"✅ Annotated frame saved: {output_path}")
    except Exception as e:
        logger.warning(f"Could not save annotated frame: {e}")


def run_snapshot_cycle():
    """Take a snapshot from each counting camera and count people."""
    username = os.getenv("CAMERA_USERNAME", "admin")
    password = os.getenv("CAMERA_PASSWORD", "")
    confidence = float(os.getenv("CONFIDENCE_THRESHOLD", "0.5"))
    property_id = os.getenv("PROPERTY_ID", "a0000000-0000-0000-0000-000000000001")

    if not password:
        logger.error("Set CAMERA_PASSWORD in .env")
        return

    total_counted = 0
    cameras_processed = 0
    cameras_failed = 0

    for cam in COUNTING_CAMERAS:
        try:
            rtsp_url = get_rtsp_url(cam, username, password, sub_stream=True)
            reader = RTSPReader(rtsp_url, cam["id"])
            frame = reader.get_snapshot()

            if frame is None:
                cameras_failed += 1
                logger.warning(f"[{cam['id']}] {cam['location']} — no frame")
                continue

            result = count_people(frame, confidence=confidence)
            count = result["count"]
            total_counted += count
            cameras_processed += 1

            # Push to Supabase
            # Map camera zone to zone_id (would need a lookup table in production)
            push_footfall_reading(
                zone_id=cam.get("zone_id", ""),
                unit_id=cam.get("unit_id"),
                camera_id=cam["id"],
                count_in=count,
                confidence=min(det["confidence"] for det in result["detections"]) if result["detections"] else 0.5,
            )

            if count > 0:
                logger.info(f"[{cam['id']}] {cam['location']}: {count} people ({result['processing_time_ms']}ms)")

        except Exception as e:
            cameras_failed += 1
            logger.error(f"[{cam['id']}] {cam['location']} error: {e}")

    logger.info(
        f"Cycle complete: {cameras_processed} cameras, "
        f"{cameras_failed} failed, {total_counted} total people"
    )


def run_continuous():
    """Run continuous counting on a schedule."""
    interval = int(os.getenv("CAPTURE_INTERVAL_SECONDS", "10"))

    logger.info("=" * 60)
    logger.info("Wedja CV Service Starting")
    logger.info(f"Cameras registered: {len(CAMERAS)}")
    logger.info(f"Counting cameras: {len(COUNTING_CAMERAS)}")
    logger.info(f"Gate cameras: {len(GATE_CAMERAS)}")
    logger.info(f"Capture interval: {interval}s")
    logger.info("=" * 60)

    # Pre-load YOLO model
    logger.info("Loading YOLO model...")
    load_model(os.getenv("YOLO_MODEL", "yolov8n.pt"))
    logger.info("YOLO model ready")

    # Schedule snapshot cycles
    schedule.every(interval).seconds.do(run_snapshot_cycle)

    # Run immediately once
    run_snapshot_cycle()

    # Keep running
    logger.info(f"Running every {interval} seconds. Press Ctrl+C to stop.")
    try:
        while True:
            schedule.run_pending()
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Stopping...")


def list_cameras():
    """Print all registered cameras."""
    print(f"\nSenzo Mall Camera Registry — {len(CAMERAS)} cameras\n")
    print(f"{'ID':<12} {'IP':<18} {'Type':<8} {'Res':<5} {'Location':<30} {'Zone':<15} {'Count'}")
    print("-" * 110)
    for cam in CAMERAS:
        counting = "✅" if cam.get("counting") else "—"
        print(
            f"{cam['id']:<12} {cam['ip']:<18} {cam['type']:<8} "
            f"{cam['resolution']:<5} {cam['location']:<30} {cam['zone']:<15} {counting}"
        )
    print(f"\nCounting cameras: {len(COUNTING_CAMERAS)}")
    print(f"Gate cameras: {len(GATE_CAMERAS)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Wedja CV Service — People Counting")
    parser.add_argument("--test", metavar="IP", help="Test one camera by IP address")
    parser.add_argument("--snapshot", metavar="IP", help="Take snapshot from one camera")
    parser.add_argument("--list", action="store_true", help="List all registered cameras")

    args = parser.parse_args()

    if args.list:
        list_cameras()
    elif args.test:
        test_camera(args.test)
    elif args.snapshot:
        test_camera(args.snapshot)  # Same as test for now
    else:
        run_continuous()
