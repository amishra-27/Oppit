create table if not exists public.machine_ingest_cursor (
  machine_id uuid primary key references public.machines(id) on delete cascade,
  boot_id text not null,
  last_seq bigint not null default 0,
  last_revs_total bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.machine_ingest_cursor enable row level security;

drop policy if exists machine_ingest_cursor_no_client_access on public.machine_ingest_cursor;
create policy machine_ingest_cursor_no_client_access
on public.machine_ingest_cursor
for all
to authenticated
using (false)
with check (false);
