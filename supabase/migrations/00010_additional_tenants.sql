-- ============================================================
-- Migration 00010: Add ~37 additional tenants from real floor plan
-- + Update zone names to match U-shaped layout
-- ============================================================

-- ── STEP 0: Update zone names to match real floor plan ──────

UPDATE zones SET name = 'Food Court & Left Wing'
  WHERE id = 'b0000000-0000-0000-0000-000000000003';

UPDATE zones SET name = 'Fashion Core'
  WHERE id = 'b0000000-0000-0000-0000-000000000001';

UPDATE zones SET name = 'Right Wing'
  WHERE id = 'b0000000-0000-0000-0000-000000000002';

UPDATE zones SET name = 'Kids Park'
  WHERE id = 'b0000000-0000-0000-0000-000000000004';

UPDATE zones SET name = 'Services & Electronics'
  WHERE id = 'b0000000-0000-0000-0000-000000000006';

UPDATE zones SET name = 'Spinneys Anchor'
  WHERE id = 'b0000000-0000-0000-0000-000000000005';

-- ── STEP 1: Add additional tenants ──────────────────────────

DO $$
DECLARE
  v_prop UUID := 'a0000000-0000-0000-0000-000000000001';

  -- Zone IDs
  z_fashion_core UUID := 'b0000000-0000-0000-0000-000000000001'; -- Fashion Core (was Ground Floor Retail)
  z_right_wing   UUID := 'b0000000-0000-0000-0000-000000000002'; -- Right Wing (was First Floor Retail)
  z_food_left    UUID := 'b0000000-0000-0000-0000-000000000003'; -- Food Court & Left Wing
  z_kids         UUID := 'b0000000-0000-0000-0000-000000000004'; -- Kids Park
  z_anchor       UUID := 'b0000000-0000-0000-0000-000000000005'; -- Spinneys Anchor
  z_services     UUID := 'b0000000-0000-0000-0000-000000000006'; -- Services & Electronics

  -- Temp variables
  v_tenant_id  UUID;
  v_unit_id    UUID;
  v_lease_id   UUID;
  v_month      INT;
  v_year       INT;
  v_min_rent   NUMERIC;
  v_base_rev   NUMERIC;
  v_reported   NUMERIC;
  v_estimated  NUMERIC;
  v_is_underreporter BOOLEAN;
  v_underreport_factor NUMERIC;
  v_start_date DATE;
  v_end_date   DATE;
  v_rec        RECORD;
  v_rent_due   NUMERIC;
  v_paid       NUMERIC;
  v_pay_date   DATE;
  v_pay_status TEXT;
  v_unit_num   INT := 200; -- start numbering above existing
  v_day        INT;
  v_ts         TIMESTAMPTZ;
  v_base_count INT;

  -- 3-4 underreporters among the new tenants
  v_underreporters TEXT[] := ARRAY[
    'MINISO',
    'Movenpick',
    'Dream 2000',
    'Maa Althahab'
  ];

