-- ============================================================================
-- 00018 — Make the audit log and system notifications actually work
--
-- audit_log (00001) has user_id/action/table_name/record_id/old_data_json/
-- new_data_json, but src/lib/audit.ts has always written user_email, category,
-- resource_type, resource_id, description, old_data, new_data and metadata,
-- and "system" into the UUID user_id. PostgREST rejected every insert and the
-- error was ignored, so the audit trail is empty. Add the columns the code
-- writes; the original columns stay for anything that used them.
--
-- notifications.staff_id is NOT NULL, but every system notification (rent
-- overdue, underreporting, lease expiry, ...) is a broadcast with no staff
-- member, so none was ever stored. staff_id NULL now means "every active
-- staff member"; per-person read state for broadcasts lives in
-- notification_reads so one person's "mark all read" does not clear the
-- bell for everyone else.
--
-- Safe to re-run.
-- ============================================================================

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS user_email    TEXT,
  ADD COLUMN IF NOT EXISTS category      TEXT,
  ADD COLUMN IF NOT EXISTS resource_type TEXT,
  ADD COLUMN IF NOT EXISTS resource_id   TEXT,
  ADD COLUMN IF NOT EXISTS description   TEXT,
  ADD COLUMN IF NOT EXISTS old_data      JSONB,
  ADD COLUMN IF NOT EXISTS new_data      JSONB,
  ADD COLUMN IF NOT EXISTS metadata      JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_audit_log_category ON public.audit_log(category);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON public.audit_log(resource_type, resource_id);

ALTER TABLE public.notifications ALTER COLUMN staff_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.notification_reads (
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (notification_id, staff_id)
);

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active staff can read" ON public.notification_reads;
CREATE POLICY "Active staff can read" ON public.notification_reads
  FOR SELECT TO authenticated USING (public.is_active_staff());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.notification_reads FROM anon, authenticated;
