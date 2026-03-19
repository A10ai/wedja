-- ============================================================
-- Custis Learning Engine Tables
--
-- Stores AI feedback, learned parameters, discovered patterns,
-- and daily learning cycle logs. This is how Custis gets
-- smarter every day.
-- ============================================================

-- Stores every human feedback/override on AI decisions
CREATE TABLE ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  decision_id UUID REFERENCES ai_decisions(id),
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('approve', 'modify', 'reject', 'correct')),
  original_value JSONB,
  corrected_value JSONB,
  reason TEXT,
  staff_id UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores learned parameters that evolve over time
CREATE TABLE ai_learned_params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  param_type TEXT NOT NULL, -- 'conversion_rate', 'avg_ticket', 'footfall_pattern', 'energy_baseline', 'maintenance_cycle'
  entity_id UUID, -- tenant_id, zone_id, unit_id depending on type
  entity_name TEXT,
  param_key TEXT NOT NULL, -- e.g., 'conversion_rate', 'peak_hour', 'failure_interval_days'
  initial_value NUMERIC,
  learned_value NUMERIC,
  confidence NUMERIC DEFAULT 0,
  sample_count INT DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(property_id, param_type, entity_id, param_key)
);

-- Stores discovered patterns
CREATE TABLE ai_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  pattern_type TEXT NOT NULL, -- 'seasonal', 'weekly', 'tenant_behavior', 'energy_waste', 'maintenance_cycle', 'footfall_trend'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence NUMERIC DEFAULT 0,
  impact_estimate TEXT,
  data_points INT DEFAULT 0,
  first_detected TIMESTAMPTZ DEFAULT NOW(),
  last_confirmed TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'confirmed', 'dismissed', 'outdated'))
);

-- Daily learning cycle log
CREATE TABLE ai_learning_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  cycle_date DATE NOT NULL,
  params_updated INT DEFAULT 0,
  patterns_found INT DEFAULT 0,
  patterns_confirmed INT DEFAULT 0,
  confidence_improvements JSONB DEFAULT '[]',
  summary TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_decision ON ai_feedback(decision_id);
CREATE INDEX idx_feedback_property ON ai_feedback(property_id, created_at DESC);
CREATE INDEX idx_learned_params_entity ON ai_learned_params(property_id, param_type, entity_id);
CREATE INDEX idx_patterns_type ON ai_patterns(property_id, pattern_type, status);
CREATE INDEX idx_learning_cycles_date ON ai_learning_cycles(property_id, cycle_date DESC);
