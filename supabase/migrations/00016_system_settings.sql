-- ============================================================================
-- 00016 — system_settings
--
-- Durable, per-property key/value configuration for the AI layer. On Vercel
-- every serverless instance has its own memory, so state that used to live in
-- module variables (AI Brain mode/enabled/interval, scheduler on/off,
-- automation enabled flags and last_run) is stored here instead.
--
-- Keys in use (value is JSONB):
--   brain_config            { mode, enabled, interval_minutes }
--   brain_stats             { last_cycle, total_cycles, total_decisions, total_executed }
--   scheduler               { enabled, interval_minutes, last_run, total_cycles }
--   automation:<id>         { enabled, last_run, actions_taken }
--   lock:<job>              { holder, acquired_at, expires_at }   -- cron job locks
--
-- Access: RLS on. Active staff may READ through the browser; all writes go
-- through API routes / cron using the service role, which bypasses RLS.
-- Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_settings (
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  UUID,
  PRIMARY KEY (property_id, key)
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active staff can read" ON system_settings;
CREATE POLICY "Active staff can read" ON system_settings
  FOR SELECT TO authenticated
  USING (public.is_active_staff());

-- Writes only via the service role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON system_settings FROM anon, authenticated;
REVOKE ALL ON system_settings FROM anon;

-- Automation run log reads system_events by type, newest first.
CREATE INDEX IF NOT EXISTS idx_events_type_created ON system_events(type, created_at DESC);
