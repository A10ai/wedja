"""
Senzo Mall Camera Registry
172 Hikvision cameras across 5 network segments
Generated from CCTV questionnaire response
"""

# RTSP URL format for Hikvision cameras
# Main stream: rtsp://user:pass@IP:554/Streaming/Channels/101
# Sub stream:  rtsp://user:pass@IP:554/Streaming/Channels/102 (lower res, less bandwidth)

CAMERAS = [
    # === STANDALONE CEILING-MOUNTED (192.168.16.x) — Gates ===
    {"id": "S1", "ip": "192.168.16.201", "type": "ceiling", "model": "DS-2CD6825G0/C-IVS", "resolution": "4MP", "location": "Gate 1", "zone": "entrance", "counting": True},
    {"id": "S2", "ip": "192.168.16.202", "type": "ceiling", "model": "DS-2CD6825G0/C-IVS", "resolution": "4MP", "location": "Gate 1", "zone": "entrance", "counting": True},
    {"id": "S3", "ip": "192.168.16.203", "type": "ceiling", "model": "DS-2CD6825G0/C-IVS", "resolution": "4MP", "location": "Gate 2", "zone": "entrance", "counting": True},
    {"id": "S4", "ip": "192.168.16.204", "type": "ceiling", "model": "DS-2CD6825G0/C-IVS", "resolution": "4MP", "location": "Gate 2", "zone": "entrance", "counting": True},
    {"id": "S5", "ip": "192.168.16.205", "type": "ceiling", "model": "DS-2CD6825G0/C-IVS", "resolution": "4MP", "location": "Gate 3", "zone": "entrance", "counting": True},
    {"id": "S6", "ip": "192.168.16.206", "type": "ceiling", "model": "DS-2CD6825G0/C-IVS", "resolution": "4MP", "location": "Gate 4", "zone": "entrance", "counting": True},

    # === NVR 1 (192.168.20.x) — Interior stores + back areas ===
    {"id": "N1-D1", "ip": "192.168.20.11", "type": "bullet", "model": "DS-2CD1023G0E-I", "resolution": "4MP", "location": "Management", "zone": "back_office", "counting": False},
    {"id": "N1-D2", "ip": "192.168.20.12", "type": "dome", "model": "SK1314-DSI", "resolution": "4MP", "location": "Cafeteria", "zone": "food_court", "counting": True},
    {"id": "N1-D3", "ip": "192.168.20.13", "type": "bullet", "model": "SK1394-WDI3", "resolution": "4MP", "location": "Stores back", "zone": "back_area", "counting": False},
    {"id": "N1-D4", "ip": "192.168.20.14", "type": "bullet", "model": "SK1395-WDI5", "resolution": "4MP", "location": "Roof 2", "zone": "back_area", "counting": False},
    {"id": "N1-D5", "ip": "192.168.20.15", "type": "bullet", "model": "SK1395-WDI5", "resolution": "4MP", "location": "Cafeteria stairs", "zone": "food_court", "counting": True},
    {"id": "N1-D6", "ip": "192.168.20.16", "type": "bullet", "model": "SK1395-WDI5", "resolution": "4MP", "location": "KFC + Pizza", "zone": "food_court", "counting": True},
    {"id": "N1-D14", "ip": "192.168.20.24", "type": "bullet", "model": "DS-2CD1043G0-I", "resolution": "4MP", "location": "Control door", "zone": "back_area", "counting": False},
    {"id": "N1-D16", "ip": "192.168.20.26", "type": "dome", "model": "DS-2CD2123G0-I", "resolution": "2MP", "location": "Colin's back", "zone": "fashion_core", "counting": True},
    {"id": "N1-D21", "ip": "192.168.20.31", "type": "bullet", "model": "DS-2CD2055FWD-I", "resolution": "5MP", "location": "Front accounts", "zone": "back_area", "counting": False},
    {"id": "N1-D27", "ip": "192.168.20.37", "type": "dome", "model": "SK1412-I", "resolution": "4MP", "location": "Jacobs", "zone": "food_court", "counting": True},
    {"id": "N1-D29", "ip": "192.168.20.39", "type": "bullet", "model": "DS-2CD2T32-I5", "resolution": "4MP", "location": "McDonalds", "zone": "food_court", "counting": True},
    {"id": "N1-D31", "ip": "192.168.20.41", "type": "dome", "model": "DS-2CD1143G0-I", "resolution": "4MP", "location": "Mosque", "zone": "common", "counting": False},

    # === NVR 2 (192.168.21.x) — Store fronts + gates ===
    {"id": "N2-D1", "ip": "192.168.21.11", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Shock", "zone": "fashion_core", "counting": True},
    {"id": "N2-D2", "ip": "192.168.21.12", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Cigar Shop", "zone": "services", "counting": True},
    {"id": "N2-D3", "ip": "192.168.21.13", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Gate 1", "zone": "entrance", "counting": True},
    {"id": "N2-D4", "ip": "192.168.21.14", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Footlose", "zone": "fashion_core", "counting": True},
    {"id": "N2-D5", "ip": "192.168.21.15", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Candy Shop", "zone": "food_court", "counting": True},
    {"id": "N2-D6", "ip": "192.168.21.16", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Mi Retail", "zone": "electronics", "counting": True},
    {"id": "N2-D7", "ip": "192.168.21.17", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Embrator", "zone": "fashion_core", "counting": True},
    {"id": "N2-D8", "ip": "192.168.21.18", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Mango", "zone": "fashion_core", "counting": True},
    {"id": "N2-D9", "ip": "192.168.21.19", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Etisalat", "zone": "electronics", "counting": True},
    {"id": "N2-D10", "ip": "192.168.21.20", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Gate 2", "zone": "entrance", "counting": True},
    {"id": "N2-D11", "ip": "192.168.21.21", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Spinneys", "zone": "anchor", "counting": True},
    {"id": "N2-D12", "ip": "192.168.21.22", "type": "dome", "model": "SK1314-DSI", "resolution": "4MP", "location": "Vodafone", "zone": "electronics", "counting": True},
    {"id": "N2-D13", "ip": "192.168.21.23", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Citizen", "zone": "services", "counting": True},
    {"id": "N2-D14", "ip": "192.168.21.24", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Gate 3", "zone": "entrance", "counting": True},
    {"id": "N2-D15", "ip": "192.168.21.25", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Maa Alzahab", "zone": "services", "counting": True},
    {"id": "N2-D16", "ip": "192.168.21.26", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Venti", "zone": "fashion_core", "counting": True},
    {"id": "N2-D17", "ip": "192.168.21.27", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Pixi", "zone": "fashion_core", "counting": True},
    {"id": "N2-D18", "ip": "192.168.21.28", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Kams", "zone": "fashion_core", "counting": True},
    {"id": "N2-D19", "ip": "192.168.21.29", "type": "dome", "model": "SK1314-DSI", "resolution": "4MP", "location": "Gate 4", "zone": "entrance", "counting": True},
    {"id": "N2-D21", "ip": "192.168.21.31", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "LC Waikiki", "zone": "fashion_core", "counting": True},
    {"id": "N2-D22", "ip": "192.168.21.32", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Premoda", "zone": "fashion_core", "counting": True},
    {"id": "N2-D23", "ip": "192.168.21.33", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Mitara", "zone": "fashion_core", "counting": True},
    {"id": "N2-D24", "ip": "192.168.21.34", "type": "dome", "model": "DS-2CD2742FWD-I", "resolution": "4MP", "location": "Fourteen", "zone": "fashion_core", "counting": True},

    # === NVR 3 (192.168.22.x) — Outdoor, parking, more stores ===
    {"id": "N3-D1", "ip": "192.168.22.11", "type": "bullet", "model": "SK1395-WDI5", "resolution": "4MP", "location": "Gate 1 outdoor", "zone": "entrance", "counting": True},
    {"id": "N3-D2", "ip": "192.168.22.12", "type": "bullet", "model": "DS-2CD1043G0E-I", "resolution": "4MP", "location": "Park 3", "zone": "parking", "counting": False},
    {"id": "N3-D12", "ip": "192.168.22.22", "type": "dome", "model": "DS-2CD2T22WD-I5", "resolution": "4MP", "location": "Orange back", "zone": "back_area", "counting": False},
    {"id": "N3-D38", "ip": "192.168.22.48", "type": "bullet", "model": "DS-2CD1043G0-I", "resolution": "4MP", "location": "Orange", "zone": "electronics", "counting": True},
    {"id": "N3-D39", "ip": "192.168.22.49", "type": "bullet", "model": "DS-2CD1043G0-I", "resolution": "4MP", "location": "Defacto out", "zone": "fashion_core", "counting": True},
    {"id": "N3-D40", "ip": "192.168.22.50", "type": "bullet", "model": "DS-2CD1043G0-I", "resolution": "4MP", "location": "Defacto", "zone": "fashion_core", "counting": True},
    {"id": "N3-D41", "ip": "192.168.22.51", "type": "bullet", "model": "DS-2CD1043G0-I", "resolution": "4MP", "location": "Bianco back", "zone": "food_court", "counting": False},

    # === NVR 4 (192.168.23.x) — Spinneys area + services ===
    {"id": "N4-D8", "ip": "192.168.23.18", "type": "bullet", "model": "DS-2CD2120F-I", "resolution": "2MP", "location": "Spinneys receive", "zone": "anchor", "counting": False},
    {"id": "N4-D14", "ip": "192.168.23.24", "type": "dome", "model": "SK1394-WDI3", "resolution": "4MP", "location": "Solar tank", "zone": "back_area", "counting": False},
    {"id": "N4-D15", "ip": "192.168.23.25", "type": "bullet", "model": "DS-2CD2120F-I", "resolution": "2MP", "location": "Duty Free", "zone": "services", "counting": True},
    {"id": "N4-D16", "ip": "192.168.23.26", "type": "dome", "model": "DS-2CD1123G0E-I", "resolution": "2MP", "location": "Cigar Shop entrance", "zone": "services", "counting": True},

    # === NVR 5 (192.168.24.x) — Kidzo + A-series shops ===
    {"id": "N5-D4", "ip": "192.168.24.14", "type": "dome", "model": "DS-2CD2120F-I", "resolution": "2MP", "location": "Entrance A-shops", "zone": "kiosk_area", "counting": True},
    {"id": "N5-D5", "ip": "192.168.24.15", "type": "dome", "model": "DS-2CD2120F-I", "resolution": "2MP", "location": "A29 Shop", "zone": "kiosk_area", "counting": True},
    {"id": "N5-D6", "ip": "192.168.24.16", "type": "dome", "model": "DS-2CD2120F-I", "resolution": "2MP", "location": "A28 Shop", "zone": "kiosk_area", "counting": True},
    {"id": "N5-D7", "ip": "192.168.24.17", "type": "dome", "model": "DS-2CD2120F-I", "resolution": "2MP", "location": "A27 Shop", "zone": "kiosk_area", "counting": True},
    {"id": "N5-D8", "ip": "192.168.24.18", "type": "dome", "model": "DS-2CD2120F-I", "resolution": "2MP", "location": "A25 Shop", "zone": "kiosk_area", "counting": True},
    {"id": "N5-D9", "ip": "192.168.24.19", "type": "dome", "model": "DS-2CD2120F-I", "resolution": "2MP", "location": "Marina Shop", "zone": "kiosk_area", "counting": True},
    {"id": "N5-D10", "ip": "192.168.24.20", "type": "dome", "model": "DS-2CD2120F-I", "resolution": "2MP", "location": "A22 Shop", "zone": "kiosk_area", "counting": True},
    {"id": "N5-D11", "ip": "192.168.24.21", "type": "dome", "model": "DS-2CD2120F-I", "resolution": "2MP", "location": "A18 Shop", "zone": "kiosk_area", "counting": True},
    {"id": "N5-D22", "ip": "192.168.24.32", "type": "dome", "model": "DS-2CD2120F-I", "resolution": "2MP", "location": "Kidzo", "zone": "entertainment", "counting": True},
    {"id": "N5-D23", "ip": "192.168.24.33", "type": "dome", "model": "DS-2CD2120F-I", "resolution": "2MP", "location": "Kidzo train", "zone": "entertainment", "counting": True},
    {"id": "N5-D24", "ip": "192.168.24.34", "type": "dome", "model": "DS-2CD2120F-I", "resolution": "2MP", "location": "Kidzo cashier", "zone": "entertainment", "counting": True},
    {"id": "N5-D26", "ip": "192.168.24.36", "type": "dome", "model": "DS-2CD2120F-I", "resolution": "2MP", "location": "Cinema 5D", "zone": "entertainment", "counting": True},
]

# Cameras flagged for people counting (store entrances + gates)
COUNTING_CAMERAS = [c for c in CAMERAS if c.get("counting", False)]

# Gate cameras for total mall footfall
GATE_CAMERAS = [c for c in CAMERAS if c["zone"] == "entrance"]

# Store-facing cameras for per-tenant counting
STORE_CAMERAS = [c for c in CAMERAS if c["zone"] not in ("entrance", "parking", "back_area", "back_office", "common")]

def get_rtsp_url(camera: dict, username: str, password: str, sub_stream: bool = True) -> str:
    """Generate RTSP URL for a Hikvision camera."""
    channel = "102" if sub_stream else "101"  # 102 = sub stream (lower bandwidth)
    return f"rtsp://{username}:{password}@{camera['ip']}:554/Streaming/Channels/{channel}"

def get_camera_by_location(location: str) -> dict | None:
    """Find camera by location name (case-insensitive partial match)."""
    location_lower = location.lower()
    for cam in CAMERAS:
        if location_lower in cam["location"].lower():
            return cam
    return None

print(f"Total cameras registered: {len(CAMERAS)}")
print(f"Counting cameras: {len(COUNTING_CAMERAS)}")
print(f"Gate cameras: {len(GATE_CAMERAS)}")
print(f"Store cameras: {len(STORE_CAMERAS)}")
