-- ============================================================
-- Custis Energy Module — Seed hourly energy readings
-- 30 days x 24 hours x 8 zones = ~5,760 readings
-- ============================================================

DO $$
DECLARE
  v_zone RECORD;
  v_day INT;
  v_hour INT;
  v_date DATE;
  v_timestamp TIMESTAMPTZ;
  v_kwh NUMERIC;
  v_cost_per_kwh NUMERIC := 2.5;
  v_base_kwh NUMERIC;
  v_off_hours_kwh NUMERIC;
  v_is_operating BOOLEAN;
BEGIN

  -- Loop through each zone
  FOR v_zone IN
    SELECT id, type, name FROM zones
    WHERE property_id = 'a0000000-0000-0000-0000-000000000001'
  LOOP

    -- Set base consumption by zone type
    CASE v_zone.type
      WHEN 'retail' THEN
        v_base_kwh := 200 + random() * 200;      -- 200-400 kWh operating
        v_off_hours_kwh := 50 + random() * 30;    -- 50-80 kWh off-hours
      WHEN 'food' THEN
        v_base_kwh := 300 + random() * 200;       -- 300-500 kWh (cooking)
        v_off_hours_kwh := 80 + random() * 40;    -- 80-120 kWh (refrigeration)
      WHEN 'entertainment' THEN
        v_base_kwh := 150 + random() * 150;       -- 150-300 kWh
        v_off_hours_kwh := 40 + random() * 30;    -- 40-70 kWh
      WHEN 'parking' THEN
        v_base_kwh := 50 + random() * 50;         -- 50-100 kWh (lighting)
        v_off_hours_kwh := 20 + random() * 20;    -- 20-40 kWh
      WHEN 'common' THEN
        v_base_kwh := 100 + random() * 100;       -- 100-200 kWh
        v_off_hours_kwh := 30 + random() * 30;    -- 30-60 kWh
      WHEN 'service' THEN
        v_base_kwh := 120 + random() * 100;       -- 120-220 kWh
        v_off_hours_kwh := 35 + random() * 25;    -- 35-60 kWh
      ELSE
        v_base_kwh := 100;
        v_off_hours_kwh := 30;
    END CASE;

    -- Loop 30 days
    FOR v_day IN 0..29 LOOP
      v_date := (CURRENT_DATE - v_day)::DATE;

      -- Loop 24 hours
      FOR v_hour IN 0..23 LOOP
        v_timestamp := v_date + (v_hour || ' hours')::INTERVAL;

        -- Operating hours: 10AM-11PM (10-23)
        v_is_operating := v_hour >= 10 AND v_hour <= 23;

        IF v_is_operating THEN
          -- Peak hours: 12-14 (lunch) and 18-21 (evening) get 20% more
          IF v_hour BETWEEN 12 AND 14 OR v_hour BETWEEN 18 AND 21 THEN
            v_kwh := v_base_kwh * (1.1 + random() * 0.2);
          ELSE
            v_kwh := v_base_kwh * (0.85 + random() * 0.3);
          END IF;
        ELSE
          v_kwh := v_off_hours_kwh * (0.8 + random() * 0.4);
        END IF;

        -- Weekend bump (Fri-Sat in Egypt)
        IF EXTRACT(DOW FROM v_date) IN (5, 6) AND v_is_operating THEN
          v_kwh := v_kwh * (1.1 + random() * 0.1);
        END IF;

        -- Add some daily variance (weather/seasonal)
        v_kwh := v_kwh * (0.92 + random() * 0.16);

        -- Round to 1 decimal
        v_kwh := round(v_kwh::NUMERIC, 1);

        INSERT INTO energy_readings (zone_id, timestamp, consumption_kwh, cost_egp, source)
        VALUES (
          v_zone.id,
          v_timestamp,
          v_kwh,
          round(v_kwh * v_cost_per_kwh, 2),
          'smart_meter'
        );

      END LOOP; -- hours
    END LOOP; -- days
  END LOOP; -- zones

END $$;
