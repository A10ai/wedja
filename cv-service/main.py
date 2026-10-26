"""
Wedja CV Service — Main Entry Point (snapshot occupancy)

Connects to Senzo Mall's Hikvision cameras, counts the people VISIBLE in a
snapshot using YOLO, and writes that as zone OCCUPANCY (occupancy_readings).

A snapshot count is "people in view right now", not "people who entered".
It is never written to footfall_readings.count_in. Entries/exits come only
from line-crossing counters (see gate_counter.py).

Only cameras resolved to a camera_feeds row (UUID + zone) are processed; the
rest are skipped with a warning at startup (see config/camera_mapping.py).

Usage:
    python main.py                    # Run continuous counting on mapped cameras
    python main.py --test IP          # Test one camera (no database writes)
    python main.py --snapshot IP      # Same as --test
    python main.py --list             # List all registered cameras
"""

import os
import sys
import time
import logging
import argparse
from collections import defaultdict

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

from config.cameras import CAMERAS, COUNTING_CAMERAS, GATE_CAMERAS, get_rtsp_url  # noqa: E402
from config.camera_mapping import resolve_cameras  # noqa: E402
from api.push_results import (  # noqa: E402
    ConfigError,
    FailureTracker,
    SupabaseRest,
    TooManyPushFailures,
    fetch_camera_feeds,
    push_occupancy,
    require_env,
    require_uuid_env,
)


def camera_credentials():
    username = os.getenv("CAMERA_USERNAME", "admin")
    password = require_env("CAMERA_PASSWORD", "RTSP password for the internal camera network")
    return username, password


def test_camera(ip: str):
    """Test connection to a single camera and count people."""
    from capture.rtsp_reader import RTSPReader
    from detection.people_counter import count_people

    username, password = camera_credentials()

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

    logger.info(f"✅ People visible in frame: {result['count']} (occupancy, not entries)")
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


class SnapshotContext:
    """Everything a snapshot cycle needs, resolved once at startup."""

    def __init__(self):
        self.username, self.password = camera_credentials()
        self.confidence = float(os.getenv("CONFIDENCE_THRESHOLD", "0.5"))
        self.property_id = require_uuid_env("PROPERTY_ID")
        self.client = SupabaseRest.from_env()
        self.tracker = FailureTracker()

        feeds = fetch_camera_feeds(self.client, self.property_id)
        self.cameras, skipped = resolve_cameras(COUNTING_CAMERAS, feeds)
        for cam_id, reason in skipped:
            logger.warning(f"[{cam_id}] SKIPPED — not mapped to camera_feeds: {reason}")
        logger.info(
            f"Camera mapping: {len(self.cameras)} mapped, {len(skipped)} skipped "
            f"(of {len(COUNTING_CAMERAS)} counting cameras; {len(feeds)} camera_feeds rows)"
        )
        if not self.cameras:
            raise ConfigError(
                "no counting camera could be mapped to a camera_feeds row with a zone. "
                "Register feeds named after the camera ids (e.g. 'N2-D1') or set feed_id in config/cameras.py."
            )


def run_snapshot_cycle(ctx: SnapshotContext):
    """Snapshot each mapped camera, count visible people, write zone occupancy."""
    from capture.rtsp_reader import RTSPReader
    from detection.people_counter import count_people

    zone_people = defaultdict(int)
    zone_cams_ok = defaultdict(int)
    zone_cams_total = defaultdict(int)
    cameras_failed = 0

    for cam in ctx.cameras:
        zone_cams_total[cam["zone_id"]] += 1
        try:
            rtsp_url = get_rtsp_url(cam, ctx.username, ctx.password, sub_stream=True)
            reader = RTSPReader(rtsp_url, cam["id"])
            frame = reader.get_snapshot()

            if frame is None:
                cameras_failed += 1
                logger.warning(f"[{cam['id']}] {cam['location']} — no frame")
                continue

            result = count_people(frame, confidence=ctx.confidence)
            zone_people[cam["zone_id"]] += result["count"]
            zone_cams_ok[cam["zone_id"]] += 1
            if result["count"] > 0:
                logger.info(
                    f"[{cam['id']}] {cam['location']}: {result['count']} visible "
                    f"({result['processing_time_ms']}ms)"
                )
        except Exception as e:
            cameras_failed += 1
            logger.error(f"[{cam['id']}] {cam['location']} capture/detect error: {e}")

    # One occupancy row per zone per cycle (only zones with at least one frame)
    written = 0
    for zone_id, ok in zone_cams_ok.items():
        if ok < zone_cams_total[zone_id]:
            logger.warning(
                f"zone {zone_id}: only {ok}/{zone_cams_total[zone_id]} cameras returned a frame; "
                f"occupancy is partial"
            )
        if push_occupancy(ctx.client, ctx.tracker, property_id=ctx.property_id,
                          zone_id=zone_id, people_visible=zone_people[zone_id]):
            written += 1

    logger.info(
        f"Cycle complete: {sum(zone_cams_ok.values())} cameras ok, {cameras_failed} failed, "
        f"{written}/{len(zone_cams_ok)} zone occupancy rows written, "
        f"{sum(zone_people.values())} people visible; "
        f"write failures total={ctx.tracker.total_failures}"
    )


def run_continuous():
    """Run continuous counting on a schedule."""
    import schedule
    from detection.people_counter import load_model

    interval = int(os.getenv("CAPTURE_INTERVAL_SECONDS", "300"))
    ctx = SnapshotContext()

    logger.info("=" * 60)
    logger.info("Wedja CV Service Starting (snapshot occupancy)")
    logger.info(f"Cameras registered: {len(CAMERAS)}")
    logger.info(f"Counting cameras mapped: {len(ctx.cameras)}/{len(COUNTING_CAMERAS)}")
    logger.info(f"Capture interval: {interval}s")
    logger.info("=" * 60)

    logger.info("Loading YOLO model...")
    load_model(os.getenv("YOLO_MODEL", "yolov8n.pt"))
    logger.info("YOLO model ready")

    schedule.every(interval).seconds.do(run_snapshot_cycle, ctx)
    run_snapshot_cycle(ctx)

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
        try:
            run_continuous()
        except TooManyPushFailures as e:
            logger.critical(f"Exiting: {e}")
            sys.exit(1)
