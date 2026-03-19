-- ============================================================
-- CCTV Analytics Tables + 30-Day Seed Data
-- 10 AI modules: People Count, Flow, Dwell, Queues, Occupancy,
-- Dead Zones, Demographics, Parking, Security, Store Conversion
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

CREATE TABLE visitor_flow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  zone_id UUID REFERENCES zones(id),
  from_zone_id UUID REFERENCES zones(id),
  to_zone_id UUID REFERENCES zones(id),
  camera_id UUID REFERENCES camera_feeds(id),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  count INT DEFAULT 0,
  direction TEXT CHECK (direction IN ('north', 'south', 'east', 'west', 'enter', 'exit')),
  confidence NUMERIC(4,2) DEFAULT 0.85
);

CREATE TABLE dwell_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  zone_id UUID REFERENCES zones(id),
  unit_id UUID REFERENCES units(id),
  camera_id UUID REFERENCES camera_feeds(id),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  avg_dwell_seconds INT,
  max_dwell_seconds INT,
  people_stopped INT,
  people_passed INT,
  stop_rate NUMERIC(5,2)
);

CREATE TABLE queue_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  zone_id UUID REFERENCES zones(id),
  unit_id UUID REFERENCES units(id),
  camera_id UUID REFERENCES camera_feeds(id),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  queue_length INT DEFAULT 0,
  estimated_wait_minutes NUMERIC(4,1),
  alert_triggered BOOLEAN DEFAULT false
);

CREATE TABLE occupancy_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  zone_id UUID REFERENCES zones(id),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  current_count INT DEFAULT 0,
  capacity INT DEFAULT 0,
  occupancy_pct NUMERIC(5,2),
  status TEXT CHECK (status IN ('low', 'moderate', 'high', 'near_capacity', 'over_capacity'))
);

CREATE TABLE demographic_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  zone_id UUID REFERENCES zones(id),
  camera_id UUID REFERENCES camera_feeds(id),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  group_type TEXT CHECK (group_type IN ('solo', 'couple', 'family', 'group')),
  estimated_age_range TEXT CHECK (estimated_age_range IN ('child', 'teen', 'young_adult', 'adult', 'senior')),
  count INT DEFAULT 1
);

CREATE TABLE parking_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  total_spaces INT DEFAULT 500,
  occupied_spaces INT DEFAULT 0,
  occupancy_pct NUMERIC(5,2),
  cars_entered_hour INT DEFAULT 0,
  cars_exited_hour INT DEFAULT 0,
  avg_duration_minutes INT
);

CREATE TABLE security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  zone_id UUID REFERENCES zones(id),
  camera_id UUID REFERENCES camera_feeds(id),
  alert_type TEXT CHECK (alert_type IN ('crowd', 'restricted_area', 'after_hours', 'unusual_pattern', 'loitering', 'unattended_item')),
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT,
  snapshot_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'false_alarm')),
  acknowledged_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE store_conversion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  unit_id UUID REFERENCES units(id),
  date DATE NOT NULL,
  passersby INT DEFAULT 0,
  entered INT DEFAULT 0,
  conversion_rate NUMERIC(5,2),
  avg_time_in_store_seconds INT
);

-- ── Indexes ─────────────────────────────────────────────────

CREATE INDEX idx_flow_timestamp ON visitor_flow(property_id, timestamp DESC);
CREATE INDEX idx_dwell_unit ON dwell_readings(unit_id, timestamp DESC);
CREATE INDEX idx_queue_unit ON queue_readings(unit_id, timestamp DESC);
CREATE INDEX idx_occupancy_zone ON occupancy_readings(zone_id, timestamp DESC);
CREATE INDEX idx_demographic_zone ON demographic_readings(zone_id, timestamp DESC);
CREATE INDEX idx_parking_timestamp ON parking_readings(property_id, timestamp DESC);
CREATE INDEX idx_security_status ON security_alerts(property_id, status, created_at DESC);
CREATE INDEX idx_conversion_date ON store_conversion(unit_id, date DESC);

-- ── Seed Data ───────────────────────────────────────────────

