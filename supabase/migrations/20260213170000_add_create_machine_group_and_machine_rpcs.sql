-- RPC: create_machine_group
-- Creates a machine group for a company.
-- Security invoker — RLS applies, but explicit admin check gives clear error.

create or replace function public.create_machine_group(
  p_company_id uuid,
  p_name text
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_company_admin(p_company_id) then
    raise exception 'Permission denied: you must be an owner or admin of this company';
  end if;

  if trim(p_name) = '' then
    raise exception 'Group name cannot be empty';
  end if;

  insert into public.machine_groups (company_id, name)
  values (p_company_id, trim(p_name))
  returning id into v_group_id;

  return v_group_id;
end;
$$;


-- RPC: create_machine_with_group
-- Creates a machine under a plant and optionally adds it to a machine group.
-- The trg_set_machine_company_id trigger auto-sets machines.company_id from the plant.
-- Security invoker — RLS applies, but explicit checks give clear errors.

create or replace function public.create_machine_with_group(
  p_plant_id uuid,
  p_name text,
  p_line text,
  p_primary_metric text,
  p_group_id uuid default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_company_id uuid;
  v_group_company_id uuid;
  v_machine_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if trim(p_name) = '' then
    raise exception 'Machine name cannot be empty';
  end if;

  if p_primary_metric not in ('rpm', 'temperature', 'vibration', 'amps') then
    raise exception 'Invalid primary_metric: %. Must be one of: rpm, temperature, vibration, amps', p_primary_metric;
  end if;

  -- Resolve company from plant
  select company_id into v_company_id
  from public.plants
  where id = p_plant_id;

  if v_company_id is null then
    raise exception 'Plant not found or has no company assigned';
  end if;

  if not public.is_company_admin(v_company_id) then
    raise exception 'Permission denied: you must be an owner or admin of this plant''s company';
  end if;

  -- Validate group belongs to the same company (if provided)
  if p_group_id is not null then
    select company_id into v_group_company_id
    from public.machine_groups
    where id = p_group_id;

    if v_group_company_id is null then
      raise exception 'Machine group not found';
    end if;

    if v_group_company_id <> v_company_id then
      raise exception 'Machine group does not belong to the same company as the plant';
    end if;
  end if;

  -- Insert machine (trigger sets company_id from plant)
  insert into public.machines (plant_id, name, line, primary_metric)
  values (p_plant_id, trim(p_name), nullif(trim(p_line), ''), p_primary_metric)
  returning id into v_machine_id;

  -- Link to group if specified
  if p_group_id is not null then
    insert into public.machine_group_machines (group_id, machine_id)
    values (p_group_id, v_machine_id);
  end if;

  return v_machine_id;
end;
$$;
