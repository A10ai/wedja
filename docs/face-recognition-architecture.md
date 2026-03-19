# Wedja — Face Recognition Architecture
## Anonymous Visitor Intelligence for Senzo Mall

---

## Principle: Embeddings, Not Photos

We NEVER store photos of faces. We store **embeddings** — a 512-dimensional mathematical vector that represents facial features as numbers. An embedding cannot be reverse-engineered back into a photo. It can only be compared against other embeddings to answer: "Is this the same person?"

```
Camera captures frame
    ↓
Face detected (MTCNN/RetinaFace)
    ↓
Face aligned and normalized
    ↓
Embedding generated (ArcFace → 512 numbers)
    ↓
Frame DISCARDED — only embedding kept
    ↓
Embedding compared against database
    ↓
Match found → update existing visitor profile
No match → create new anonymous visitor
```

No names. No photos. No identity. Just: Visitor #4521 has been here 7 times this month.

---

## System Architecture

```
┌──────────────────────────────────────────────────────┐
│                    MALL ENTRANCES                      │
│    Gate 1        Gate 2        Gate 3        Gate 4    │
│   [Camera]      [Camera]      [Camera]      [Camera]  │
└──────┬─────────────┬─────────────┬─────────────┬──────┘
       │             │             │             │
       └─────────────┴──────┬──────┴─────────────┘
                            │
                     RTSP Streams
                            │
                            ▼
              ┌──────────────────────────┐
              │    EDGE BOX (Mall)        │
              │                          │
              │  1. Frame Capture         │
              │     (1 frame/second)      │
              │                          │
              │  2. Face Detection        │
              │     (MTCNN/RetinaFace)    │
              │     - Locate faces        │
              │     - Filter quality      │
              │     - Min size 80x80px    │
              │                          │
              │  3. Face Alignment        │
              │     (5-point landmark)    │
              │     - Normalize pose      │
              │     - Crop 112x112        │
              │                          │
              │  4. Embedding Generation  │
              │     (ArcFace model)       │
              │     - 512-dim vector      │
              │     - L2 normalized       │
              │                          │
              │  5. Frame DELETED         │
              │     (never leaves box)    │
              │                          │
              │  6. Local Matching        │
              │     (today's visitors)    │
              │     - Cosine similarity   │
              │     - Threshold: 0.6      │
              │                          │
              │  7. Push Results          │
              │     (only numbers/IDs)    │
              └──────────┬───────────────┘
                         │
                    API calls (JSON only)
                    No images transmitted
                         │
                         ▼
              ┌──────────────────────────┐
              │   SUPABASE CLOUD DB       │
              │                          │
              │  visitor_embeddings       │
              │  visitor_profiles         │
              │  visitor_sessions         │
              │  visitor_zone_tracking    │
              └──────────┬───────────────┘
                         │
                         ▼
              ┌──────────────────────────┐
              │   WEDJA DASHBOARD         │
              │                          │
              │  Unique visitor counts    │
              │  Return visitor rates     │
              │  Journey mapping          │
              │  Frequency analysis       │
              │  Demographic breakdown    │
              │  VIP/blacklist alerts     │
              └──────────────────────────┘
```

---

## Database Schema

```sql
-- Stores face embeddings (the 512-number vectors)
-- NO photos, NO names, NO personal data
visitor_embeddings:
  id UUID PRIMARY KEY
  property_id UUID
  embedding VECTOR(512)          -- pgvector extension for similarity search
  quality_score NUMERIC          -- face image quality (blur, angle, lighting)
  first_seen TIMESTAMPTZ
  last_seen TIMESTAMPTZ
  total_visits INT DEFAULT 1
  status TEXT (active/merged/deleted)
  created_at TIMESTAMPTZ

-- Anonymous visitor profiles built over time
visitor_profiles:
  id UUID PRIMARY KEY
  property_id UUID
  embedding_id UUID → visitor_embeddings
  visitor_code TEXT              -- "V-00001" anonymous ID
  estimated_age_range TEXT       -- child/teen/young_adult/adult/senior
  estimated_gender TEXT          -- male/female/unknown
  first_visit DATE
  last_visit DATE
  total_visits INT
  avg_visit_duration_minutes INT
  preferred_entrance TEXT        -- Gate 1/2/3/4
  preferred_zones TEXT[]         -- zones they visit most
  visit_frequency TEXT           -- daily/weekly/monthly/occasional
  visitor_segment TEXT           -- regular/tourist/occasional/new
  is_vip BOOLEAN DEFAULT false   -- flagged by staff
  is_blacklisted BOOLEAN DEFAULT false
  blacklist_reason TEXT
  created_at TIMESTAMPTZ

-- Each time a visitor enters the mall
visitor_sessions:
  id UUID PRIMARY KEY
  property_id UUID
  visitor_id UUID → visitor_profiles
  entrance_gate TEXT
  entry_time TIMESTAMPTZ
  exit_time TIMESTAMPTZ
  duration_minutes INT
  zones_visited TEXT[]
  stores_entered TEXT[]          -- from store-level cameras
  date DATE
  day_of_week INT
  is_return_visit BOOLEAN

-- Track visitor movement between zones (from corridor cameras)
visitor_zone_tracking:
  id UUID PRIMARY KEY
  session_id UUID → visitor_sessions
  zone_id UUID → zones
  entered_at TIMESTAMPTZ
  exited_at TIMESTAMPTZ
  dwell_seconds INT
  came_from_zone UUID            -- previous zone
  went_to_zone UUID              -- next zone
```

