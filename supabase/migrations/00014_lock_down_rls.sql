-- ============================================================================
-- 00014 — Lock down row-level security
--
-- Before this migration:
--   * 22 tables created in 00005–00013 had RLS disabled, so anyone holding
--     the public anon key could read and write them through PostgREST.
--   * Every table from 00001/00003 had "Allow all for authenticated"
--     (FOR ALL ... USING (true)), so any signed-in user — including
--     deactivated staff or self-registered accounts — could write anything,
--     including staff and audit_log.
--
-- After:
--   * RLS is enabled on every table in the public schema.
--   * The browser (anon key + user session) may only READ, and only when the
--     user is an active staff member. The browser only needs this for its
--     own staff row and for realtime change notifications.
--   * All writes go through Next.js API routes using the service role,
--     which bypasses RLS and enforces roles in code (src/lib/api-auth.ts).
--   * anon and authenticated lose INSERT/UPDATE/DELETE grants entirely.
--
-- Safe to re-run.
-- ============================================================================

-- True when the current JWT belongs to an active staff member.
-- SECURITY DEFINER so it can read staff regardless of staff's own policies.
CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.status = 'active'
      AND (
        s.auth_user_id = auth.uid()
        OR lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_staff() TO authenticated;

DO $$
DECLARE
  t   text;
  pol record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Drop the old permissive policies (and our own, so this is re-runnable)
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname IN ('Allow all for authenticated', 'Active staff can read')
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY "Active staff can read" ON public.%I FOR SELECT TO authenticated USING (public.is_active_staff())',
      t
    );

    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- A staff member may always read their own row (needed to show who is
-- logged in, even for an account that is not yet active).
DROP POLICY IF EXISTS "Staff can read own row" ON public.staff;
CREATE POLICY "Staff can read own row" ON public.staff
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Tables created by later migrations must enable RLS themselves.
-- tests/migrations/rls.test.ts fails CI if a new table is left without it.
