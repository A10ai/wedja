-- ============================================================
-- Custis Extra Seed Data — Rent Transactions, Maintenance, Discrepancies
-- Run after seed.sql
-- ============================================================

-- ── Rent Transactions (Oct 2025 - Mar 2026) ──────────────────

-- Spinneys (lease e001) — always pays on time
INSERT INTO rent_transactions (lease_id, period_month, period_year, min_rent_due, percentage_rent_due, amount_due, amount_paid, payment_date, payment_method, status) VALUES
  ('e0000000-0000-0000-0000-000000000001', 10, 2025, 450000, 510000, 510000, 510000, '2025-10-05', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000001', 11, 2025, 450000, 480000, 480000, 480000, '2025-11-04', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000001', 12, 2025, 450000, 550000, 550000, 550000, '2025-12-06', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000001', 1, 2026, 450000, 510000, 510000, 510000, '2026-01-05', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000001', 2, 2026, 450000, 468000, 468000, 468000, '2026-02-05', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000001', 3, 2026, 450000, 0, 450000, 0, NULL, NULL, 'overdue');

-- Adidas (lease e002)
INSERT INTO rent_transactions (lease_id, period_month, period_year, min_rent_due, percentage_rent_due, amount_due, amount_paid, payment_date, payment_method, status) VALUES
  ('e0000000-0000-0000-0000-000000000002', 10, 2025, 85000, 72000, 85000, 85000, '2025-10-08', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000002', 11, 2025, 85000, 68000, 85000, 85000, '2025-11-07', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000002', 12, 2025, 85000, 96000, 96000, 96000, '2025-12-09', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000002', 1, 2026, 85000, 68000, 85000, 85000, '2026-01-10', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000002', 2, 2026, 85000, 62400, 85000, 85000, '2026-02-08', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000002', 3, 2026, 85000, 0, 85000, 0, NULL, NULL, 'overdue');

-- McDonald's (lease e011)
INSERT INTO rent_transactions (lease_id, period_month, period_year, min_rent_due, percentage_rent_due, amount_due, amount_paid, payment_date, payment_method, status) VALUES
  ('e0000000-0000-0000-0000-000000000011', 10, 2025, 120000, 150000, 150000, 150000, '2025-10-06', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000011', 11, 2025, 120000, 140000, 140000, 140000, '2025-11-06', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000011', 12, 2025, 120000, 170000, 170000, 170000, '2025-12-05', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000011', 1, 2026, 120000, 120000, 120000, 120000, '2026-01-07', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000011', 2, 2026, 120000, 110000, 120000, 120000, '2026-02-06', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000011', 3, 2026, 120000, 0, 120000, 0, NULL, NULL, 'overdue');

-- KFC (lease e012)
INSERT INTO rent_transactions (lease_id, period_month, period_year, min_rent_due, percentage_rent_due, amount_due, amount_paid, payment_date, payment_method, status) VALUES
  ('e0000000-0000-0000-0000-000000000012', 10, 2025, 100000, 95000, 100000, 100000, '2025-10-07', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000012', 11, 2025, 100000, 88000, 100000, 100000, '2025-11-08', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000012', 12, 2025, 100000, 110000, 110000, 110000, '2025-12-07', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000012', 1, 2026, 100000, 95000, 100000, 100000, '2026-01-08', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000012', 2, 2026, 100000, 88000, 100000, 100000, '2026-02-07', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000012', 3, 2026, 100000, 0, 100000, 50000, '2026-03-15', 'bank_transfer', 'partial');

-- LC Waikiki (lease e004)
INSERT INTO rent_transactions (lease_id, period_month, period_year, min_rent_due, percentage_rent_due, amount_due, amount_paid, payment_date, payment_method, status) VALUES
  ('e0000000-0000-0000-0000-000000000004', 10, 2025, 150000, 140000, 150000, 150000, '2025-10-12', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000004', 11, 2025, 150000, 130000, 150000, 150000, '2025-11-10', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000004', 12, 2025, 150000, 180000, 180000, 180000, '2025-12-12', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000004', 1, 2026, 150000, 112000, 150000, 150000, '2026-01-11', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000004', 2, 2026, 150000, 101500, 150000, 150000, '2026-02-10', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000004', 3, 2026, 150000, 0, 150000, 0, NULL, NULL, 'overdue');

-- Kidzo (lease e024)
INSERT INTO rent_transactions (lease_id, period_month, period_year, min_rent_due, percentage_rent_due, amount_due, amount_paid, payment_date, payment_method, status) VALUES
  ('e0000000-0000-0000-0000-000000000024', 10, 2025, 200000, 176000, 200000, 200000, '2025-10-08', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000024', 11, 2025, 200000, 160000, 200000, 200000, '2025-11-07', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000024', 12, 2025, 200000, 240000, 240000, 240000, '2025-12-08', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000024', 1, 2026, 200000, 176000, 200000, 200000, '2026-01-09', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000024', 2, 2026, 200000, 152000, 200000, 200000, '2026-02-08', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000024', 3, 2026, 200000, 0, 200000, 0, NULL, NULL, 'overdue');

-- Costa Coffee (lease e013)
INSERT INTO rent_transactions (lease_id, period_month, period_year, min_rent_due, percentage_rent_due, amount_due, amount_paid, payment_date, payment_method, status) VALUES
  ('e0000000-0000-0000-0000-000000000013', 1, 2026, 55000, 45000, 55000, 55000, '2026-01-09', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000013', 2, 2026, 55000, 42000, 55000, 55000, '2026-02-08', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000013', 3, 2026, 55000, 0, 55000, 0, NULL, NULL, 'overdue');

-- DeFacto (lease e005)
INSERT INTO rent_transactions (lease_id, period_month, period_year, min_rent_due, percentage_rent_due, amount_due, amount_paid, payment_date, payment_method, status) VALUES
  ('e0000000-0000-0000-0000-000000000005', 1, 2026, 120000, 98000, 120000, 120000, '2026-01-08', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000005', 2, 2026, 120000, 91000, 120000, 120000, '2026-02-07', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000005', 3, 2026, 120000, 0, 120000, 0, NULL, NULL, 'overdue');

-- Bershka (lease e019)
INSERT INTO rent_transactions (lease_id, period_month, period_year, min_rent_due, percentage_rent_due, amount_due, amount_paid, payment_date, payment_method, status) VALUES
  ('e0000000-0000-0000-0000-000000000019', 1, 2026, 100000, 84000, 100000, 100000, '2026-01-16', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000019', 2, 2026, 100000, 78000, 100000, 100000, '2026-02-15', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000019', 3, 2026, 100000, 0, 100000, 0, NULL, NULL, 'overdue');

-- Pizza Hut (lease e017) — partial payment
INSERT INTO rent_transactions (lease_id, period_month, period_year, min_rent_due, percentage_rent_due, amount_due, amount_paid, payment_date, payment_method, status) VALUES
  ('e0000000-0000-0000-0000-000000000017', 1, 2026, 90000, 85000, 90000, 90000, '2026-01-05', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000017', 2, 2026, 90000, 80000, 90000, 60000, '2026-02-18', 'bank_transfer', 'partial'),
  ('e0000000-0000-0000-0000-000000000017', 3, 2026, 90000, 0, 90000, 0, NULL, NULL, 'overdue');

-- Waived example — Cinnabon (lease e016)
INSERT INTO rent_transactions (lease_id, period_month, period_year, min_rent_due, percentage_rent_due, amount_due, amount_paid, payment_date, payment_method, status) VALUES
  ('e0000000-0000-0000-0000-000000000016', 1, 2026, 20000, 18000, 20000, 20000, '2026-01-06', 'bank_transfer', 'paid'),
  ('e0000000-0000-0000-0000-000000000016', 2, 2026, 20000, 16000, 20000, 0, NULL, NULL, 'waived'),
  ('e0000000-0000-0000-0000-000000000016', 3, 2026, 20000, 0, 20000, 0, NULL, NULL, 'overdue');

-- ── Maintenance Tickets ─────────────────────────────────────

INSERT INTO maintenance_tickets (property_id, zone_id, unit_id, title, description, category, priority, status, estimated_cost_egp) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000019', 'AC not cooling in McDonald''s', 'Temperature reading 28C, should be 22C. Compressor may need servicing.', 'hvac', 'high', 'in_progress', 15000),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', NULL, 'Escalator Ground Floor stuck', 'Escalator near entrance G-101 stopped working at 2pm.', 'escalator', 'urgent', 'assigned', 45000),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000027', 'Water leak in Kidzo ceiling', 'Dripping water from ceiling near play area. Possible pipe issue above.', 'plumbing', 'high', 'open', 8000),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', NULL, 'Flickering lights corridor F2', 'Multiple fluorescent lights flickering in first floor west corridor.', 'electrical', 'normal', 'open', 3000),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000008', NULL, 'Deep cleaning main entrance', 'Monthly deep cleaning of marble floors in main entrance area.', 'cleaning', 'low', 'assigned', 5000),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000007', NULL, 'Parking barrier P2 malfunction', 'Entry barrier at parking level P2 not lifting automatically.', 'electrical', 'high', 'in_progress', 12000),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000032', 'Pharmacy signage needs repair', 'LED sign for STC Pharmacy partially burnt out.', 'electrical', 'low', 'open', 2500);

-- ── Discrepancies (flagged by revenue verification) ──────────

INSERT INTO discrepancies (unit_id, tenant_id, period_month, period_year, reported_revenue_egp, estimated_revenue_egp, variance_egp, variance_pct, confidence, status) VALUES
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 1, 2026, 850000, 1130000, 280000, 24.78, 0.82, 'flagged'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 2, 2026, 780000, 1040000, 260000, 25.00, 0.80, 'flagged'),
  ('d0000000-0000-0000-0000-000000000019', 'c0000000-0000-0000-0000-000000000004', 1, 2026, 1200000, 1710000, 510000, 29.82, 0.85, 'investigating'),
  ('d0000000-0000-0000-0000-000000000019', 'c0000000-0000-0000-0000-000000000004', 2, 2026, 1100000, 1570000, 470000, 29.94, 0.84, 'flagged'),
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000006', 1, 2026, 1600000, 2000000, 400000, 20.00, 0.75, 'flagged');