DO $$
DECLARE
  v_prop UUID := 'a0000000-0000-0000-0000-000000000001';
  v_day DATE;
  v_hour INT;
  v_ts TIMESTAMPTZ;
  v_zone RECORD;
  v_unit RECORD;
  v_cam RECORD;
  v_is_weekend BOOLEAN;
  v_hour_mult NUMERIC;
  v_weekend_mult NUMERIC;
  v_base INT;
  v_count INT;
  v_from_zone UUID;
  v_to_zone UUID;
  v_occ_pct NUMERIC;
  v_occ_status TEXT;
  v_queue_len INT;
  v_wait NUMERIC;
  v_dwell_avg INT;
  v_dwell_max INT;
  v_stopped INT;
  v_passed INT;
  v_stop_rate NUMERIC;
  v_passersby INT;
  v_entered INT;
  v_conv_rate NUMERIC;
  v_avg_time INT;
  v_park_occ INT;
  v_park_pct NUMERIC;
  v_cars_in INT;
  v_cars_out INT;
  v_group_type TEXT;
  v_age_range TEXT;
  v_directions TEXT[] := ARRAY['north','south','east','west','enter','exit'];
  v_alert_types TEXT[] := ARRAY['crowd','restricted_area','after_hours','unusual_pattern','loitering','unattended_item'];
  v_severities TEXT[] := ARRAY['low','medium','high','critical'];
  v_group_types TEXT[] := ARRAY['solo','couple','family','group'];
  v_age_ranges TEXT[] := ARRAY['child','teen','young_adult','adult','senior'];
  v_zone_ids UUID[];
  v_camera_ids UUID[];
  v_rand NUMERIC;
  v_staff_id UUID := 'f0000000-0000-0000-0000-000000000001';
