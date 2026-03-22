"""
RTSP Stream Reader for Hikvision cameras.
Captures frames from camera streams for AI processing.
"""

import cv2
import time
import logging
from typing import Optional
import numpy as np

logger = logging.getLogger(__name__)


class RTSPReader:
    """Reads frames from a Hikvision RTSP stream."""

    def __init__(self, rtsp_url: str, camera_id: str, reconnect_delay: int = 5):
        self.rtsp_url = rtsp_url
        self.camera_id = camera_id
        self.reconnect_delay = reconnect_delay
        self.cap: Optional[cv2.VideoCapture] = None
        self.connected = False
        self.last_frame_time = 0
        self.frame_count = 0
        self.error_count = 0

    def connect(self) -> bool:
        """Connect to the RTSP stream."""
        try:
            self.cap = cv2.VideoCapture(self.rtsp_url)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize buffer for real-time

            if self.cap.isOpened():
                self.connected = True
                self.error_count = 0
                logger.info(f"[{self.camera_id}] Connected to {self.rtsp_url.split('@')[1]}")
                return True
            else:
                self.connected = False
                logger.warning(f"[{self.camera_id}] Failed to connect")
                return False
        except Exception as e:
            self.connected = False
            logger.error(f"[{self.camera_id}] Connection error: {e}")
            return False

    def get_frame(self) -> Optional[np.ndarray]:
        """Capture a single frame from the stream."""
        if not self.connected or self.cap is None:
            if not self.connect():
                return None

        try:
            ret, frame = self.cap.read()
            if ret and frame is not None:
                self.last_frame_time = time.time()
                self.frame_count += 1
                return frame
            else:
                self.error_count += 1
                if self.error_count > 5:
                    logger.warning(f"[{self.camera_id}] Too many errors, reconnecting...")
                    self.disconnect()
                    time.sleep(self.reconnect_delay)
                    self.connect()
                return None
        except Exception as e:
            logger.error(f"[{self.camera_id}] Frame capture error: {e}")
            self.error_count += 1
            return None

    def get_snapshot(self) -> Optional[np.ndarray]:
        """Get a single snapshot (connect, grab one frame, disconnect)."""
        if self.connect():
            # Read a few frames to get a fresh one (skip buffered frames)
            for _ in range(3):
                self.cap.read()
            ret, frame = self.cap.read()
            self.disconnect()
            if ret and frame is not None:
                return frame
        return None

    def disconnect(self):
        """Disconnect from the stream."""
        if self.cap is not None:
            self.cap.release()
            self.cap = None
        self.connected = False

    def is_alive(self) -> bool:
        """Check if connection is still alive."""
        if not self.connected or self.cap is None:
            return False
        return self.cap.isOpened()

    def get_status(self) -> dict:
        """Get reader status."""
        return {
            "camera_id": self.camera_id,
            "connected": self.connected,
            "frame_count": self.frame_count,
            "error_count": self.error_count,
            "last_frame_age": time.time() - self.last_frame_time if self.last_frame_time else None,
        }
