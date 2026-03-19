-- ============================================================
-- Migration 00008: Replace dummy tenants with REAL Senzo Mall data
-- 83 tenants from actual lease PDF
-- ============================================================

DO $$
DECLARE
  v_prop UUID := 'a0000000-0000-0000-0000-000000000001';

  -- Zone IDs (keep existing zones intact)
  z_gf_retail  UUID := 'b0000000-0000-0000-0000-000000000001'; -- Ground Floor Retail
  z_ff_retail  UUID := 'b0000000-0000-0000-0000-000000000002'; -- First Floor Retail
  z_food       UUID := 'b0000000-0000-0000-0000-000000000003'; -- Food Court
  z_entertain  UUID := 'b0000000-0000-0000-0000-000000000004'; -- Entertainment Zone
  z_anchor     UUID := 'b0000000-0000-0000-0000-000000000005'; -- Anchor Zone
  z_services   UUID := 'b0000000-0000-0000-0000-000000000006'; -- Services Area

  -- Temp variables
  v_tenant_id  UUID;
  v_unit_id    UUID;
  v_lease_id   UUID;
  v_month      INT;
  v_year       INT;
  v_min_rent   NUMERIC;
  v_pct_rate   NUMERIC;
  v_area       NUMERIC;
  v_base_rev   NUMERIC;
  v_reported   NUMERIC;
  v_estimated  NUMERIC;
  v_is_underreporter BOOLEAN;
  v_underreport_factor NUMERIC;
  v_start_date DATE;
  v_end_date   DATE;
  v_lease_rec  RECORD;
  v_rent_due   NUMERIC;
  v_paid       NUMERIC;
  v_pay_date   DATE;
  v_pay_status TEXT;
  v_unit_num   INT := 0;
  v_category   TEXT;

  -- Underreporting tenant names (8-10 tenants, mix of large and small)
  v_underreporters TEXT[] := ARRAY[
    'SPINNEYS',        -- large anchor, underreports 25%
    'LC WAIKIKI',      -- large fashion, underreports 30%
    'McDonalds',       -- large food, underreports 35%
    'Adidas',          -- intl brand, underreports 28%
    'OR',              -- large fashion, underreports 25%
    'Bianco Café',     -- large food, underreports 30%
    'Kams Store Company', -- small, underreports 40%
    'Arabian Oud',     -- services, underreports 35%
    'Cortoba',         -- large food, underreports 30%
    'A R for Wholesale' -- services, underreports 45%
  ];

  -- Late payers
  v_late_payers TEXT[] := ARRAY[
    'PREMODA',
    'Dona Dony',
    'EL-DANYEL',
    'Converse',
    'Palladium'
  ];

