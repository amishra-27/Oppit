-- RPC: create_plant_for_company
-- Creates a plant under a company. Caller must be admin/owner.
-- Security invoker — RLS applies naturally.

create or replace function public.create_plant_for_company(
  p_company_id uuid,
  p_name text
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_plant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if trim(p_name) = '' then
    raise exception 'Plant name cannot be empty';
  end if;

  if not public.is_company_admin(p_company_id) then
    raise exception 'Permission denied: you must be an owner or admin of this company';
  end if;

  insert into public.plants (company_id, name)
  values (p_company_id, trim(p_name))
  returning id into v_plant_id;

  return v_plant_id;
end;
$$;