BEGIN

  -- Create temp table for the new tenant data
  CREATE TEMP TABLE _new_tenants (
    idx         SERIAL,
    brand       TEXT,
    area_sqm    NUMERIC,
    rent_sqm    NUMERIC,
    pct_rate    NUMERIC,
    category    TEXT,
    brand_type  TEXT,
    zone_id     UUID
  ) ON COMMIT DROP;

  -- ── Fashion / Clothing ────────────────────────────────────
  INSERT INTO _new_tenants (brand, area_sqm, rent_sqm, pct_rate, category, brand_type, zone_id) VALUES
    ('Hush Puppies',      72,  700,  10.00, 'fashion',  'international', z_fashion_core),
    ('Shilano',           72,  650,  10.00, 'fashion',  'local',         z_fashion_core),
    ('Pashmina Scarves',  40,  900,  10.00, 'fashion',  'local',         z_right_wing),
    ('Desirs',            72,  750,  10.00, 'fashion',  'local',         z_right_wing),
    ('Dare',              96,  800,  10.00, 'fashion',  'local',         z_fashion_core),
    ('Foot Loose',        96,  750,  10.00, 'fashion',  'local',         z_fashion_core),
    ('Carina',            72,  800,  10.00, 'fashion',  'local',         z_right_wing),
    ('Hamasat',           72,  600,  10.00, 'fashion',  'local',         z_right_wing);

  -- ── Food / Cafe ───────────────────────────────────────────
  INSERT INTO _new_tenants (brand, area_sqm, rent_sqm, pct_rate, category, brand_type, zone_id) VALUES
    ('Movenpick',         80, 1200,  15.00, 'food',     'international', z_food_left),
    ('Corn Cube',         25, 1400,  12.00, 'food',     'local',         z_food_left),
    ('Crunchys',          30, 1300,  12.00, 'food',     'local',         z_food_left),
    ('Rayahen Roastery',  60,  900,  12.00, 'food',     'local',         z_food_left),
    ('Candy Shop',        40, 1100,  10.00, 'food',     'local',         z_food_left);

  -- ── Services / Retail ─────────────────────────────────────
  INSERT INTO _new_tenants (brand, area_sqm, rent_sqm, pct_rate, category, brand_type, zone_id) VALUES
    ('MINISO',           200,  600,   8.00, 'services', 'international', z_fashion_core),
    ('Hard Rock Shop',    72,  850,  10.00, 'services', 'international', z_right_wing),
    ('Elbs T-Shirt',      50,  700,  10.00, 'fashion',  'local',         z_fashion_core),
    ('Egypt Post',        60,  400,   0.00, 'services', 'local',         z_services),
    ('Etisalat',          55, 1200,   0.00, 'electronics','international',z_services),
    ('Civil Registry',    80,    0,   0.00, 'services', 'local',         z_services),
    ('Canvas Art Gallery',100,  500, 10.00, 'services', 'local',         z_right_wing),
    ('Cigar Shop',        30, 1500,  10.00, 'services', 'local',         z_services),
    ('GC Stores',         72,  700,  10.00, 'services', 'local',         z_fashion_core),
    ('The Jewelry House', 50, 1800,  12.00, 'services', 'local',         z_services),
    ('Platinum',          40, 2000,  10.00, 'services', 'local',         z_services),
    ('Silver',            40, 1500,  10.00, 'services', 'local',         z_services),
    ('EG Silver',         40, 1600,  10.00, 'services', 'local',         z_services),
    ('Comfort',           72,  600,  10.00, 'fashion',  'local',         z_right_wing),
    ('Dream 2000',       144,  550,  10.00, 'services', 'local',         z_fashion_core),
    ('Nefertari',         50,  900,  10.00, 'services', 'local',         z_services),
    ('Oud Elite',         40, 1200,  10.00, 'services', 'local',         z_services),
    ('Joviality',         72,  700,  10.00, 'fashion',  'local',         z_right_wing),
    ('We Care',           60,  650,  10.00, 'services', 'local',         z_services),
    ('Flor Dor',          40, 1400,  10.00, 'services', 'local',         z_services),
    ('Maa Althahab',      40, 2200,  15.00, 'services', 'local',         z_services),
    ('Nano Park',        150,  400,   8.00, 'entertainment','local',     z_kids),
    ('London Bus',        30,  800,  10.00, 'food',     'local',         z_food_left),
    ('Amany Farouk',      50,  900,  10.00, 'fashion',  'local',         z_right_wing),
    ('Al Jasmine',        50,  800,  10.00, 'services', 'local',         z_services),
    ('Boost Mobile',      30, 1100,  10.00, 'electronics','local',      z_services);

  -- ================================================================
  -- STEP 2: Loop through and create tenants, units, leases, data
  -- ================================================================

  FOR v_rec IN SELECT * FROM _new_tenants ORDER BY idx
  LOOP
    v_unit_num := v_unit_num + 1;

    -- Create tenant
    v_tenant_id := uuid_generate_v4();
    INSERT INTO tenants (id, name, brand_name, category, brand_type, status)
    VALUES (
      v_tenant_id,
      v_rec.brand,
      v_rec.brand,
      v_rec.category,
      v_rec.brand_type,
      'active'
    );

    -- Create unit
    v_unit_id := uuid_generate_v4();
    INSERT INTO units (id, zone_id, property_id, name, unit_number, floor, area_sqm, status, frontage_m)
    VALUES (
      v_unit_id,
      v_rec.zone_id,
      v_prop,
      v_rec.brand,
      CASE
        WHEN v_rec.zone_id = z_anchor       THEN 'A-' || LPAD(v_unit_num::TEXT, 3, '0')
        WHEN v_rec.zone_id = z_fashion_core THEN 'G-' || LPAD(v_unit_num::TEXT, 3, '0')
        WHEN v_rec.zone_id = z_right_wing   THEN 'F-' || LPAD(v_unit_num::TEXT, 3, '0')
        WHEN v_rec.zone_id = z_food_left    THEN 'FC-' || LPAD(v_unit_num::TEXT, 3, '0')
        WHEN v_rec.zone_id = z_services     THEN 'S-' || LPAD(v_unit_num::TEXT, 3, '0')
        WHEN v_rec.zone_id = z_kids         THEN 'E-' || LPAD(v_unit_num::TEXT, 3, '0')
        ELSE 'U-' || LPAD(v_unit_num::TEXT, 3, '0')
      END,
      CASE
        WHEN v_rec.zone_id IN (z_anchor, z_fashion_core) THEN 0
        ELSE 1
      END,
      v_rec.area_sqm,
      'occupied',
      GREATEST(3.0, LEAST(30.0, SQRT(v_rec.area_sqm) * 1.2))
    );

    -- Create lease
    v_lease_id := uuid_generate_v4();
    v_min_rent := v_rec.area_sqm * v_rec.rent_sqm;

    v_start_date := '2023-01-01'::DATE + (floor(random() * 900))::INT;
    IF v_start_date > '2025-09-01'::DATE THEN
      v_start_date := '2024-06-01'::DATE;
    END IF;
    v_end_date := v_start_date + ((730 + floor(random() * 1096))::INT || ' days')::INTERVAL;

    INSERT INTO leases (id, unit_id, tenant_id, property_id, start_date, end_date,
                        min_rent_monthly_egp, percentage_rate, security_deposit_egp,
                        escalation_rate, status)
    VALUES (
      v_lease_id,
      v_unit_id,
      v_tenant_id,
      v_prop,
      v_start_date,
      v_end_date,
      v_min_rent,
      v_rec.pct_rate,
      v_min_rent * 3,
      CASE WHEN random() < 0.5 THEN 5.00 ELSE 7.00 END,
      'active'
    );

    -- Determine underreporter status
    v_is_underreporter := v_rec.brand = ANY(v_underreporters);
    IF v_is_underreporter THEN
      v_underreport_factor := 0.55 + random() * 0.20;
    ELSE
      v_underreport_factor := 1.0;
    END IF;

    -- ==============================================================
    -- STEP 3: Generate 6 months of sales + revenue estimates (Oct 2025 - Mar 2026)
    -- ==============================================================

    FOR v_month IN 0..5 LOOP
      v_year := CASE WHEN (10 + v_month) > 12 THEN 2026 ELSE 2025 END;

      CASE v_rec.category
        WHEN 'grocery' THEN
          v_base_rev := v_rec.area_sqm * (1500 + random() * 1000);
        WHEN 'food' THEN
          v_base_rev := v_rec.area_sqm * (2000 + random() * 3000);
        WHEN 'fashion' THEN
          v_base_rev := v_rec.area_sqm * (800 + random() * 1700);
        WHEN 'electronics' THEN
          v_base_rev := v_rec.area_sqm * (1500 + random() * 2500);
        WHEN 'entertainment' THEN
          v_base_rev := v_rec.area_sqm * (600 + random() * 1200);
        WHEN 'services' THEN
          v_base_rev := v_rec.area_sqm * (1000 + random() * 2000);
        ELSE
          v_base_rev := v_rec.area_sqm * (1000 + random() * 1500);
      END CASE;

      -- Monthly variation +/- 15%
      v_base_rev := v_base_rev * (0.85 + random() * 0.30);

      IF v_is_underreporter THEN
        v_reported := v_base_rev * v_underreport_factor;
      ELSE
        v_reported := v_base_rev * (0.90 + random() * 0.20);
      END IF;

      v_estimated := v_base_rev * (0.92 + random() * 0.16);

      INSERT INTO tenant_sales_reported (
        lease_id, tenant_id, period_month, period_year,
        reported_revenue_egp, submission_date, verified
      ) VALUES (
        v_lease_id,
        v_tenant_id,
        CASE WHEN (10 + v_month) > 12 THEN (10 + v_month) - 12 ELSE 10 + v_month END,
        v_year,
        ROUND(v_reported, 2),
        make_date(v_year, CASE WHEN (10 + v_month) > 12 THEN (10 + v_month) - 12 ELSE 10 + v_month END, 1)
          + (3 + floor(random() * 8))::INT,
        CASE WHEN random() < 0.3 THEN true ELSE false END
      );

      INSERT INTO revenue_estimates (
        unit_id, tenant_id, period_month, period_year,
        estimated_revenue_egp, confidence_score, methodology, model_version
      ) VALUES (
        v_unit_id,
        v_tenant_id,
        CASE WHEN (10 + v_month) > 12 THEN (10 + v_month) - 12 ELSE 10 + v_month END,
        v_year,
        ROUND(v_estimated, 2),
        0.75 + random() * 0.20,
        'footfall_conversion_model',
        'v1.2'
      );

      -- Discrepancy for underreporters
      IF v_is_underreporter THEN
        INSERT INTO discrepancies (
          unit_id, tenant_id, period_month, period_year,
          reported_revenue_egp, estimated_revenue_egp,
          variance_egp, variance_pct, confidence, status
        ) VALUES (
          v_unit_id,
          v_tenant_id,
          CASE WHEN (10 + v_month) > 12 THEN (10 + v_month) - 12 ELSE 10 + v_month END,
          v_year,
          ROUND(v_reported, 2),
          ROUND(v_estimated, 2),
          ROUND(v_estimated - v_reported, 2),
          ROUND(((v_estimated - v_reported) / NULLIF(v_estimated, 0)) * 100, 2),
          0.78 + random() * 0.18,
          CASE
            WHEN random() < 0.2 THEN 'investigating'
            WHEN random() < 0.1 THEN 'resolved'
            ELSE 'flagged'
          END
        );
      END IF;

    END LOOP;

    -- ==============================================================
    -- STEP 4: Generate 6 months of rent transactions
    -- ==============================================================

    FOR v_month IN 0..5 LOOP
      v_year := CASE WHEN (10 + v_month) > 12 THEN 2026 ELSE 2025 END;
      v_rent_due := v_min_rent;

      v_pay_date := make_date(v_year, CASE WHEN (10 + v_month) > 12 THEN (10 + v_month) - 12 ELSE 10 + v_month END, 1)
                    + floor(random() * 7)::INT;
      v_paid := v_rent_due;
      v_pay_status := 'paid';

      INSERT INTO rent_transactions (
        lease_id,
        period_month, period_year,
        min_rent_due, percentage_rent_due,
        amount_due, amount_paid,
        payment_date, payment_method, status, source
      ) VALUES (
        v_lease_id,
        CASE WHEN (10 + v_month) > 12 THEN (10 + v_month) - 12 ELSE 10 + v_month END,
        v_year,
        v_rent_due,
        0,
        v_rent_due,
        ROUND(v_paid, 2),
        v_pay_date,
        CASE WHEN random() < 0.6 THEN 'bank_transfer'
             WHEN random() < 0.8 THEN 'cheque'
             ELSE 'cash'
        END,
        v_pay_status,
        'jde_import'
      );
    END LOOP;

    -- ==============================================================
    -- STEP 5: Generate 30 days of footfall readings
    -- Hourly readings from 10 AM to 11 PM for last 30 days
    -- ==============================================================

    -- Base footfall proportional to area
    v_base_count := GREATEST(5, (v_rec.area_sqm / 10)::INT);

    FOR v_day IN 0..29 LOOP
      FOR v_month IN 10..22 LOOP  -- hours 10 to 22 (10 AM to 10 PM)
        v_ts := (CURRENT_DATE - v_day) + (v_month || ' hours')::INTERVAL
                + (floor(random() * 50) || ' minutes')::INTERVAL;

        INSERT INTO footfall_readings (
          zone_id, unit_id, camera_id, timestamp,
          count_in, count_out, dwell_seconds, confidence
        ) VALUES (
          v_rec.zone_id,
          v_unit_id,
          NULL,
          v_ts,
          -- Peak at 1-3 PM and 7-9 PM
          CASE
            WHEN v_month BETWEEN 13 AND 15 THEN v_base_count + floor(random() * v_base_count * 0.8)::INT
            WHEN v_month BETWEEN 19 AND 21 THEN v_base_count + floor(random() * v_base_count * 0.6)::INT
            ELSE GREATEST(1, v_base_count - floor(random() * (v_base_count * 0.4))::INT)
          END,
          CASE
            WHEN v_month BETWEEN 13 AND 15 THEN v_base_count + floor(random() * v_base_count * 0.7)::INT
            WHEN v_month BETWEEN 19 AND 21 THEN v_base_count + floor(random() * v_base_count * 0.5)::INT
            ELSE GREATEST(1, v_base_count - floor(random() * (v_base_count * 0.5))::INT)
          END,
          (60 + floor(random() * 600))::INT,
          0.80 + random() * 0.18
        );
      END LOOP;
    END LOOP;

  END LOOP;

  RAISE NOTICE 'Successfully added ~37 additional tenants with units, leases, sales, rent, and footfall data';

END $$;
