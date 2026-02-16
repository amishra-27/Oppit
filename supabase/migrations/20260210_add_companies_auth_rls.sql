create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
alter table public.plants
  add column if not exists company_id uuid references public.companies(id) on delete cascade;
create index if not exists plants_company_id_idx
  on public.plants(company_id);
alter table public.machines
  add column if not exists company_id uuid references public.companies(id) on delete cascade;
create index if not exists machines_company_id_idx
  on public.machines(company_id);
create or replace function public.set_machine_company_id()
returns trigger
language plpgsql
as $$
begin
  select p.company_id into new.company_id
  from public.plants p
  where p.id = new.plant_id;

  if new.company_id is null then
    raise exception 'plant % has no company_id', new.plant_id;
  end if;

  return new;
end;
$$;
drop trigger if exists trg_set_machine_company_id on public.machines;
create trigger trg_set_machine_company_id
before insert or update of plant_id
on public.machines
for each row
execute function public.set_machine_company_id();
create table if not exists public.machine_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(company_id, name)
);
create table if not exists public.machine_group_machines (
  group_id uuid not null references public.machine_groups(id) on delete cascade,
  machine_id uuid not null references public.machines(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, machine_id)
);
create index if not exists machine_groups_company_id_idx
  on public.machine_groups(company_id);
create index if not exists machine_group_machines_machine_id_idx
  on public.machine_group_machines(machine_id);
create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
  );
$$;
create or replace function public.is_company_admin(p_company_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner','admin')
  );
$$;
alter table public.plants enable row level security;
drop policy if exists plants_select on public.plants;
create policy plants_select
on public.plants
for select
to authenticated
using (public.is_company_member(company_id));
drop policy if exists plants_write on public.plants;
create policy plants_write
on public.plants
for insert
to authenticated
with check (public.is_company_admin(company_id));
drop policy if exists plants_update on public.plants;
create policy plants_update
on public.plants
for update
to authenticated
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));
drop policy if exists plants_delete on public.plants;
create policy plants_delete
on public.plants
for delete
to authenticated
using (public.is_company_admin(company_id));
alter table public.machines enable row level security;
drop policy if exists machines_select on public.machines;
create policy machines_select
on public.machines
for select
to authenticated
using (public.is_company_member(company_id));
drop policy if exists machines_write on public.machines;
create policy machines_write
on public.machines
for insert
to authenticated
with check (public.is_company_admin(company_id));
drop policy if exists machines_update on public.machines;
create policy machines_update
on public.machines
for update
to authenticated
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));
drop policy if exists machines_delete on public.machines;
create policy machines_delete
on public.machines
for delete
to authenticated
using (public.is_company_admin(company_id));
alter table public.readings enable row level security;
drop policy if exists readings_select on public.readings;
create policy readings_select
on public.readings
for select
to authenticated
using (
  exists (
    select 1
    from public.machines m
    where m.id = readings.machine_id
      and public.is_company_member(m.company_id)
  )
);
drop policy if exists readings_insert on public.readings;
create policy readings_insert
on public.readings
for insert
to authenticated
with check (false);
alter table public.machine_groups enable row level security;
alter table public.machine_group_machines enable row level security;
drop policy if exists groups_select on public.machine_groups;
create policy groups_select
on public.machine_groups
for select
to authenticated
using (public.is_company_member(company_id));
drop policy if exists groups_write on public.machine_groups;
create policy groups_write
on public.machine_groups
for all
to authenticated
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));
drop policy if exists group_machines_select on public.machine_group_machines;
create policy group_machines_select
on public.machine_group_machines
for select
to authenticated
using (
  exists (
    select 1
    from public.machine_groups g
    where g.id = machine_group_machines.group_id
      and public.is_company_member(g.company_id)
  )
);
drop policy if exists group_machines_write on public.machine_group_machines;
create policy group_machines_write
on public.machine_group_machines
for all
to authenticated
using (
  exists (
    select 1
    from public.machine_groups g
    where g.id = machine_group_machines.group_id
      and public.is_company_admin(g.company_id)
  )
)
with check (
  exists (
    select 1
    from public.machine_groups g
    where g.id = machine_group_machines.group_id
      and public.is_company_admin(g.company_id)
  )
);
alter table public.machine_api_keys enable row level security;
drop policy if exists machine_keys_none on public.machine_api_keys;
create policy machine_keys_none
on public.machine_api_keys
for select
to authenticated
using (false);
