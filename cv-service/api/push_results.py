"""
Push counting results to Supabase Cloud.
Sends only numbers — never images or video.
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional
from supabase import create_client, Client

logger = logging.getLogger(__name__)

_client: Optional[Client] = None


def get_supabase() -> Client:
    """Get or create Supabase client."""
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        _client = create_client(url, key)
    return _client


def push_footfall_reading(
    zone_id: str,
    unit_id: Optional[str],
    camera_id: str,
    count_in: int,
    count_out: Optional[int] = None,
    confidence: float = 0.85,
    dwell_seconds: Optional[int] = None,
):
    """Push a footfall reading to the cloud database."""
    try:
        supabase = get_supabase()
        supabase.table("footfall_readings").insert({
            "zone_id": zone_id,
            "unit_id": unit_id,
            "camera_id": camera_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "count_in": count_in,
            "count_out": count_out or int(count_in * 0.95),
            "confidence": confidence,
            "dwell_seconds": dwell_seconds,
        }).execute()
        logger.debug(f"Pushed footfall: camera={camera_id}, count={count_in}")
    except Exception as e:
        logger.error(f"Failed to push footfall: {e}")


def push_daily_summary(
    property_id: str,
    zone_id: str,
    unit_id: Optional[str],
    date: str,
    total_in: int,
    total_out: int,
    peak_hour: int,
    peak_count: int,
    avg_dwell: int,
):
    """Push daily footfall summary."""
    try:
        supabase = get_supabase()
        supabase.table("footfall_daily").insert({
            "property_id": property_id,
            "zone_id": zone_id,
            "unit_id": unit_id,
            "date": date,
            "total_in": total_in,
            "total_out": total_out,
            "peak_hour": peak_hour,
            "peak_count": peak_count,
            "avg_dwell_seconds": avg_dwell,
        }).execute()
        logger.info(f"Pushed daily summary: zone={zone_id}, total={total_in}")
    except Exception as e:
        logger.error(f"Failed to push daily summary: {e}")


def push_camera_status(camera_id: str, status: str):
    """Update camera status in the database."""
    try:
        supabase = get_supabase()
        supabase.table("camera_feeds").update({
            "status": status,
        }).eq("id", camera_id).execute()
    except Exception as e:
        logger.error(f"Failed to update camera status: {e}")


def push_anomaly(
    property_id: str,
    anomaly_type: str,
    severity: str,
    title: str,
    description: str,
    zone_id: Optional[str] = None,
    expected: Optional[float] = None,
    actual: Optional[float] = None,
):
    """Push an anomaly detected by the CV service."""
    try:
        supabase = get_supabase()
        supabase.table("anomalies").insert({
            "property_id": property_id,
            "anomaly_type": anomaly_type,
            "severity": severity,
            "zone_id": zone_id,
            "title": title,
            "description": description,
            "expected_value": expected,
            "actual_value": actual,
            "deviation_pct": ((actual - expected) / expected * 100) if expected and actual else None,
            "data_source": "cv_service",
            "status": "active",
            "auto_detected": True,
            "detection_confidence": 0.85,
        }).execute()
        logger.info(f"Pushed anomaly: {title}")
    except Exception as e:
        logger.error(f"Failed to push anomaly: {e}")
