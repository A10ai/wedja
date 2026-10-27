# Wedja CV Service — People Counting for Senzo Mall

Edge scripts that read the mall's Hikvision cameras and write **numbers only**
(never images) to Supabase.

| Script | Measures | Writes to |
|---|---|---|
| `main.py` | People **visible** in a snapshot of each mapped camera (YOLO) | `occupancy_readings.current_count` (one row per zone per cycle) |
| `live_count.py` | Same, for one camera reached via ffmpeg | `occupancy_readings.current_count` |
| `gate_counter.py` | Gate line-crossing counters (Enter/Leave OSD, OCR) | `footfall_readings` (entries/exits **per interval**) + `footfall_daily` (running daily total, Africa/Cairo date) |
| `import_jde.py` | JDE revenue workbook (secondary importer — the web import at `/dashboard/import` is primary) | `rent_transactions` (`source='jde_import'`), idempotent |

Rules the code enforces:

- A snapshot count is occupancy, not entries. It is never stored as `footfall_readings.count_in`, and exits are never invented.
- Only database UUIDs are written to `camera_id` / `zone_id` / `unit_id`. Cameras in `config/cameras.py` must be mapped to a `camera_feeds` row (name = camera id such as `N2-D1`, or an explicit `feed_id`), and that row must have a zone. Unmapped cameras are skipped with a warning at startup.
- Write failures are logged at ERROR level and counted; after `MAX_CONSECUTIVE_PUSH_FAILURES` consecutive failures the process exits non-zero.
- No credentials or hosts have defaults. Missing required variables stop the script with a clear message.

## Setup

```bash
cd cv-service
pip install -r requirements.txt      # plus: ffmpeg, tesseract-ocr (gate counter)
cp .env.example .env                 # fill in; never commit .env
```

## Usage

```bash
python main.py --list                # list registered cameras
python main.py --test 192.168.21.11  # test one camera (no database writes)
python main.py                       # continuous snapshot occupancy

python gate_counter.py --test        # read all gate counters (no writes)
python gate_counter.py               # continuous; first cycle only sets baselines

python import_jde.py --file "Revenue Analysis 2025.xlsx" --dry-run
```

## Tests

```bash
pip install pytest python-dotenv openpyxl
python -m pytest tests               # pure logic + fakes; no cameras or network
```

## Files

```
cv-service/
├── main.py                  # snapshot occupancy (YOLO)
├── live_count.py            # single-camera occupancy via ffmpeg
├── gate_counter.py          # gate entries/exits per interval
├── import_jde.py            # offline JDE importer (idempotent)
├── config/cameras.py        # camera registry (ids are NOT database ids)
├── config/camera_mapping.py # registry -> camera_feeds UUID/zone resolution
├── capture/rtsp_reader.py   # RTSP frame capture (OpenCV)
├── detection/people_counter.py  # YOLO person detection
├── detection/gate_delta.py  # cumulative counter -> interval delta logic
├── api/push_results.py      # Supabase REST writes + failure tracking
└── tests/
```
