create or replace function public.get_machine_cards(p_plant_id uuid)
returns table (
  machine_id uuid,
  name text,
  line text,
  primary_metric text,
  last_update timestamptz,
  latest_value double precision
)
language sql
stable
as $$
  select
    m.id as machine_id,
    m.name,
    m.line,
    m.primary_metric,
    r.ts_server as last_update,
    r.value as latest_value
  from public.machines m
  left join lateral (
    select rr.ts_server, rr.value
    from public.readings rr
    where rr.machine_id = m.id
      and rr.metric = m.primary_metric
    order by rr.ts_server desc
    limit 1
  ) r on true
  where m.plant_id = p_plant_id
  order by m.name;
$$;