---

## Edge Box Processing Pipeline

### Hardware Requirements
- NVIDIA Jetson Orin NX 16GB (or equivalent GPU)
- Handles 4 entrance cameras at 1 FPS each
- ArcFace model: ~50ms per face on Jetson
- Total: 4 cameras × 1 FPS × 3 avg faces = 12 faces/sec × 50ms = 600ms (well within capacity)

### Python Service Structure
```
wedja-edge/
├── main.py                 # Service entry point
├── config.yaml             # Camera URLs, thresholds, API endpoints
├── capture/
│   ├── rtsp_reader.py      # RTSP stream frame capture
│   └── frame_queue.py      # Thread-safe frame buffer
├── detection/
│   ├── face_detector.py    # MTCNN or RetinaFace
│   └── face_aligner.py     # 5-point landmark alignment
├── recognition/
│   ├── embedder.py         # ArcFace embedding generation
│   ├── matcher.py          # Cosine similarity matching
│   └── embedding_db.py     # Local SQLite cache for today's embeddings
├── tracking/
│   ├── visitor_tracker.py  # Session management (entry/exit pairing)
│   └── zone_tracker.py     # Cross-camera zone tracking
├── demographics/
│   └── age_gender.py       # Age/gender estimation from face
├── alerts/
│   ├── vip_detector.py     # Match against VIP embeddings
│   └── blacklist.py        # Match against blacklist
├── api/
│   └── push_results.py     # Push data to Supabase cloud
├── privacy/
│   ├── frame_deleter.py    # Ensures frames are never persisted
│   └── embedding_anonymizer.py
└── models/
    ├── arcface_r100.onnx   # Face embedding model
    ├── retinaface.onnx     # Face detection model
    └── age_gender.onnx     # Demographics model
```

### Processing Flow (per frame)
```python
# 1. Capture frame (1 per second per camera)
frame = rtsp_reader.get_frame(camera_id)

# 2. Detect faces
faces = face_detector.detect(frame)  # Returns bounding boxes + landmarks

# 3. For each face
for face in faces:
    # Quality check (skip blurry, too small, extreme angle)
    if face.quality < 0.5 or face.size < 80:
        continue

    # 4. Align face
    aligned = face_aligner.align(frame, face.landmarks)

    # 5. Generate embedding
    embedding = embedder.encode(aligned)  # 512-dim vector

    # 6. DELETE the frame crop immediately
    del aligned

    # 7. Match against today's visitors
    match = matcher.find_match(embedding, threshold=0.6)

    if match:
        # Return visitor — update session
        visitor_tracker.update_session(match.visitor_id, camera_id)
    else:
        # New visitor — check against historical embeddings
        historical = api.search_embedding(embedding)
        if historical:
            # Known returning visitor
            visitor_tracker.start_session(historical.visitor_id, camera_id)
        else:
            # First-time visitor
            new_id = api.create_visitor(embedding, demographics)
            visitor_tracker.start_session(new_id, camera_id)

    # 8. Check VIP/blacklist
    if vip_detector.check(embedding):
        api.send_alert("VIP entered via " + camera_id)
    if blacklist.check(embedding):
        api.send_alert("BLACKLISTED individual at " + camera_id, severity="critical")

# 9. Frame is discarded — never saved
del frame
```

---

## Matching Algorithm

**Cosine Similarity** between two 512-dim embeddings:

```
similarity = dot(embedding_a, embedding_b) / (norm(a) * norm(b))

if similarity > 0.6 → same person (high confidence)
if similarity 0.5-0.6 → possible match (verify with next sighting)
if similarity < 0.5 → different person
```

