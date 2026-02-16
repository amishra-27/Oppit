-- Realtime readings smoke test
-- Run in Supabase SQL Editor to confirm realtime prerequisites are met.
-- All queries are read-only SELECTs — nothing is modified.

-- 1. Check that public.readings is in the supabase_realtime publication
SELECT
  'publication' AS check,
  CASE WHEN count(*) > 0 THEN '✅ readings in supabase_realtime' ELSE '❌ readings NOT in supabase_realtime' END AS result
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename = 'readings';

-- 2. Check that RLS is enabled on public.readings
SELECT
  'rls_enabled' AS check,
  CASE WHEN rowsecurity THEN '✅ RLS enabled on readings' ELSE '❌ RLS NOT enabled on readings' END AS result
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'readings';

-- 3. Check that the readings_select policy exists
SELECT
  'readings_select_policy' AS check,
  CASE WHEN count(*) > 0 THEN '✅ readings_select policy exists' ELSE '❌ readings_select policy MISSING' END AS result
FROM pg_policies
WHERE tablename = 'readings'
  AND policyname = 'readings_select'
  AND cmd = 'SELECT';
