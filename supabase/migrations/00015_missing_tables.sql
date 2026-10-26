-- ============================================================================
-- 00015 — Tables the application uses but no earlier migration created
--
--   brain_decisions      src/lib/ai-brain.ts (insert/update/select of brain
--                        cycle decisions; dashboard /dashboard/ai/brain)
--   marketing_campaigns  src/lib/ai-brain.ts (status counts),
--                        src/lib/automations-engine.ts (target_zones lookup)
--   social_metrics       src/lib/ai-brain.ts (latest followers/engagement)
--
-- Columns follow exactly what the code reads and writes, plus property_id and
-- timestamps. Safe to re-run (IF NOT EXISTS everywhere).
--
-- Access: RLS on; the browser may only read. All writes go through API routes
-- using the service role, which bypasses RLS.
-- ============================================================================

-- ── brain_decisions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain_decisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID REFERENCES properties(id) ON DELETE CASCADE, -- nullable for rows written before it was set
  cycle_id        TEXT NOT NULL,                 -- "brain-<epoch>-<rand>"
  category        TEXT NOT NULL,                 -- BrainCategory (revenue, leasing, operations, ...)
  action          TEXT NOT NULL,
  reasoning       TEXT,
  confidence      NUMERIC NOT NULL DEFAULT 0,    -- 0-100 scale (unchecked: LLM output)
  impact_estimate TEXT,
  auto_executable BOOLEAN NOT NULL DEFAULT false,
  executed        BOOLEAN NOT NULL DEFAULT false,
  approved        BOOLEAN,                       -- NULL = pending human review
  mode            TEXT NOT NULL DEFAULT 'supervised' CHECK (mode IN ('supervised', 'autonomous')),
  event_type      TEXT,
  event_payload   JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_snapshot   JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary         TEXT,
  source          TEXT,                          -- e.g. 'claude' | 'rules'
  model           TEXT,                          -- LLM model id when source = 'claude'
  fallback_reason TEXT,                          -- why rules were used instead of the model
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If production already has brain_decisions (created by hand before this
-- migration existed), the statement above leaves it as it is, so add the
-- columns the current code writes explicitly, before indexing them.
ALTER TABLE brain_decisions
  ADD COLUMN IF NOT EXISTS property_id     UUID REFERENCES properties(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source          TEXT,
  ADD COLUMN IF NOT EXISTS model           TEXT,
  ADD COLUMN IF NOT EXISTS fallback_reason TEXT;


CREATE INDEX IF NOT EXISTS idx_brain_decisions_created ON brain_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brain_decisions_cycle ON brain_decisions(cycle_id, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_brain_decisions_property ON brain_decisions(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brain_decisions_pending ON brain_decisions(created_at DESC) WHERE approved IS NULL;

-- ── marketing_campaigns ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID REFERENCES properties(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'planned'
               CHECK (status IN ('draft', 'planned', 'active', 'paused', 'completed', 'cancelled')),
  start_date   DATE,
  end_date     DATE,
  target_zones UUID[],                           -- zones.id values the campaign targets
  budget_egp   NUMERIC(12,2),
  spend_egp    NUMERIC(12,2) DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON marketing_campaigns(property_id, status, start_date);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_zones ON marketing_campaigns USING GIN (target_zones);

-- ── social_metrics ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID REFERENCES properties(id) ON DELETE CASCADE,
  platform        TEXT,                          -- instagram, facebook, tiktok, ...
  account_id      UUID,                          -- social_accounts.id when known
  followers       INTEGER NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(6,3) NOT NULL DEFAULT 0, -- percent
  recorded_at     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_metrics_created ON social_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_metrics_property ON social_metrics(property_id, platform, recorded_at DESC);

-- ── Row-level security: read-only for signed-in users ───────────────────────
ALTER TABLE brain_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active staff can read" ON brain_decisions;
CREATE POLICY "Active staff can read" ON brain_decisions FOR SELECT TO authenticated USING (public.is_active_staff());
DROP POLICY IF EXISTS "Active staff can read" ON marketing_campaigns;
CREATE POLICY "Active staff can read" ON marketing_campaigns FOR SELECT TO authenticated USING (public.is_active_staff());
DROP POLICY IF EXISTS "Active staff can read" ON social_metrics;
CREATE POLICY "Active staff can read" ON social_metrics FOR SELECT TO authenticated USING (public.is_active_staff());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON brain_decisions, marketing_campaigns, social_metrics FROM anon, authenticated;
