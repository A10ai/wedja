"""
YOLO-based People Counter.
Detects and counts people in camera frames.
"""

import logging
from typing import Optional
import numpy as np

logger = logging.getLogger(__name__)

# YOLO model loaded lazily
_model = None


def load_model(model_path: str = "yolov8n.pt"):
    """Load YOLO model (downloads automatically on first use)."""
    global _model
    if _model is None:
        try:
            from ultralytics import YOLO
            _model = YOLO(model_path)
            logger.info(f"YOLO model loaded: {model_path}")
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            raise
    return _model


def count_people(
    frame: np.ndarray,
    model_path: str = "yolov8n.pt",
    confidence: float = 0.5,
) -> dict:
    """
    Count people in a frame using YOLO.

    Returns:
        {
            "count": int,
            "detections": [{"x1": float, "y1": float, "x2": float, "y2": float, "confidence": float}],
            "frame_size": (width, height),
            "processing_time_ms": float,
        }
    """
    import time
    start = time.time()

    model = load_model(model_path)

    # Run inference — class 0 is "person" in COCO
    results = model(frame, classes=[0], conf=confidence, verbose=False)

    detections = []
    for result in results:
        for box in result.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            detections.append({
                "x1": round(x1, 1),
                "y1": round(y1, 1),
                "x2": round(x2, 1),
                "y2": round(y2, 1),
                "confidence": round(conf, 3),
            })

    processing_time = (time.time() - start) * 1000
    h, w = frame.shape[:2]

    return {
        "count": len(detections),
        "detections": detections,
        "frame_size": (w, h),
        "processing_time_ms": round(processing_time, 1),
    }


def count_people_in_zone(
    frame: np.ndarray,
    zone_polygon: Optional[list] = None,
    model_path: str = "yolov8n.pt",
    confidence: float = 0.5,
) -> dict:
    """
    Count people within a specific zone (polygon) in the frame.
    If no zone is specified, counts all people in the frame.
    """
    result = count_people(frame, model_path, confidence)

    if zone_polygon is None:
        return result

    # Filter detections to only those within the zone polygon
    from shapely.geometry import Point, Polygon

    poly = Polygon(zone_polygon)
    zone_detections = []

    for det in result["detections"]:
        # Use center-bottom of bounding box as the person's position
        cx = (det["x1"] + det["x2"]) / 2
        cy = det["y2"]  # Bottom of box = feet position
        if poly.contains(Point(cx, cy)):
            zone_detections.append(det)

    result["count"] = len(zone_detections)
    result["detections"] = zone_detections
    result["zone_filtered"] = True

    return result


def estimate_demographics(frame: np.ndarray, detections: list) -> list:
    """
    Estimate basic demographics (group size) from detections.
    Full demographics (age/gender) would require a separate model.
    """
    # Simple group detection: people within 100px of each other are a group
    groups = []
    assigned = set()

    for i, det_a in enumerate(detections):
        if i in assigned:
            continue

        group = [i]
        assigned.add(i)
        cx_a = (det_a["x1"] + det_a["x2"]) / 2

        for j, det_b in enumerate(detections):
            if j in assigned:
                continue
            cx_b = (det_b["x1"] + det_b["x2"]) / 2
            if abs(cx_a - cx_b) < 100:
                group.append(j)
                assigned.add(j)

        size = len(group)
        group_type = (
            "solo" if size == 1
            else "couple" if size == 2
            else "family" if size <= 4
            else "group"
        )
        groups.append({"size": size, "type": group_type})

    return groups
