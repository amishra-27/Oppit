
create or replace function public.get_my_companies()
returns table (id uuid, name text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, cm.role
  from public.companies c
  join public.company_members cm on cm.company_id = c.id
  where cm.user_id = auth.uid()
  order by c.name;
$$;
;
