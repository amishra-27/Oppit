alter table public.readings add column if not exists revs_in_window bigint;
alter table public.readings add column if not exists window_ms integer;
alter table public.readings add column if not exists revs_total bigint;
alter table public.readings add column if not exists ingest_seq bigint;
alter table public.readings add column if not exists ingest_boot_id text;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'readings'
      and indexdef ~* '\(machine_id,\s*ts_server\s+desc(?:,|\))'
  ) then
    create index if not exists readings_machine_ts_server_desc_idx
      on public.readings (machine_id, ts_server desc);
  end if;
end
$$;
