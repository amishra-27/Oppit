-- ============================================================
-- Enable RLS on companies and company_members
-- ============================================================

alter table public.companies enable row level security;
alter table public.company_members enable row level security;

-- ============================================================
-- company_members policies
-- ============================================================

-- SELECT: authenticated users can see their own membership rows.
-- Uses auth.uid() directly to avoid recursion with is_company_member().
drop policy if exists company_members_select on public.company_members;
create policy company_members_select
on public.company_members
for select
to authenticated
using (user_id = auth.uid());

-- INSERT: owner/admin of the company can add members
drop policy if exists company_members_insert on public.company_members;
create policy company_members_insert
on public.company_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = company_members.company_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'admin')
  )
);

-- UPDATE: owner/admin can update member roles
drop policy if exists company_members_update on public.company_members;
create policy company_members_update
on public.company_members
for update
to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = company_members.company_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'admin')
  )
);

-- DELETE: owner/admin can remove members
drop policy if exists company_members_delete on public.company_members;
create policy company_members_delete
on public.company_members
for delete
to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = company_members.company_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'admin')
  )
);

-- ============================================================
-- companies policies
-- ============================================================

-- SELECT: authenticated can see companies where they are a member
drop policy if exists companies_select on public.companies;
create policy companies_select
on public.companies
for select
to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = companies.id
      and cm.user_id = auth.uid()
  )
);

-- INSERT: blocked for direct insert — use create_company() RPC instead.
-- This prevents orphan companies without an owner.
drop policy if exists companies_insert on public.companies;
create policy companies_insert
on public.companies
for insert
to authenticated
with check (false);

-- UPDATE: only owner/admin
drop policy if exists companies_update on public.companies;
create policy companies_update
on public.companies
for update
to authenticated
using (public.is_company_admin(id))
with check (public.is_company_admin(id));

-- DELETE: only owner
drop policy if exists companies_delete on public.companies;
create policy companies_delete
on public.companies
for delete
to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = companies.id
      and cm.user_id = auth.uid()
      and cm.role = 'owner'
  )
);

-- ============================================================
-- RPC: get_my_companies
-- Returns companies the current user belongs to, with their role.
-- Column named "id" to match existing CompanySwitcher component.
-- ============================================================

create or replace function public.get_my_companies()
returns table (
  id uuid,
  name text,
  role text
)
language sql
stable
security invoker
as $$
  select
    c.id,
    c.name,
    cm.role
  from public.companies c
  join public.company_members cm
    on cm.company_id = c.id
  where cm.user_id = auth.uid()
  order by c.name;
$$;

-- ============================================================
-- RPC: create_company
-- Creates a company and adds the caller as owner in one step.
-- Uses SECURITY DEFINER to bypass the companies INSERT policy.
-- ============================================================

create or replace function public.create_company(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if trim(p_name) = '' then
    raise exception 'Company name cannot be empty';
  end if;

  insert into public.companies (name)
  values (trim(p_name))
  returning id into v_company_id;

  insert into public.company_members (company_id, user_id, role)
  values (v_company_id, v_user_id, 'owner');

  return v_company_id;
end;
$$;;