BEGIN

  -- ================================================================
  -- STEP 1: Delete all existing tenant-related data
  -- Order matters due to FK constraints
  -- ================================================================

  DELETE FROM discrepancies WHERE unit_id IN (SELECT id FROM units WHERE property_id = v_prop);
  DELETE FROM revenue_estimates WHERE unit_id IN (SELECT id FROM units WHERE property_id = v_prop);
  DELETE FROM tenant_sales_reported WHERE tenant_id IN (SELECT id FROM tenants);
  DELETE FROM rent_transactions WHERE lease_id IN (SELECT id FROM leases WHERE property_id = v_prop);
  DELETE FROM footfall_readings WHERE unit_id IN (SELECT id FROM units WHERE property_id = v_prop);
  DELETE FROM footfall_daily WHERE unit_id IN (SELECT id FROM units WHERE property_id = v_prop);
  DELETE FROM leases WHERE property_id = v_prop;
  DELETE FROM units WHERE property_id = v_prop;
  DELETE FROM tenants;

  -- ================================================================
  -- STEP 2: Create all 83 tenants, units, and leases via a helper
  -- We use a temp table to drive the loop
  -- ================================================================

  CREATE TEMP TABLE _tenant_data (
    idx         SERIAL,
    brand       TEXT,
    area_sqm    NUMERIC,
    rent_sqm    NUMERIC,
    pct_rate    NUMERIC,
    category    TEXT,
    brand_type  TEXT,
    zone_id     UUID
  ) ON COMMIT DROP;

  -- Insert all 83 tenants
  -- grocery
  INSERT INTO _tenant_data (brand, area_sqm, rent_sqm, pct_rate, category, brand_type, zone_id) VALUES
    ('SPINNEYS',                5327, 309.74, 4.00,  'grocery',     'international', z_anchor);

  -- fashion
  INSERT INTO _tenant_data (brand, area_sqm, rent_sqm, pct_rate, category, brand_type, zone_id) VALUES
    ('Town Team',               650,  400.72, 12.00, 'fashion',     'local',         z_gf_retail),
    ('Seventy',                  72,  880.00, 10.00, 'fashion',     'local',         z_gf_retail),
    ('LC WAIKIKI',             1719,  684.00,  9.00, 'fashion',     'international', z_gf_retail),
    ('DALY DRESS',              216,  445.69, 10.00, 'fashion',     'local',         z_gf_retail),
    ('PREMODA',                 216,  376.23, 10.00, 'fashion',     'local',         z_gf_retail),
    ('OXYGEN (Dejavu)',          72,  770.00, 12.00, 'fashion',     'local',         z_gf_retail),
    ('Quik Silver',              73,  525.00, 10.00, 'fashion',     'international', z_gf_retail),
    ('Timberland',              103,  525.00, 10.00, 'fashion',     'international', z_gf_retail),
    ('Adidas',                  222,  504.00, 10.00, 'fashion',     'international', z_gf_retail),
    ('Puma',                    160,  504.00, 10.00, 'fashion',     'international', z_gf_retail),
    ('Levi''s',                 100,  504.00, 10.00, 'fashion',     'international', z_gf_retail),
    ('Geox',                     90,  529.20, 10.00, 'fashion',     'international', z_gf_retail),
    ('Clue',                     72,  585.64, 10.00, 'fashion',     'local',         z_gf_retail),
    ('Kams Store Company',      216,  770.00, 15.00, 'fashion',     'local',         z_gf_retail),
    ('Shock',                    72,  917.89, 10.00, 'fashion',     'local',         z_gf_retail),
    ('FOOT PRINT',              122,  750.00, 12.00, 'fashion',     'local',         z_gf_retail),
    ('Vanilla',                 144,  750.00, 12.00, 'fashion',     'local',         z_ff_retail),
    ('Embrator',                 40, 1320.00, 10.00, 'fashion',     'local',         z_ff_retail),
    ('Surf Shop',               108, 1027.20, 10.00, 'fashion',     'local',         z_gf_retail),
    ('Active',                  120, 1053.21, 12.00, 'fashion',     'local',         z_gf_retail),
    ('OR',                      388,  750.00, 10.00, 'fashion',     'local',         z_ff_retail),
    ('Mitara',                   72,  900.00, 10.00, 'fashion',     'local',         z_ff_retail),
    ('COUP',                    220,  750.00, 10.00, 'fashion',     'local',         z_ff_retail),
    ('CARROT',                   72, 1000.00, 12.00, 'fashion',     'local',         z_ff_retail),
    ('Dona Dony',               128,  408.15, 10.00, 'fashion',     'local',         z_ff_retail),
    ('OZONE',                   328,  550.00, 10.00, 'fashion',     'local',         z_ff_retail),
    ('Hechter Paris',           122,  550.00, 10.00, 'fashion',     'local',         z_ff_retail),
    ('EL-DANYEL',                72,  512.44, 10.00, 'fashion',     'local',         z_ff_retail),
    ('Converse',                 72,  440.90, 10.00, 'fashion',     'international', z_gf_retail),
    ('Defacto',                1586,  145.98,  8.00, 'fashion',     'international', z_gf_retail),
    ('COLIN''S',                443,    0.00, 11.00, 'fashion',     'local',         z_ff_retail),
    ('MS Designs',               72,  855.80, 10.00, 'fashion',     'local',         z_ff_retail),
    ('Floyd',                   144,  900.00, 10.00, 'fashion',     'local',         z_ff_retail),
    ('Shoe Room',                96,  800.00, 10.00, 'fashion',     'local',         z_gf_retail),
    ('My Secret',                96,  604.85, 18.00, 'fashion',     'local',         z_ff_retail),
    ('Lotfy Co',                 50,  860.00, 10.00, 'fashion',     'local',         z_gf_retail),
    ('Kazary',                  217,  850.00, 12.00, 'fashion',     'local',         z_ff_retail),
    ('Palladium',                72,  780.00,  8.00, 'fashion',     'local',         z_gf_retail),
    ('Concrete Co',             172,  825.00, 11.00, 'fashion',     'local',         z_ff_retail),
    ('Ravin',                   440,  267.50,  9.00, 'fashion',     'local',         z_ff_retail),
    ('Ryada Comfort',           108,  770.00, 10.00, 'fashion',     'local',         z_ff_retail),
    ('Daly Dress Dare',         144,  561.45, 10.00, 'fashion',     'local',         z_ff_retail),
    ('Venti',                   140,  947.57, 10.00, 'fashion',     'local',         z_ff_retail),
    ('CARENA',                  144,  800.00, 10.00, 'fashion',     'local',         z_ff_retail),
    ('Emeli',                    72, 1100.00, 10.00, 'fashion',     'local',         z_ff_retail),
    ('Step Smooth CAT shoes',    72,  950.00, 10.00, 'fashion',     'local',         z_gf_retail),
    ('FRILLY',                   72,  825.00, 10.00, 'fashion',     'local',         z_ff_retail),
    ('I PIXI EGYPT',           216,  800.00, 10.00, 'fashion',     'local',         z_ff_retail),
    ('ONE MORE CO',             144,  750.00, 12.00, 'fashion',     'local',         z_ff_retail),
    ('Boba Spot',                20, 1457.19, 15.00, 'fashion',     'local',         z_gf_retail);

  -- food
  INSERT INTO _tenant_data (brand, area_sqm, rent_sqm, pct_rate, category, brand_type, zone_id) VALUES
    ('KFC',                     360,  412.16,  7.00, 'food',        'international', z_food),
    ('GENRAL KOMARS',            32, 1467.77, 14.00, 'food',        'local',         z_food),
    ('McDonalds',               374,    0.00,  7.50, 'food',        'international', z_food),
    ('Cold Stone',              105,  264.30, 15.00, 'food',        'international', z_food),
    ('Lavender Restaurant',      60,  666.67, 15.00, 'food',        'local',         z_food),
    ('Pizza Hut',               200,    0.00,  5.00, 'food',        'international', z_food),
    ('Cortoba',                 483,  496.89, 15.00, 'food',        'local',         z_food),
    ('Segafredo Cafe',          195,  505.38, 10.00, 'food',        'international', z_food),
    ('Bianco Café',             440,  522.73, 15.00, 'food',        'local',         z_food),
    ('CHILI''S Rest',           450,  209.73, 10.00, 'food',        'international', z_food),
    ('Brioche Doree Café',      213,  149.80, 15.00, 'food',        'international', z_food),
    ('Jacobs Café',             105,  523.81,  0.00, 'food',        'local',         z_food),
    ('Mia Alzahab',              40, 5500.00, 18.00, 'services',    'local',         z_services);

  -- electronics
  INSERT INTO _tenant_data (brand, area_sqm, rent_sqm, pct_rate, category, brand_type, zone_id) VALUES
    ('Orange',                   55,  455.83,  0.00, 'electronics', 'international', z_services),
    ('We',                       72,  950.00,  0.00, 'electronics', 'local',         z_services),
    ('Switch plus Apple',        72,  880.00,  0.00, 'electronics', 'local',         z_services),
    ('Mi Retail',                40,  880.00,  0.00, 'electronics', 'international', z_services),
    ('DREAM TELECOM',            60, 1300.00, 10.00, 'electronics', 'local',         z_services),
    ('First Vodafone',           72, 1100.00,  0.00, 'electronics', 'local',         z_services);

  -- services
  INSERT INTO _tenant_data (brand, area_sqm, rent_sqm, pct_rate, category, brand_type, zone_id) VALUES
    ('PHARMACY LIFE',           139,  786.50,  5.00, 'services',    'local',         z_services),
    ('Duty Free',               301,  440.00,  0.00, 'services',    'local',         z_services),
    ('Eye Fashion Optics',       72, 1194.30, 15.00, 'services',    'local',         z_services),
    ('Joly Optics',              72, 1300.00, 15.00, 'services',    'local',         z_services),
    ('Madar Optics',             72,  907.50, 10.00, 'services',    'local',         z_services),
    ('Diamond Palace',           54,  724.73,  0.00, 'services',    'local',         z_services),
    ('Egypt Gold Co',            72, 1650.00,  0.00, 'services',    'local',         z_services),
    ('EG Diamond',               72, 1500.00,  0.00, 'services',    'local',         z_services),
    ('A R for Wholesale',       216, 1217.04, 10.00, 'services',    'local',         z_services),
    ('Fortune',                  72, 1073.22, 12.00, 'services',    'local',         z_services),
    ('Arabian Oud',              72, 1100.00, 10.00, 'services',    'local',         z_services),
    ('Nukhbat Al-oud',           72,  671.00, 10.00, 'services',    'local',         z_services),
    ('Emissa Perfume',            8, 5756.75, 10.00, 'services',    'local',         z_services);

  -- ================================================================
  -- STEP 3: Loop through temp table and create tenants, units, leases
  -- ================================================================

  FOR v_lease_rec IN
    SELECT * FROM _tenant_data ORDER BY idx
  LOOP
    v_unit_num := v_unit_num + 1;

    -- Create tenant
    v_tenant_id := uuid_generate_v4();
    INSERT INTO tenants (id, name, brand_name, category, brand_type, status)
    VALUES (
      v_tenant_id,
      v_lease_rec.brand,
      v_lease_rec.brand,
      v_lease_rec.category,
      v_lease_rec.brand_type,
      'active'
    );

    -- Create unit
    v_unit_id := uuid_generate_v4();
    INSERT INTO units (id, zone_id, property_id, name, unit_number, floor, area_sqm, status, frontage_m)
    VALUES (
      v_unit_id,
      v_lease_rec.zone_id,
      v_prop,
      v_lease_rec.brand,
      CASE
        WHEN v_lease_rec.zone_id = z_anchor    THEN 'A-' || LPAD(v_unit_num::TEXT, 3, '0')
        WHEN v_lease_rec.zone_id = z_gf_retail THEN 'G-' || LPAD(v_unit_num::TEXT, 3, '0')
        WHEN v_lease_rec.zone_id = z_ff_retail THEN 'F-' || LPAD(v_unit_num::TEXT, 3, '0')
        WHEN v_lease_rec.zone_id = z_food      THEN 'FC-' || LPAD(v_unit_num::TEXT, 3, '0')
        WHEN v_lease_rec.zone_id = z_services  THEN 'S-' || LPAD(v_unit_num::TEXT, 3, '0')
        ELSE 'U-' || LPAD(v_unit_num::TEXT, 3, '0')
      END,
      CASE
        WHEN v_lease_rec.zone_id IN (z_anchor, z_gf_retail) THEN 0
        WHEN v_lease_rec.zone_id IN (z_ff_retail, z_food, z_services) THEN 1
        ELSE 0
      END,
      v_lease_rec.area_sqm,
      'occupied',
      GREATEST(3.0, LEAST(30.0, SQRT(v_lease_rec.area_sqm) * 1.2))
    );

    -- Create lease with varied start dates
    v_lease_id := uuid_generate_v4();
    v_min_rent := v_lease_rec.area_sqm * v_lease_rec.rent_sqm;

    -- Vary start dates between 2023-01-01 and 2025-06-01
    v_start_date := '2023-01-01'::DATE + (floor(random() * 900))::INT;
    -- Ensure start is not in future
    IF v_start_date > '2025-09-01'::DATE THEN
      v_start_date := '2024-06-01'::DATE;
    END IF;
    -- End date 2-5 years from start
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
      v_lease_rec.pct_rate,
      v_min_rent * 3,  -- 3 months deposit
      CASE WHEN random() < 0.5 THEN 5.00 ELSE 7.00 END,
      'active'
    );

    -- Determine if this tenant is an underreporter
    v_is_underreporter := v_lease_rec.brand = ANY(v_underreporters);
    IF v_is_underreporter THEN
      -- Underreport factor: 0.55 to 0.75 (i.e., report 55-75% of actual)
      v_underreport_factor := 0.55 + random() * 0.20;
    ELSE
      v_underreport_factor := 1.0;
    END IF;

    -- ==============================================================
    -- STEP 4: Generate 6 months of reported sales (Oct 2025 - Mar 2026)
    -- ==============================================================

    FOR v_month IN 0..5 LOOP
      -- Period: starting from October 2025
      v_year := CASE WHEN (10 + v_month) > 12 THEN 2026 ELSE 2025 END;

      -- Calculate base monthly revenue based on category and size
      -- These are realistic revenue-per-sqm ranges for Egyptian malls
      CASE v_lease_rec.category
        WHEN 'grocery' THEN
          -- High volume: 1500-2500 EGP/sqm/month
          v_base_rev := v_lease_rec.area_sqm * (1500 + random() * 1000);
        WHEN 'food' THEN
          -- F&B: 2000-5000 EGP/sqm/month (higher per sqm but smaller spaces)
          v_base_rev := v_lease_rec.area_sqm * (2000 + random() * 3000);
        WHEN 'fashion' THEN
          -- Fashion: 800-2500 EGP/sqm/month
          v_base_rev := v_lease_rec.area_sqm * (800 + random() * 1700);
        WHEN 'electronics' THEN
          -- Electronics: 1500-4000 EGP/sqm/month
          v_base_rev := v_lease_rec.area_sqm * (1500 + random() * 2500);
        WHEN 'services' THEN
          -- Services: 1000-3000 EGP/sqm/month
          v_base_rev := v_lease_rec.area_sqm * (1000 + random() * 2000);
        ELSE
          v_base_rev := v_lease_rec.area_sqm * (1000 + random() * 1500);
      END CASE;

      -- Add monthly variation (±15%)
      v_base_rev := v_base_rev * (0.85 + random() * 0.30);

      -- For underreporters: reported is lower than actual
      IF v_is_underreporter THEN
        v_reported := v_base_rev * v_underreport_factor;
      ELSE
        -- Honest reporters: report within ±10% of actual
        v_reported := v_base_rev * (0.90 + random() * 0.20);
      END IF;

      -- The "estimated" revenue (what AI thinks they actually made)
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

      -- Insert revenue estimate (AI-computed)
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

      -- If underreporter, create discrepancy record
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
    -- STEP 5: Generate 6 months of rent transactions
    -- ==============================================================

    FOR v_month IN 0..5 LOOP
      v_year := CASE WHEN (10 + v_month) > 12 THEN 2026 ELSE 2025 END;

      v_rent_due := v_min_rent;

      -- Determine payment behavior
      IF v_lease_rec.brand = ANY(v_late_payers) THEN
        -- Late payers: occasionally late or partial
        IF random() < 0.4 THEN
          -- Late payment (10-30 days late)
          v_pay_date := make_date(v_year, CASE WHEN (10 + v_month) > 12 THEN (10 + v_month) - 12 ELSE 10 + v_month END, 1)
                        + (10 + floor(random() * 20))::INT;
          IF random() < 0.3 THEN
            -- Partial payment
            v_paid := v_rent_due * (0.5 + random() * 0.3);
            v_pay_status := 'partial';
          ELSE
            v_paid := v_rent_due;
            v_pay_status := 'paid';
          END IF;
        ELSE
          -- On time
          v_pay_date := make_date(v_year, CASE WHEN (10 + v_month) > 12 THEN (10 + v_month) - 12 ELSE 10 + v_month END, 1)
                        + floor(random() * 5)::INT;
          v_paid := v_rent_due;
          v_pay_status := 'paid';
        END IF;
      ELSE
        -- Normal payers: on time
        v_pay_date := make_date(v_year, CASE WHEN (10 + v_month) > 12 THEN (10 + v_month) - 12 ELSE 10 + v_month END, 1)
                      + floor(random() * 7)::INT;
        v_paid := v_rent_due;
        v_pay_status := 'paid';
      END IF;

      -- For the most recent month (Mar 2026), some may still be overdue
      IF v_month = 5 AND v_lease_rec.brand = ANY(v_late_payers) AND random() < 0.5 THEN
        v_paid := 0;
        v_pay_date := NULL;
        v_pay_status := 'overdue';
      END IF;

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
        0, -- percentage rent calculated separately
        v_rent_due,
        ROUND(v_paid, 2),
        v_pay_date,
        CASE WHEN v_pay_status = 'overdue' THEN NULL
             WHEN random() < 0.6 THEN 'bank_transfer'
             WHEN random() < 0.8 THEN 'cheque'
             ELSE 'cash'
        END,
        v_pay_status,
        'jde_import'
      );

    END LOOP;

  END LOOP;

  RAISE NOTICE 'Successfully created 83 tenants with units, leases, 6 months sales data, and rent transactions';

END $$;
