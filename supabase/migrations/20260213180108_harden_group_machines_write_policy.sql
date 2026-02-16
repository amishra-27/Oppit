drop policy if exists group_machines_write on public.machine_group_machines;

create policy group_machines_write
on public.machine_group_machines
for all
to authenticated
using (
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
  exists (
    select 1
    from public.machine_groups g
    join public.machines m on m.company_id = g.company_id
    where g.id = machine_group_machines.group_id
      and m.id = machine_group_machines.machine_id
      and public.is_company_admin(g.company_id)
  )
);