**Speed:** With pgvector extension in Supabase, searching 100,000 embeddings takes <50ms.

**Accuracy:** ArcFace achieves 99.8% on standard benchmarks. In real-world mall conditions (varying lighting, angles, partial occlusion): expect 92-96%.

---

## Analytics Powered by Face Recognition

### 1. True Unique Visitor Count
- Current: footfall counters count entries (same person counted multiple times)
- With face recognition: "Today: 8,500 entries, 6,200 unique visitors"
- Huge difference for understanding real reach

### 2. Return Visitor Rate
- "62% of this week's visitors have been here before"
- "38% are first-time visitors"
- Track: is the mall attracting new visitors or relying on regulars?

### 3. Visit Frequency Distribution
- Daily regulars: 5% (staff from nearby offices, daily grocery shoppers)
- Weekly: 25% (weekend shoppers)
- Monthly: 40% (regular customers)
- Occasional: 20% (tourists, infrequent)
- First-time: 10%

### 4. Journey Mapping
- "70% of visitors from Gate 1 go to Spinneys first"
- "40% of fashion shoppers also visit the food court"
- "Average journey: 3.2 zones visited, 47 minutes in mall"
- Optimize tenant placement based on actual flow

### 5. Demographic Breakdown (per zone, per hour)
- "Food Court 12-2PM: 60% families, 25% young adults, 15% solo"
- "Fashion Wing 6-9PM: 45% young adults, 30% couples, 25% families"
- Feed into marketing: target content by actual demographics

### 6. VIP Recognition
- Staff flags a visitor as VIP in the system
- Next time they enter: "VIP visitor entering Gate 3"
- Enable personalised service without a loyalty card

### 7. Dwell Correlation
- Same person seen at Adidas entrance for 3 minutes but didn't enter → window shopping
- Same person spent 25 minutes in LC Waikiki → high purchase intent
- Connect to actual sales data: long dwell + purchase = conversion confirmed

### 8. Blacklist/Security
- Known shoplifters flagged
- Banned individuals: instant alert to security
- After-hours face detection: who is in the mall when it's closed?

---

## Privacy Framework

### What We Store
- 512-number embedding vector (NOT reversible to a photo)
- Anonymous visitor code (V-00001, not a name)
- Estimated age range and gender (not exact)
- Visit timestamps and zones
- NO photos, NO names, NO personal identification

### What We Never Store
- Original camera frames
- Cropped face images
- Names or personal identifiers
- Any data that can identify a specific individual

### Compliance
- Signage at all entrances: "This property uses anonymised AI analytics for operations and security"
- Data retention: embeddings older than 12 months auto-deleted
- Right to deletion: if someone requests, their embedding is removed
- No data shared with third parties
- Audit log of all embedding access

### Technical Safeguards
- Frames deleted within 1 second of processing
- Embeddings encrypted at rest
- API between edge box and cloud uses TLS
- Edge box has no external access except Supabase API
- Staff cannot view or export raw embeddings

---

## Integration with Wedja Modules

```
Face Recognition
    ├──→ Live Heatmap: unique visitor overlay per zone
    ├──→ Footfall: true unique count vs entry count
    ├──→ Revenue Verification: unique visitors × conversion = better estimate
    ├──→ CCTV Analytics: demographics feed into all 10 modules
    ├──→ Tenant Analytics: which tenants attract return visitors?
    ├──→ Marketing: "Tuesday promotion brought 500 NEW visitors (first-timers)"
    ├──→ Social Media: "Campaign X attracted 300 first-time visitors"
    ├──→ Anomaly Detection: unusual face in restricted area
    ├──→ Security: VIP alerts, blacklist matching
    └──→ Learning Engine: visitor patterns train prediction models
```

---

## Implementation Phases

### Phase A (with cameras connected):
- Face detection + counting (unique visitors)
- Basic return visitor tracking
- Demographics estimation

### Phase B (after 1 month of data):
- Journey mapping across zones
- Frequency analysis
- VIP/blacklist system

### Phase C (after 3 months):
- Visitor segment prediction
- Marketing campaign impact on new vs return visitors
- Tenant performance by unique visitor conversion

---

## Hardware Shopping List Update

Add to the edge box:
- **No additional hardware needed** — the Jetson Orin NX handles face recognition alongside people counting
- Just need to download the ONNX models (~100MB total)
- Models: ArcFace (recognition), RetinaFace (detection), Age-Gender (demographics)

---

## Cost: $0/month

All processing happens on the edge box. No cloud GPU needed. No API fees. The only cost is the one-time hardware ($800-1,500) and the models are open-source.
