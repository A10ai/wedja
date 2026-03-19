-- ============================================================
-- Custis Finance Module — Expenses & Budgets
-- ============================================================

-- ── Expenses Table ──────────────────────────────────────────

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  category TEXT NOT NULL CHECK (category IN ('utilities', 'maintenance', 'security', 'cleaning', 'marketing', 'insurance', 'salaries', 'admin', 'technology', 'other')),
  description TEXT NOT NULL,
  amount_egp NUMERIC(12,2) NOT NULL,
  vendor TEXT,
  invoice_reference TEXT,
  is_recurring BOOLEAN DEFAULT false,
  recurring_frequency TEXT CHECK (recurring_frequency IN ('monthly', 'quarterly', 'annually')),
  expense_date DATE NOT NULL,
  approved_by UUID REFERENCES staff(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  category TEXT NOT NULL,
  period_month INT,
  period_year INT,
  budgeted_amount_egp NUMERIC(12,2) NOT NULL,
  actual_amount_egp NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expenses_property ON expenses(property_id, expense_date DESC);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_budgets_period ON budgets(property_id, period_year, period_month);

-- RLS
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON budgets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Seed Finance Data — 6 months of realistic expenses
-- ============================================================

DO $$
DECLARE
  v_property_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_month INT;
  v_year INT;
  v_date DATE;
  v_base_date DATE;
  v_amount NUMERIC;
  v_vendors TEXT[];
  v_desc TEXT;
  v_i INT;
BEGIN

  -- Generate expenses for last 6 months
  FOR v_i IN 0..5 LOOP
    v_base_date := (CURRENT_DATE - (v_i * INTERVAL '1 month'))::DATE;
    v_month := EXTRACT(MONTH FROM v_base_date);
    v_year := EXTRACT(YEAR FROM v_base_date);

    -- ── Utilities (3 entries per month: electricity, water, gas) ──
    -- Electricity: 100,000-170,000
    v_amount := 100000 + floor(random() * 70000);
    INSERT INTO expenses (property_id, category, description, amount_egp, vendor, invoice_reference, is_recurring, recurring_frequency, expense_date, status)
    VALUES (v_property_id, 'utilities', 'Monthly electricity bill', v_amount, 'Egyptian Electricity Holding Co.', 'EEHC-' || v_year || '-' || LPAD(v_month::TEXT, 2, '0'), true, 'monthly', make_date(v_year, v_month, 5), CASE WHEN v_i > 0 THEN 'paid' ELSE 'approved' END);

    -- Water: 30,000-50,000
    v_amount := 30000 + floor(random() * 20000);
    INSERT INTO expenses (property_id, category, description, amount_egp, vendor, invoice_reference, is_recurring, recurring_frequency, expense_date, status)
    VALUES (v_property_id, 'utilities', 'Monthly water bill', v_amount, 'Hurghada Water & Wastewater Co.', 'HWW-' || v_year || '-' || LPAD(v_month::TEXT, 2, '0'), true, 'monthly', make_date(v_year, v_month, 7), CASE WHEN v_i > 0 THEN 'paid' ELSE 'approved' END);

    -- Gas: 20,000-30,000
    v_amount := 20000 + floor(random() * 10000);
    INSERT INTO expenses (property_id, category, description, amount_egp, vendor, invoice_reference, is_recurring, recurring_frequency, expense_date, status)
    VALUES (v_property_id, 'utilities', 'Monthly gas supply - food court', v_amount, 'EGAS', 'EGAS-' || v_year || '-' || LPAD(v_month::TEXT, 2, '0'), true, 'monthly', make_date(v_year, v_month, 8), CASE WHEN v_i > 0 THEN 'paid' ELSE 'approved' END);

    -- ── Salaries: 300,000/month ──
    v_amount := 295000 + floor(random() * 10000);
    INSERT INTO expenses (property_id, category, description, amount_egp, vendor, invoice_reference, is_recurring, recurring_frequency, expense_date, status)
    VALUES (v_property_id, 'salaries', 'Monthly staff salaries', v_amount, 'Senzo Mall HR', 'SAL-' || v_year || '-' || LPAD(v_month::TEXT, 2, '0'), true, 'monthly', make_date(v_year, v_month, 25), CASE WHEN v_i > 0 THEN 'paid' ELSE 'approved' END);

    -- ── Security: 80,000/month ──
    v_amount := 75000 + floor(random() * 10000);
    INSERT INTO expenses (property_id, category, description, amount_egp, vendor, invoice_reference, is_recurring, recurring_frequency, expense_date, status)
    VALUES (v_property_id, 'security', 'Monthly security services', v_amount, 'Falcon Security Services', 'FSS-' || v_year || '-' || LPAD(v_month::TEXT, 2, '0'), true, 'monthly', make_date(v_year, v_month, 1), CASE WHEN v_i > 0 THEN 'paid' ELSE 'pending' END);

    -- ── Cleaning: 60,000/month ──
    v_amount := 55000 + floor(random() * 10000);
    INSERT INTO expenses (property_id, category, description, amount_egp, vendor, invoice_reference, is_recurring, recurring_frequency, expense_date, status)
    VALUES (v_property_id, 'cleaning', 'Monthly cleaning & janitorial', v_amount, 'Crystal Clean Egypt', 'CCE-' || v_year || '-' || LPAD(v_month::TEXT, 2, '0'), true, 'monthly', make_date(v_year, v_month, 1), CASE WHEN v_i > 0 THEN 'paid' ELSE 'pending' END);

    -- ── Maintenance: 40,000-80,000/month (variable) ──
    -- HVAC maintenance
    v_amount := 15000 + floor(random() * 15000);
    INSERT INTO expenses (property_id, category, description, amount_egp, vendor, invoice_reference, is_recurring, recurring_frequency, expense_date, status)
    VALUES (v_property_id, 'maintenance', 'HVAC system maintenance & filters', v_amount, 'CoolTech HVAC', 'CT-' || v_year || '-' || LPAD(v_month::TEXT, 2, '0'), true, 'monthly', make_date(v_year, v_month, 10), CASE WHEN v_i > 0 THEN 'paid' ELSE 'approved' END);

    -- Elevator maintenance
    v_amount := 12000 + floor(random() * 8000);
    INSERT INTO expenses (property_id, category, description, amount_egp, vendor, invoice_reference, is_recurring, recurring_frequency, expense_date, status)
    VALUES (v_property_id, 'maintenance', 'Elevator & escalator service', v_amount, 'KONE Egypt', 'KONE-' || v_year || '-' || LPAD(v_month::TEXT, 2, '0'), true, 'monthly', make_date(v_year, v_month, 15), CASE WHEN v_i > 0 THEN 'paid' ELSE 'approved' END);

    -- General repairs (variable)
    v_amount := 10000 + floor(random() * 30000);
    INSERT INTO expenses (property_id, category, description, amount_egp, vendor, invoice_reference, expense_date, status)
    VALUES (v_property_id, 'maintenance', 'General repairs & material', v_amount, 'Various contractors', 'REP-' || v_year || '-' || LPAD(v_month::TEXT, 2, '0'), make_date(v_year, v_month, 20), CASE WHEN v_i > 0 THEN 'paid' ELSE 'pending' END);

    -- ── Marketing: 30,000/month ──
    v_amount := 25000 + floor(random() * 10000);
    INSERT INTO expenses (property_id, category, description, amount_egp, vendor, invoice_reference, is_recurring, recurring_frequency, expense_date, status)
    VALUES (v_property_id, 'marketing', 'Digital marketing & social media', v_amount, 'Red Sea Digital Agency', 'RSDA-' || v_year || '-' || LPAD(v_month::TEXT, 2, '0'), true, 'monthly', make_date(v_year, v_month, 3), CASE WHEN v_i > 0 THEN 'paid' ELSE 'approved' END);

    -- ── Insurance: 50,000/quarter ──
    IF v_month IN (1, 4, 7, 10) THEN
      INSERT INTO expenses (property_id, category, description, amount_egp, vendor, invoice_reference, is_recurring, recurring_frequency, expense_date, status)
      VALUES (v_property_id, 'insurance', 'Quarterly property & liability insurance', 50000, 'Misr Insurance', 'MI-Q' || CEIL(v_month / 3.0)::INT || '-' || v_year, true, 'quarterly', make_date(v_year, v_month, 1), CASE WHEN v_i > 0 THEN 'paid' ELSE 'approved' END);
    END IF;

    -- ── Technology: 20,000/month ──
    v_amount := 18000 + floor(random() * 5000);
    INSERT INTO expenses (property_id, category, description, amount_egp, vendor, invoice_reference, is_recurring, recurring_frequency, expense_date, status)
    VALUES (v_property_id, 'technology', 'IT systems, CCTV, network', v_amount, 'NileTech Solutions', 'NTS-' || v_year || '-' || LPAD(v_month::TEXT, 2, '0'), true, 'monthly', make_date(v_year, v_month, 12), CASE WHEN v_i > 0 THEN 'paid' ELSE 'approved' END);

    -- ── Admin: 15,000/month ──
    v_amount := 12000 + floor(random() * 6000);
    INSERT INTO expenses (property_id, category, description, amount_egp, vendor, invoice_reference, is_recurring, recurring_frequency, expense_date, status)
    VALUES (v_property_id, 'admin', 'Office supplies, printing, courier', v_amount, 'Various', 'ADM-' || v_year || '-' || LPAD(v_month::TEXT, 2, '0'), true, 'monthly', make_date(v_year, v_month, 18), CASE WHEN v_i > 0 THEN 'paid' ELSE 'pending' END);

  END LOOP;

  -- ── Seed Budgets for current year ──
  INSERT INTO budgets (property_id, category, period_month, period_year, budgeted_amount_egp, actual_amount_egp)
  SELECT
    v_property_id,
    cat.name,
    m.month_num,
    EXTRACT(YEAR FROM CURRENT_DATE)::INT,
    cat.budget,
    CASE
      WHEN m.month_num < EXTRACT(MONTH FROM CURRENT_DATE)::INT THEN cat.budget * (0.85 + random() * 0.30)
      WHEN m.month_num = EXTRACT(MONTH FROM CURRENT_DATE)::INT THEN cat.budget * (0.4 + random() * 0.3)
      ELSE 0
    END
  FROM
    (VALUES
      ('utilities', 200000), ('salaries', 300000), ('security', 80000),
      ('cleaning', 60000), ('maintenance', 60000), ('marketing', 30000),
      ('insurance', 17000), ('technology', 20000), ('admin', 15000),
      ('other', 10000)
    ) AS cat(name, budget),
    generate_series(1, 12) AS m(month_num);

END $$;
