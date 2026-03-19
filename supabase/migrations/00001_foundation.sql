-- ============================================================
-- Custis Foundation Schema — Phase 1
-- All tables for property, tenants, leases, revenue verification,
-- operations, AI, and system management.
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Core Property ──────────────────────────────────────────

CREATE TABLE properties (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  address     TEXT,
  city        TEXT,
  country     TEXT DEFAULT 'Egypt',
  total_area_sqm  NUMERIC(12,2),
  floors      INTEGER,
  year_established INTEGER,
  operating_hours TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  timezone    TEXT DEFAULT 'Africa/Cairo',
  currency    TEXT DEFAULT 'EGP',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE zones (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  floor       INTEGER,
  area_sqm    NUMERIC(10,2),
  type        TEXT NOT NULL CHECK (type IN ('retail', 'food', 'entertainment', 'service', 'parking', 'common')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_zones_property ON zones(property_id);

CREATE TABLE units (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id     UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  unit_number TEXT NOT NULL,
  floor       INTEGER,
  area_sqm    NUMERIC(10,2),
  status      TEXT NOT NULL DEFAULT 'vacant' CHECK (status IN ('occupied', 'vacant', 'maintenance')),
  frontage_m  NUMERIC(6,2),
  coordinates_json JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_units_property ON units(property_id);
CREATE INDEX idx_units_zone ON units(zone_id);
CREATE INDEX idx_units_status ON units(status);

-- ── Tenants & Leases ──────────────────────────────────────

CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  brand_name  TEXT,
  category    TEXT NOT NULL CHECK (category IN ('fashion', 'food', 'electronics', 'services', 'entertainment', 'grocery')),
  brand_type  TEXT CHECK (brand_type IN ('international', 'local', 'franchise')),
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  tax_id      TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_category ON tenants(category);

CREATE TABLE leases (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id     UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  min_rent_monthly_egp NUMERIC(12,2) NOT NULL,
  percentage_rate NUMERIC(5,2),
  security_deposit_egp NUMERIC(12,2),
  escalation_rate NUMERIC(5,2),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'terminated', 'pending')),
  terms_json  JSONB,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leases_tenant ON leases(tenant_id);
CREATE INDEX idx_leases_unit ON leases(unit_id);
CREATE INDEX idx_leases_property ON leases(property_id);
CREATE INDEX idx_leases_status ON leases(status);
CREATE INDEX idx_leases_dates ON leases(start_date, end_date);

CREATE TABLE rent_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lease_id    UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL,
  min_rent_due NUMERIC(12,2),
  percentage_rent_due NUMERIC(12,2),
  amount_due  NUMERIC(12,2) NOT NULL,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  payment_date DATE,
  payment_method TEXT,
  status      TEXT NOT NULL DEFAULT 'overdue' CHECK (status IN ('paid', 'partial', 'overdue', 'waived')),
  source      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rent_transactions_lease ON rent_transactions(lease_id);
CREATE INDEX idx_rent_transactions_period ON rent_transactions(period_year, period_month);
CREATE INDEX idx_rent_transactions_status ON rent_transactions(status);

-- ── Revenue Verification ──────────────────────────────────

CREATE TABLE tenant_sales_reported (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lease_id    UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL,
  reported_revenue_egp NUMERIC(14,2) NOT NULL,
  submission_date DATE,
  verified    BOOLEAN DEFAULT FALSE,
  verification_notes TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sales_reported_tenant ON tenant_sales_reported(tenant_id);
CREATE INDEX idx_sales_reported_period ON tenant_sales_reported(period_year, period_month);

CREATE TABLE footfall_readings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id     UUID REFERENCES zones(id) ON DELETE SET NULL,
  unit_id     UUID REFERENCES units(id) ON DELETE SET NULL,
  camera_id   UUID,
  timestamp   TIMESTAMPTZ NOT NULL,
  count_in    INTEGER NOT NULL DEFAULT 0,
  count_out   INTEGER NOT NULL DEFAULT 0,
  dwell_seconds INTEGER,
  confidence  NUMERIC(5,4)
);

CREATE INDEX idx_footfall_readings_zone ON footfall_readings(zone_id);
CREATE INDEX idx_footfall_readings_unit ON footfall_readings(unit_id);
CREATE INDEX idx_footfall_readings_timestamp ON footfall_readings(timestamp);

CREATE TABLE revenue_estimates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id     UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL,
  estimated_revenue_egp NUMERIC(14,2) NOT NULL,
  confidence_score NUMERIC(5,4),
  methodology TEXT,
  model_version TEXT,
  factors_json JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_revenue_estimates_tenant ON revenue_estimates(tenant_id);
CREATE INDEX idx_revenue_estimates_period ON revenue_estimates(period_year, period_month);

CREATE TABLE discrepancies (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id     UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL,
  reported_revenue_egp NUMERIC(14,2),
  estimated_revenue_egp NUMERIC(14,2),
  variance_egp NUMERIC(14,2),
  variance_pct NUMERIC(7,2),
  confidence  NUMERIC(5,4),
  status      TEXT NOT NULL DEFAULT 'flagged' CHECK (status IN ('flagged', 'investigating', 'resolved', 'dismissed')),
  resolution_notes TEXT,
  flagged_at  TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_discrepancies_tenant ON discrepancies(tenant_id);
CREATE INDEX idx_discrepancies_status ON discrepancies(status);
CREATE INDEX idx_discrepancies_period ON discrepancies(period_year, period_month);

-- ── Operations ────────────────────────────────────────────

CREATE TABLE maintenance_tickets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  zone_id     UUID REFERENCES zones(id) ON DELETE SET NULL,
  unit_id     UUID REFERENCES units(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL CHECK (category IN ('hvac', 'electrical', 'plumbing', 'elevator', 'escalator', 'cleaning', 'structural', 'other')),
  priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent', 'emergency')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'on_hold', 'completed', 'cancelled')),
  reported_by UUID,
  assigned_to UUID,
  estimated_cost_egp NUMERIC(12,2),
  actual_cost_egp NUMERIC(12,2),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_maintenance_property ON maintenance_tickets(property_id);
CREATE INDEX idx_maintenance_status ON maintenance_tickets(status);
CREATE INDEX idx_maintenance_priority ON maintenance_tickets(priority);

CREATE TABLE energy_readings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id     UUID REFERENCES zones(id) ON DELETE SET NULL,
  timestamp   TIMESTAMPTZ NOT NULL,
  consumption_kwh NUMERIC(10,2),
  cost_egp    NUMERIC(10,2),
  source      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_energy_zone ON energy_readings(zone_id);
CREATE INDEX idx_energy_timestamp ON energy_readings(timestamp);

CREATE TABLE camera_feeds (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  location_description TEXT,
  zone_id     UUID REFERENCES zones(id) ON DELETE SET NULL,
  rtsp_url    TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'offline', 'maintenance')),
  resolution  TEXT,
  angle_type  TEXT CHECK (angle_type IN ('entrance', 'overhead', 'corridor')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cameras_property ON camera_feeds(property_id);

-- ── AI & Analytics ────────────────────────────────────────

CREATE TABLE ai_decisions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  category    TEXT,
  context_json JSONB,
  recommendation TEXT,
  reasoning   TEXT,
  confidence  NUMERIC(5,4),
  human_action TEXT DEFAULT 'pending' CHECK (human_action IN ('pending', 'approved', 'modified', 'rejected')),
  human_feedback TEXT,
  executed    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_decisions_property ON ai_decisions(property_id);
CREATE INDEX idx_ai_decisions_type ON ai_decisions(type);

CREATE TABLE ai_insights (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'opportunity', 'warning', 'critical')),
  title       TEXT NOT NULL,
  message     TEXT,
  impact_estimate TEXT,
  confidence  NUMERIC(5,4),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'actioned')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_insights_property ON ai_insights(property_id);
CREATE INDEX idx_ai_insights_severity ON ai_insights(severity);

CREATE TABLE footfall_daily (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  zone_id     UUID REFERENCES zones(id) ON DELETE SET NULL,
  unit_id     UUID REFERENCES units(id) ON DELETE SET NULL,
  date        DATE NOT NULL,
  total_in    INTEGER DEFAULT 0,
  total_out   INTEGER DEFAULT 0,
  peak_hour   INTEGER,
  peak_count  INTEGER,
  avg_dwell_seconds INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_footfall_daily_property ON footfall_daily(property_id);
CREATE INDEX idx_footfall_daily_date ON footfall_daily(date);
CREATE INDEX idx_footfall_daily_zone ON footfall_daily(zone_id);

-- ── System ────────────────────────────────────────────────

CREATE TABLE staff (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID UNIQUE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'security', 'maintenance', 'viewer')),
  department  TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_staff_property ON staff(property_id);
CREATE INDEX idx_staff_auth_user ON staff(auth_user_id);

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID,
  action      TEXT NOT NULL,
  table_name  TEXT,
  record_id   UUID,
  old_data_json JSONB,
  new_data_json JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_table ON audit_log(table_name);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id    UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  message     TEXT,
  type        TEXT,
  category    TEXT,
  link        TEXT,
  read        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_staff ON notifications(staff_id);
CREATE INDEX idx_notifications_read ON notifications(read);

-- ── RLS Policies (permissive for Phase 1) ─────────────────

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_sales_reported ENABLE ROW LEVEL SECURITY;
ALTER TABLE footfall_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE discrepancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE camera_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE footfall_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Permissive policies — authenticated users can read/write everything
-- Will be tightened with proper RBAC in later phases
CREATE POLICY "Allow all for authenticated" ON properties FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON zones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON units FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON tenants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON leases FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON rent_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON tenant_sales_reported FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON footfall_readings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON revenue_estimates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON discrepancies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON maintenance_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON energy_readings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON camera_feeds FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON ai_decisions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON ai_insights FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON footfall_daily FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON staff FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON audit_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER trg_properties_updated BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_zones_updated BEFORE UPDATE ON zones FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_units_updated BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_leases_updated BEFORE UPDATE ON leases FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rent_transactions_updated BEFORE UPDATE ON rent_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_staff_updated BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_camera_feeds_updated BEFORE UPDATE ON camera_feeds FOR EACH ROW EXECUTE FUNCTION update_updated_at();
