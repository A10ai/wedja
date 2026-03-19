-- ============================================================
-- Wedja Anomaly Detection — The Watchdog
--
-- The AI never sleeps. It watches footfall, energy, revenue,
-- queues, parking, maintenance, and correlations 24/7.
-- When something is unusual, it flags it here.
-- ============================================================

-- ── Anomalies Table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  anomaly_type TEXT NOT NULL CHECK (anomaly_type IN (
    'footfall_spike', 'footfall_drop', 'energy_spike', 'energy_drop',
    'revenue_anomaly', 'rent_delay_pattern', 'queue_anomaly',
    'parking_anomaly', 'security_pattern', 'maintenance_pattern',
    'conversion_anomaly', 'occupancy_anomaly', 'correlation_break'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  zone_id UUID REFERENCES zones(id),
  unit_id UUID REFERENCES units(id),
  tenant_id UUID REFERENCES tenants(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  expected_value NUMERIC,
  actual_value NUMERIC,
  deviation_pct NUMERIC,
  impact_egp NUMERIC,
  data_source TEXT,
  related_anomalies UUID[],
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'investigating', 'resolved', 'false_alarm')),
  auto_detected BOOLEAN DEFAULT true,
  detection_confidence NUMERIC DEFAULT 0,
  acknowledged_by UUID REFERENCES staff(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomalies_status ON anomalies(property_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_type ON anomalies(anomaly_type, severity);
CREATE INDEX IF NOT EXISTS idx_anomalies_zone ON anomalies(zone_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_tenant ON anomalies(tenant_id);

-- ── Seed Realistic Anomalies ────────────────────────────────
-- These represent what Wedja would detect in a live mall

DO $$
DECLARE
  v_property_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_zone_fashion UUID;
  v_zone_food UUID;
  v_zone_entertainment UUID;
  v_zone_services UUID;
  v_zone_parking UUID;
  v_tenant_spinneys UUID;
  v_tenant_adidas UUID;
  v_tenant_kfc UUID;
  v_unit_spinneys UUID;
  v_unit_adidas UUID;
  v_unit_kfc UUID;
  v_anomaly_energy UUID;
  v_anomaly_hvac UUID;
  v_anomaly_footfall UUID;
  v_anomaly_revenue UUID;
BEGIN
  -- Get zone IDs
  SELECT id INTO v_zone_fashion FROM zones WHERE property_id = v_property_id AND type = 'retail' LIMIT 1;
  SELECT id INTO v_zone_food FROM zones WHERE property_id = v_property_id AND type = 'food' LIMIT 1;
  SELECT id INTO v_zone_entertainment FROM zones WHERE property_id = v_property_id AND type = 'entertainment' LIMIT 1;
  SELECT id INTO v_zone_services FROM zones WHERE property_id = v_property_id AND type = 'service' LIMIT 1;
  SELECT id INTO v_zone_parking FROM zones WHERE property_id = v_property_id AND type = 'parking' LIMIT 1;

  -- Get tenant/unit IDs
  SELECT t.id, l.unit_id INTO v_tenant_spinneys, v_unit_spinneys
    FROM tenants t JOIN leases l ON l.tenant_id = t.id
    WHERE t.brand_name ILIKE '%Spinneys%' AND l.status = 'active' LIMIT 1;

  SELECT t.id, l.unit_id INTO v_tenant_adidas, v_unit_adidas
    FROM tenants t JOIN leases l ON l.tenant_id = t.id
    WHERE t.brand_name ILIKE '%Adidas%' AND l.status = 'active' LIMIT 1;

  SELECT t.id, l.unit_id INTO v_tenant_kfc, v_unit_kfc
    FROM tenants t JOIN leases l ON l.tenant_id = t.id
    WHERE t.brand_name ILIKE '%KFC%' AND l.status = 'active' LIMIT 1;

  -- Use fallbacks if specific tenants not found
  IF v_zone_fashion IS NULL THEN
    SELECT id INTO v_zone_fashion FROM zones WHERE property_id = v_property_id LIMIT 1;
  END IF;
  IF v_zone_food IS NULL THEN v_zone_food := v_zone_fashion; END IF;
  IF v_zone_entertainment IS NULL THEN v_zone_entertainment := v_zone_fashion; END IF;

  -- 1. CRITICAL: Energy spike in Food Court at 2AM — HVAC thermostat malfunction
  v_anomaly_energy := gen_random_uuid();
  INSERT INTO anomalies (id, property_id, anomaly_type, severity, zone_id, title, description,
    expected_value, actual_value, deviation_pct, impact_egp, data_source,
    status, auto_detected, detection_confidence, created_at)
  VALUES (
    v_anomaly_energy, v_property_id, 'energy_spike', 'critical', v_zone_food,
    'Energy spike in Food Court at 2AM — HVAC thermostat malfunction',
    'Food Court zone consumed 847 kWh between 1AM-4AM, which is 340% above the normal after-hours baseline of 192 kWh. This pattern matches a stuck thermostat or HVAC unit running in full cooling mode. Estimated waste: EGP 1,650/night if unresolved.',
    192, 847, 341, 49500,
    'energy_readings',
    'active', true, 0.92,
    NOW() - INTERVAL '2 hours'
  );

  -- 2. HIGH: Spinneys footfall 25% below Saturday average
  v_anomaly_footfall := gen_random_uuid();
  INSERT INTO anomalies (id, property_id, anomaly_type, severity, zone_id, unit_id, tenant_id, title, description,
    expected_value, actual_value, deviation_pct, impact_egp, data_source,
    related_anomalies, status, auto_detected, detection_confidence, created_at)
  VALUES (
    v_anomaly_footfall, v_property_id, 'footfall_drop', 'high', v_zone_fashion, v_unit_spinneys, v_tenant_spinneys,
    'Spinneys footfall 25% below Saturday average — car park construction on east side?',
    'Spinneys Hypermarket recorded 2,340 visitors today vs 4-week Saturday average of 3,120. The east parking entrance, which feeds 40% of Spinneys traffic, is partially blocked by construction. Other zones are within normal range, isolating this to the east wing.',
    3120, 2340, -25, 23400,
    'footfall_daily',
    NULL,
    'active', true, 0.87,
    NOW() - INTERVAL '4 hours'
  );

  -- 3. HIGH: Adidas reported sales 40% below estimate for 3rd consecutive month
  v_anomaly_revenue := gen_random_uuid();
  INSERT INTO anomalies (id, property_id, anomaly_type, severity, zone_id, unit_id, tenant_id, title, description,
    expected_value, actual_value, deviation_pct, impact_egp, data_source,
    status, auto_detected, detection_confidence, created_at)
  VALUES (
    v_anomaly_revenue, v_property_id, 'revenue_anomaly', 'high', v_zone_fashion, v_unit_adidas, v_tenant_adidas,
    'Adidas reported sales 40% below estimate for 3rd consecutive month — investigate',
    'Adidas has reported monthly sales of EGP 185,000 against an AI estimate of EGP 308,000 based on footfall and category benchmarks. This is the 3rd month with >35% variance. Pattern suggests systematic underreporting or genuine performance issue requiring audit.',
    308000, 185000, -40, 147600,
    'tenant_sales_reported + footfall_daily',
    NULL,
    'active', true, 0.78,
    NOW() - INTERVAL '1 day'
  );

  -- 4. MEDIUM: Parking 92% at 3PM Saturday — approaching capacity
  INSERT INTO anomalies (property_id, anomaly_type, severity, zone_id, title, description,
    expected_value, actual_value, deviation_pct, impact_egp, data_source,
    status, auto_detected, detection_confidence, created_at)
  VALUES (
    v_property_id, 'parking_anomaly', 'medium', v_zone_parking,
    'Parking 92% at 3PM Saturday — approaching capacity',
    'Main parking reached 92% occupancy at 15:00 on Saturday, 18% above the typical Saturday peak of 78%. If this continues, visitors may circle for parking or leave. Recommend activating overflow signage and directing to B2 level which is at 64%.',
    78, 92, 18, 15000,
    'parking_readings',
    'active', true, 0.94,
    NOW() - INTERVAL '6 hours'
  );

  -- 5. MEDIUM: Escalator B3 — 2nd maintenance ticket in 15 days
  v_anomaly_hvac := gen_random_uuid();
  INSERT INTO anomalies (id, property_id, anomaly_type, severity, zone_id, title, description,
    expected_value, actual_value, deviation_pct, impact_egp, data_source,
    related_anomalies, status, auto_detected, detection_confidence, created_at)
  VALUES (
    v_anomaly_hvac, v_property_id, 'maintenance_pattern', 'medium', v_zone_fashion,
    'Escalator B3: 2nd maintenance ticket in 15 days — replacement assessment needed',
    'Escalator B3 in Fashion Wing has generated 2 maintenance tickets in the last 15 days. First was a motor overheating issue on March 5th (resolved in 4 hours), now a step misalignment reported today. Repeated failures suggest end-of-life. Replacement cost: EGP 180,000. Current repair cost trending: EGP 12,000/month.',
    0, 2, 100, 180000,
    'maintenance_tickets',
    ARRAY[v_anomaly_energy],
    'active', true, 0.85,
    NOW() - INTERVAL '3 hours'
  );

  -- 6. CRITICAL: Correlation — Footfall up 20% but revenue declined
  INSERT INTO anomalies (property_id, anomaly_type, severity, zone_id, title, description,
    expected_value, actual_value, deviation_pct, impact_egp, data_source,
    related_anomalies, status, auto_detected, detection_confidence, created_at)
  VALUES (
    v_property_id, 'correlation_break', 'critical', v_zone_fashion,
    'Fashion Wing: Footfall up 20% but revenue declined 8% — conversion crisis',
    'Fashion Wing footfall increased 20% week-over-week (likely driven by the Spring Sale campaign) but tenant-reported revenue in the wing declined 8%. This breaks the normal footfall-revenue correlation. Either: (1) Tenants are underreporting during high-traffic periods, (2) Browse-to-buy conversion has collapsed, or (3) Average basket size dropped significantly. Requires immediate audit of top 5 fashion tenants.',
    NULL, NULL, NULL, 89000,
    'footfall_daily + tenant_sales_reported',
    ARRAY[v_anomaly_footfall, v_anomaly_revenue],
    'active', true, 0.81,
    NOW() - INTERVAL '12 hours'
  );

  -- 7. LOW: Queue disappeared at KFC during peak lunch
  INSERT INTO anomalies (property_id, anomaly_type, severity, zone_id, unit_id, tenant_id, title, description,
    expected_value, actual_value, deviation_pct, impact_egp, data_source,
    status, auto_detected, detection_confidence, created_at)
  VALUES (
    v_property_id, 'queue_anomaly', 'low', v_zone_food, v_unit_kfc, v_tenant_kfc,
    'KFC queue disappeared at 1PM — POS down or staff shortage?',
    'KFC typically has 8-12 person queue from 12:30-14:00. Today at 13:00, queue detection showed 0 people. This could indicate a POS system failure, temporary closure, or unusual staff scheduling. Food court overall footfall is normal.',
    10, 0, -100, 8500,
    'queue_readings',
    'active', true, 0.72,
    NOW() - INTERVAL '5 hours'
  );

  -- 8. MEDIUM: After-hours energy in multiple zones
  INSERT INTO anomalies (property_id, anomaly_type, severity, title, description,
    expected_value, actual_value, deviation_pct, impact_egp, data_source,
    status, auto_detected, detection_confidence, created_at)
  VALUES (
    v_property_id, 'energy_spike', 'medium',
    'After-hours energy consumption 35% above baseline across 3 zones',
    'Between 23:00-06:00, total energy consumption was 2,140 kWh vs expected baseline of 1,585 kWh. Fashion Wing (+42%), Entertainment (+28%), and Services (+31%) all showed elevated consumption. Possible causes: lights left on, HVAC schedules not updated for summer, or unauthorized after-hours access.',
    1585, 2140, 35, 16650,
    'energy_readings',
    'active', true, 0.88,
    NOW() - INTERVAL '8 hours'
  );

  -- 9. Previously resolved anomaly (for history)
  INSERT INTO anomalies (property_id, anomaly_type, severity, zone_id, title, description,
    expected_value, actual_value, deviation_pct, impact_egp, data_source,
    status, auto_detected, detection_confidence, resolved_at, resolution_notes, created_at)
  VALUES (
    v_property_id, 'energy_drop', 'high', v_zone_entertainment,
    'Entertainment zone power fluctuation — UPS battery issue',
    'Entertainment zone experienced 3 brief power dips in 2 hours. Main UPS battery bank showing degraded capacity at 62%. Kidzo indoor park and arcade machines affected.',
    100, 62, -38, 25000,
    'energy_readings',
    'resolved', true, 0.91,
    NOW() - INTERVAL '2 days',
    'UPS battery bank replaced. New capacity at 98%. Total cost: EGP 18,500. Downtime: 45 minutes during off-peak.',
    NOW() - INTERVAL '5 days'
  );

  -- 10. False alarm (for history and learning)
  INSERT INTO anomalies (property_id, anomaly_type, severity, zone_id, title, description,
    expected_value, actual_value, deviation_pct, data_source,
    status, auto_detected, detection_confidence, resolved_at, resolution_notes, created_at)
  VALUES (
    v_property_id, 'footfall_spike', 'medium', v_zone_food,
    'Food Court footfall spike 45% above normal on Tuesday',
    'Food Court recorded 4,850 visitors vs Tuesday average of 3,340. Flagged as unusual for a weekday.',
    3340, 4850, 45,
    'footfall_daily',
    'false_alarm', true, 0.65,
    NOW() - INTERVAL '3 days',
    'Public holiday (Ramadan celebration) — expected higher traffic. Updating holiday calendar for future detection accuracy.',
    NOW() - INTERVAL '4 days'
  );

  -- 11. Another resolved for history
  INSERT INTO anomalies (property_id, anomaly_type, severity, zone_id, title, description,
    expected_value, actual_value, deviation_pct, impact_egp, data_source,
    status, auto_detected, detection_confidence, resolved_at, resolution_notes, created_at)
  VALUES (
    v_property_id, 'rent_delay_pattern', 'high', v_zone_fashion,
    '12 tenants past payment deadline — system delay identified',
    '12 tenants showed as overdue when payments were actually received but not posted in JDE due to bank reconciliation delay.',
    0, 12, 100, 0,
    'rent_transactions',
    'resolved', true, 0.70,
    NOW() - INTERVAL '10 days',
    'JDE posting delay — payments were received on time. Finance team updated reconciliation schedule from weekly to daily.',
    NOW() - INTERVAL '12 days'
  );

END $$;
