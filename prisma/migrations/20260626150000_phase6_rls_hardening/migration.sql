-- Phase 6 — Row-Level Security hardening
-- =====================================================================
-- Replaces the Phase-1 placeholder ("RLS enabled, deny-all, no policies") with
-- explicit, intentional, documented policies.
--
-- Trust model: this application has NO Supabase Auth end users. ALL data access
-- is server-side through Prisma, which connects with the Supabase `postgres`
-- role. That role has BYPASSRLS, so the policies below never affect the app.
-- The threat we are closing is the Supabase Data API (PostgREST), which runs as
-- the `anon` and `authenticated` roles. Those roles must be able to read/write
-- NOTHING. We therefore (1) force RLS on every app table, (2) add an explicit
-- deny-by-default posture (no permissive policy exists for anon/authenticated),
-- and (3) revoke all table/sequence privileges from those roles, including for
-- any tables created in the future.
--
-- This migration is idempotent and safe to run via `prisma migrate deploy` or
-- the Supabase SQL editor.

-- 1) Enable + FORCE RLS on every application table. FORCE makes the policies
--    apply even to the table owner; the BYPASSRLS `postgres` role used by the
--    app is unaffected, so runtime is unchanged.
DO $$
DECLARE
  t text;
  app_tables text[] := ARRAY[
    'Property', 'ListPackage', 'ConsentRecord', 'Suppression',
    'Conversation', 'Message', 'AgentDraft', 'SkipTraceJob',
    'AgentConfig', 'ComplianceConfig', '_ListToProperties'
  ];
BEGIN
  FOREACH t IN ARRAY app_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);
    END IF;
  END LOOP;
END
$$;

-- 2) Explicit deny-by-default for the PostgREST roles. With RLS enabled and no
--    permissive policy granting them access, anon/authenticated already see
--    nothing; this named RESTRICTIVE policy makes the intent self-documenting
--    in the catalog and guards against an accidental future permissive policy.
DO $$
DECLARE
  t text;
  app_tables text[] := ARRAY[
    'Property', 'ListPackage', 'ConsentRecord', 'Suppression',
    'Conversation', 'Message', 'AgentDraft', 'SkipTraceJob',
    'AgentConfig', 'ComplianceConfig', '_ListToProperties'
  ];
BEGIN
  FOREACH t IN ARRAY app_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS deny_data_api ON public.%I;', t);
      EXECUTE format(
        'CREATE POLICY deny_data_api ON public.%I AS RESTRICTIVE '
        || 'FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);',
        t
      );
    END IF;
  END LOOP;
END
$$;

-- 3) Revoke all current privileges on app tables/sequences from the Data API
--    roles. Defense in depth: even if a table's RLS were ever disabled, the
--    roles still hold no table privileges.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 4) Revoke privileges on any FUTURE objects created in `public` by the
--    migration role, so a later `prisma migrate deploy` cannot silently expose
--    a new table through the Data API.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Verification (run manually after applying):
--   SELECT tablename, rowsecurity, forcerowsecurity
--     FROM pg_tables WHERE schemaname = 'public';
--   -- expect rowsecurity = true and forcerowsecurity = true for every app table.
--   SELECT grantee, table_name, privilege_type
--     FROM information_schema.role_table_grants
--     WHERE table_schema = 'public' AND grantee IN ('anon','authenticated');
--   -- expect ZERO rows.
