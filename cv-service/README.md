# Wedja CV Service — People Counting for Senzo Mall

Connects to 172 Hikvision cameras, counts people using YOLO, pushes results to Supabase.

## Setup

```bash
cd cv-service
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your camera password and Supabase keys
```

## Usage

```bash
# List all registered cameras
python main.py --list

# Test one camera (replace with actual IP)
python main.py --test 192.168.21.11

# Run continuous counting (every 10 seconds)
python main.py
```

## Architecture

```
Camera RTSP → Frame Capture → YOLO Detection → Count → Push to Supabase
```

- Frames are captured as snapshots (not continuous video)
- Only numbers are sent to the cloud — never images
- YOLO v8 nano model (~6MB) runs locally on the edge box
- Sub-streams used (640x480) to minimize bandwidth

## Hardware

- NVIDIA Jetson Orin NX 16GB or Mini PC with GPU
- Connected to camera network (192.168.x.x)
- Internet connection for Supabase push

## Files

```
cv-service/
├── main.py              # Entry point
├── config/
│   └── cameras.py       # 172 cameras registered with IPs and locations
├── capture/
│   └── rtsp_reader.py   # RTSP stream reader
├── detection/
│   └── people_counter.py # YOLO people counting
├── api/
│   └── push_results.py  # Push results to Supabase
├── requirements.txt
├── .env.example
└── README.md
```