BEGIN

  -- Collect zone and camera IDs
  SELECT array_agg(id) INTO v_zone_ids FROM zones WHERE property_id = v_prop AND type NOT IN ('parking');
  SELECT array_agg(id) INTO v_camera_ids FROM camera_feeds WHERE property_id = v_prop;

  -- ════════════════════════════════════════════════════════════
  -- LOOP 30 DAYS
  -- ════════════════════════════════════════════════════════════
  FOR v_day IN SELECT generate_series(CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE, '1 day')::DATE
  LOOP
    v_is_weekend := EXTRACT(DOW FROM v_day) IN (5, 6);
    v_weekend_mult := CASE WHEN v_is_weekend THEN 1.35 ELSE 1.0 END;

    -- ── VISITOR FLOW (hourly, between zone pairs) ───────────
    FOR v_hour IN 10..22
    LOOP
      v_ts := v_day + (v_hour || ' hours')::INTERVAL + (floor(random()*30)::INT || ' minutes')::INTERVAL;

      -- Hour multiplier: peak at 13-14 and 19-20
      v_hour_mult := CASE
        WHEN v_hour BETWEEN 13 AND 14 THEN 1.6
        WHEN v_hour BETWEEN 19 AND 20 THEN 1.5
        WHEN v_hour BETWEEN 11 AND 12 THEN 1.2
        WHEN v_hour BETWEEN 17 AND 18 THEN 1.3
        WHEN v_hour = 10 THEN 0.6
        WHEN v_hour >= 21 THEN 0.7
        ELSE 1.0
      END;

      -- Generate 3-5 flow records per hour between random zone pairs
      FOR i IN 1..4
      LOOP
        v_from_zone := v_zone_ids[1 + floor(random() * array_length(v_zone_ids, 1))::INT];
        v_to_zone := v_zone_ids[1 + floor(random() * array_length(v_zone_ids, 1))::INT];

        -- Ensure different zones
        IF v_from_zone = v_to_zone THEN
          v_to_zone := v_zone_ids[1 + ((floor(random() * (array_length(v_zone_ids, 1) - 1))::INT + 1) % array_length(v_zone_ids, 1))];
        END IF;

        v_count := greatest(1, floor(random() * 80 * v_hour_mult * v_weekend_mult + 10)::INT);

        INSERT INTO visitor_flow (property_id, zone_id, from_zone_id, to_zone_id, camera_id, timestamp, count, direction, confidence)
        VALUES (
          v_prop,
          v_from_zone,
          v_from_zone,
          v_to_zone,
          v_camera_ids[1 + floor(random() * array_length(v_camera_ids, 1))::INT],
          v_ts + (i * INTERVAL '5 minutes'),
          v_count,
          v_directions[1 + floor(random() * 6)::INT],
          0.80 + random() * 0.18
        );
      END LOOP;
    END LOOP;

    -- ── OCCUPANCY READINGS (hourly per zone) ────────────────
    FOR v_zone IN SELECT id, type, area_sqm FROM zones WHERE property_id = v_prop AND type NOT IN ('parking')
    LOOP
      FOR v_hour IN 10..22
      LOOP
        v_ts := v_day + (v_hour || ' hours')::INTERVAL;
        v_hour_mult := CASE
          WHEN v_hour BETWEEN 13 AND 14 THEN 1.6
          WHEN v_hour BETWEEN 19 AND 20 THEN 1.5
          WHEN v_hour BETWEEN 11 AND 12 THEN 1.2
          WHEN v_hour BETWEEN 17 AND 18 THEN 1.3
          WHEN v_hour = 10 THEN 0.5
          WHEN v_hour >= 21 THEN 0.6
          ELSE 1.0
        END;

        -- Capacity based on zone area (1 person per 3-5 sqm)
        v_base := greatest(50, floor(COALESCE(v_zone.area_sqm, 1000) / 4)::INT);
        v_count := greatest(5, floor(v_base * (0.3 + random() * 0.5) * v_hour_mult * v_weekend_mult)::INT);
        v_occ_pct := least(110, round((v_count::NUMERIC / v_base) * 100, 1));

        v_occ_status := CASE
          WHEN v_occ_pct < 30 THEN 'low'
          WHEN v_occ_pct < 60 THEN 'moderate'
          WHEN v_occ_pct < 85 THEN 'high'
          WHEN v_occ_pct < 100 THEN 'near_capacity'
          ELSE 'over_capacity'
        END;

        INSERT INTO occupancy_readings (property_id, zone_id, timestamp, current_count, capacity, occupancy_pct, status)
        VALUES (v_prop, v_zone.id, v_ts, v_count, v_base, v_occ_pct, v_occ_status);
      END LOOP;
    END LOOP;

    -- ── DEMOGRAPHIC READINGS (every 2 hours per zone) ───────
    FOR v_zone IN SELECT id FROM zones WHERE property_id = v_prop AND type NOT IN ('parking', 'common')
    LOOP
      FOR v_hour IN 10..22 BY 2
      LOOP
        v_ts := v_day + (v_hour || ' hours')::INTERVAL;

        -- Different demographics by time of day
        FOR j IN 1..4
        LOOP
          -- Families more in afternoon, young adults in evening
          IF v_hour BETWEEN 14 AND 17 THEN
            v_group_type := (ARRAY['family','family','couple','solo','group'])[1 + floor(random()*5)::INT];
            v_age_range := (ARRAY['child','child','adult','adult','teen'])[1 + floor(random()*5)::INT];
          ELSIF v_hour >= 19 THEN
            v_group_type := (ARRAY['couple','couple','group','solo','solo'])[1 + floor(random()*5)::INT];
            v_age_range := (ARRAY['young_adult','young_adult','adult','teen','adult'])[1 + floor(random()*5)::INT];
          ELSE
            v_group_type := (ARRAY['solo','solo','couple','family','group'])[1 + floor(random()*5)::INT];
            v_age_range := (ARRAY['adult','adult','senior','young_adult','adult'])[1 + floor(random()*5)::INT];
          END IF;

          INSERT INTO demographic_readings (property_id, zone_id, camera_id, timestamp, group_type, estimated_age_range, count)
          VALUES (
            v_prop,
            v_zone.id,
            v_camera_ids[1 + floor(random() * array_length(v_camera_ids, 1))::INT],
            v_ts + (j * INTERVAL '10 minutes'),
            v_group_type,
            v_age_range,
            greatest(1, floor(random() * 15 * v_weekend_mult)::INT)
          );
        END LOOP;
      END LOOP;
    END LOOP;

    -- ── PARKING READINGS (hourly) ───────────────────────────
    FOR v_hour IN 0..23
    LOOP
      v_ts := v_day + (v_hour || ' hours')::INTERVAL;

      -- Parking pattern: fills up 10am-2pm, stays high till 6pm, empties
      v_park_occ := CASE
        WHEN v_hour < 8 THEN floor(30 + random() * 40)::INT
        WHEN v_hour BETWEEN 8 AND 9 THEN floor(100 + random() * 80)::INT
        WHEN v_hour BETWEEN 10 AND 11 THEN floor(200 + random() * 100)::INT
        WHEN v_hour BETWEEN 12 AND 14 THEN floor(350 + random() * 100 * v_weekend_mult)::INT
        WHEN v_hour BETWEEN 15 AND 17 THEN floor(300 + random() * 120 * v_weekend_mult)::INT
        WHEN v_hour BETWEEN 18 AND 20 THEN floor(280 + random() * 130 * v_weekend_mult)::INT
        WHEN v_hour BETWEEN 21 AND 22 THEN floor(150 + random() * 100)::INT
        ELSE floor(50 + random() * 50)::INT
      END;
      v_park_occ := least(500, v_park_occ);
      v_park_pct := round((v_park_occ::NUMERIC / 500) * 100, 1);
      v_cars_in := greatest(0, floor(random() * 50 + 10)::INT);
      v_cars_out := greatest(0, floor(random() * 45 + 8)::INT);

      INSERT INTO parking_readings (property_id, timestamp, total_spaces, occupied_spaces, occupancy_pct, cars_entered_hour, cars_exited_hour, avg_duration_minutes)
      VALUES (v_prop, v_ts, 500, v_park_occ, v_park_pct, v_cars_in, v_cars_out, floor(60 + random() * 120)::INT);
    END LOOP;

    -- ── DWELL READINGS (per unit, twice daily) ──────────────
    FOR v_unit IN
      SELECT u.id AS unit_id, u.zone_id, t.category
      FROM units u
      JOIN leases l ON l.unit_id = u.id AND l.status = 'active'
      JOIN tenants t ON t.id = l.tenant_id
      WHERE u.property_id = v_prop AND u.status = 'occupied'
    LOOP
      FOR v_hour IN 12..20 BY 4
      LOOP
        v_ts := v_day + (v_hour || ' hours')::INTERVAL;

        -- Dwell depends on category
        v_dwell_avg := CASE v_unit.category
          WHEN 'food' THEN floor(300 + random() * 600)::INT  -- 5-15 min
          WHEN 'entertainment' THEN floor(900 + random() * 1800)::INT  -- 15-45 min
          WHEN 'grocery' THEN floor(600 + random() * 900)::INT  -- 10-25 min
          WHEN 'fashion' THEN floor(180 + random() * 420)::INT  -- 3-10 min
          WHEN 'electronics' THEN floor(240 + random() * 360)::INT  -- 4-10 min
          WHEN 'services' THEN floor(120 + random() * 300)::INT  -- 2-7 min
          ELSE floor(120 + random() * 300)::INT
        END;
        v_dwell_max := v_dwell_avg + floor(random() * 600)::INT;
        v_passed := floor(80 + random() * 200 * v_weekend_mult)::INT;
        v_stopped := floor(v_passed * (0.15 + random() * 0.45))::INT;
        v_stop_rate := round((v_stopped::NUMERIC / greatest(1, v_stopped + v_passed)) * 100, 1);

        INSERT INTO dwell_readings (property_id, zone_id, unit_id, camera_id, timestamp, avg_dwell_seconds, max_dwell_seconds, people_stopped, people_passed, stop_rate)
        VALUES (
          v_prop,
          v_unit.zone_id,
          v_unit.unit_id,
          v_camera_ids[1 + floor(random() * array_length(v_camera_ids, 1))::INT],
          v_ts,
          v_dwell_avg,
          v_dwell_max,
          v_stopped,
          v_passed,
          v_stop_rate
        );
      END LOOP;
    END LOOP;

    -- ── QUEUE READINGS (F&B units, every 2 hours during peak) ─
    FOR v_unit IN
      SELECT u.id AS unit_id, u.zone_id, t.brand_name
      FROM units u
      JOIN leases l ON l.unit_id = u.id AND l.status = 'active'
      JOIN tenants t ON t.id = l.tenant_id
      WHERE u.property_id = v_prop AND t.category = 'food'
    LOOP
      FOR v_hour IN 11..21 BY 2
      LOOP
        v_ts := v_day + (v_hour || ' hours')::INTERVAL;
        v_hour_mult := CASE
          WHEN v_hour BETWEEN 12 AND 14 THEN 1.8  -- lunch rush
          WHEN v_hour BETWEEN 19 AND 21 THEN 1.5  -- dinner rush
          ELSE 0.8
        END;

        v_queue_len := greatest(0, floor(random() * 12 * v_hour_mult * v_weekend_mult)::INT);
        v_wait := round((v_queue_len * (1.5 + random()))::NUMERIC, 1);

        INSERT INTO queue_readings (property_id, zone_id, unit_id, camera_id, timestamp, queue_length, estimated_wait_minutes, alert_triggered)
        VALUES (
          v_prop,
          v_unit.zone_id,
          v_unit.unit_id,
          v_camera_ids[1 + floor(random() * array_length(v_camera_ids, 1))::INT],
          v_ts,
          v_queue_len,
          v_wait,
          v_wait > 5.0
        );
      END LOOP;
    END LOOP;

    -- ── STORE CONVERSION (daily per occupied unit) ──────────
    FOR v_unit IN
      SELECT u.id AS unit_id, t.category
      FROM units u
      JOIN leases l ON l.unit_id = u.id AND l.status = 'active'
      JOIN tenants t ON t.id = l.tenant_id
      WHERE u.property_id = v_prop AND u.status = 'occupied'
    LOOP
      v_passersby := floor(300 + random() * 500 * v_weekend_mult)::INT;
      -- Conversion depends on category
      v_conv_rate := CASE v_unit.category
        WHEN 'food' THEN 35 + random() * 25
        WHEN 'grocery' THEN 50 + random() * 30
        WHEN 'entertainment' THEN 25 + random() * 20
        WHEN 'fashion' THEN 10 + random() * 20
        WHEN 'electronics' THEN 8 + random() * 15
        WHEN 'services' THEN 15 + random() * 20
        ELSE 10 + random() * 20
      END;
      v_entered := greatest(1, floor(v_passersby * v_conv_rate / 100)::INT);
      v_conv_rate := round((v_entered::NUMERIC / v_passersby) * 100, 1);
      v_avg_time := CASE v_unit.category
        WHEN 'food' THEN floor(300 + random() * 600)::INT
        WHEN 'entertainment' THEN floor(900 + random() * 1800)::INT
        WHEN 'grocery' THEN floor(600 + random() * 900)::INT
        WHEN 'fashion' THEN floor(180 + random() * 420)::INT
        WHEN 'electronics' THEN floor(240 + random() * 360)::INT
        ELSE floor(120 + random() * 300)::INT
      END;

      INSERT INTO store_conversion (property_id, unit_id, date, passersby, entered, conversion_rate, avg_time_in_store_seconds)
      VALUES (v_prop, v_unit.unit_id, v_day, v_passersby, v_entered, v_conv_rate, v_avg_time);
    END LOOP;

  END LOOP; -- end day loop

  -- ── SECURITY ALERTS (scattered over 30 days) ─────────────
  -- Generate ~40 alerts across 30 days
  FOR i IN 1..40
  LOOP
    v_day := CURRENT_DATE - (floor(random() * 30)::INT || ' days')::INTERVAL;
    v_hour := 8 + floor(random() * 16)::INT;
    v_ts := v_day + (v_hour || ' hours')::INTERVAL + (floor(random() * 59)::INT || ' minutes')::INTERVAL;

    v_rand := random();

    INSERT INTO security_alerts (
      property_id, zone_id, camera_id, alert_type, severity, description, snapshot_url, status, acknowledged_by, created_at, resolved_at
    )
    VALUES (
      v_prop,
      v_zone_ids[1 + floor(random() * array_length(v_zone_ids, 1))::INT],
      v_camera_ids[1 + floor(random() * array_length(v_camera_ids, 1))::INT],
      v_alert_types[1 + floor(random() * 6)::INT],
      CASE
        WHEN v_rand < 0.4 THEN 'low'
        WHEN v_rand < 0.7 THEN 'medium'
        WHEN v_rand < 0.9 THEN 'high'
        ELSE 'critical'
      END,
      CASE (1 + floor(random() * 6)::INT)
        WHEN 1 THEN 'Crowd density exceeding threshold near food court'
        WHEN 2 THEN 'Person detected in restricted maintenance area'
        WHEN 3 THEN 'Movement detected after closing hours in retail wing'
        WHEN 4 THEN 'Unusual loitering pattern detected near exit'
        WHEN 5 THEN 'Unattended bag detected near seating area'
        WHEN 6 THEN 'Unusual crowd formation detected'
        ELSE 'Abnormal movement pattern detected in corridor'
      END,
      NULL,
      CASE
        WHEN v_day < CURRENT_DATE - INTERVAL '7 days' THEN
          (ARRAY['resolved','false_alarm','resolved'])[1 + floor(random()*3)::INT]
        WHEN v_day < CURRENT_DATE - INTERVAL '2 days' THEN
          (ARRAY['resolved','acknowledged','false_alarm'])[1 + floor(random()*3)::INT]
        ELSE
          (ARRAY['active','active','acknowledged'])[1 + floor(random()*3)::INT]
      END,
      CASE WHEN random() > 0.4 THEN v_staff_id ELSE NULL END,
      v_ts,
      CASE
        WHEN v_day < CURRENT_DATE - INTERVAL '2 days' AND random() > 0.3
        THEN v_ts + (floor(5 + random() * 120)::INT || ' minutes')::INTERVAL
        ELSE NULL
      END
    );
  END LOOP;

END $$;
