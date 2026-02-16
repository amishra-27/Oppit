-- Harden machine_group_machines write policy to enforce cross-company isolation.
--
-- Gap: the previous group_machines_write policy only checked that the caller
-- is admin of the GROUP's company, but did NOT verify that the MACHINE belongs
-- to the same company. An admin could link their group to another company's
-- machine by knowing its UUID.
--
-- Fix: require that both group_id and machine_id resolve to the SAME company_id,
-- and that the caller is admin/owner of that company.

drop policy if exists group_machines_write on public.machine_group_machines;

create policy group_machines_write
on public.machine_group_machines
for all
to authenticated
using (
  -- For SELECT (via FOR ALL), UPDATE, DELETE:
  -- The group must belong to a company the caller administers,
  -- AND the machine must belong to that same company.
  exists (
    select 1
    from public.machine_groups g
    join public.machines m on m.company_id = g.company_id
    where g.id = machine_group_machines.group_id
      and m.id = machine_group_machines.machine_id
      and public.is_company_admin(g.company_id)
  )
)
with check (
  -- For INSERT, UPDATE (new row):
  -- Same cross-company match + admin check.
  exists (
    select 1
    from public.machine_groups g
    join public.machines m on m.company_id = g.company_id
    where g.id = machine_group_machines.group_id
      and m.id = machine_group_machines.machine_id
      and public.is_company_admin(g.company_id)
  )
);
