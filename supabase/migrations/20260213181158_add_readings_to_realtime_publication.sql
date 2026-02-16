-- Add public.readings to the supabase_realtime publication.
-- Required for browser-side Realtime subscriptions to INSERT events on readings.
-- Idempotent: skips if already published.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'readings'
  ) then
    alter publication supabase_realtime add table public.readings;
  end if;
end $$;
