-- ============================================================================
-- 00017 — Evidence on every discrepancy
--
-- A flag must carry the numbers behind it (CLAUDE.md: "every AI output has
-- confidence + reasoning"). These columns let the dashboard show the money
-- actually at stake (rent, not sales) and why the tenant was flagged.
--
-- Apply BEFORE deploying the code that writes them.
-- ============================================================================

ALTER TABLE public.discrepancies
  ADD COLUMN IF NOT EXISTS estimated_low_egp  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS rent_at_risk_egp   NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS footfall_coverage  NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS model_version      TEXT,
  ADD COLUMN IF NOT EXISTS reasoning          TEXT;

COMMENT ON COLUMN public.discrepancies.estimated_low_egp IS
  'Conservative (low-bound) sales estimate the report was compared against';
COMMENT ON COLUMN public.discrepancies.rent_at_risk_egp IS
  'Extra rent owed if true sales were at least estimated_low_egp: max(min_rent, low*rate) - max(min_rent, reported*rate)';
COMMENT ON COLUMN public.discrepancies.footfall_coverage IS
  'Share of days in the period with store footfall data (0-1)';

CREATE INDEX IF NOT EXISTS idx_discrepancies_period
  ON public.discrepancies (period_year, period_month, status);
