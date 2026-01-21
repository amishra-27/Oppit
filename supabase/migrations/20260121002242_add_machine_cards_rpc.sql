create or replace function public.get_machine_cards(
  p_plant_id uuid,
  p_freshness_seconds int default 120
)
returns table (
  machine_id uuid,
  machine_name text,
  primary_metric text,
  last_ts timestamptz,
  last_value double precision,
  is_fresh boolean,
  is_running boolean
)
language sql
stable
as $$
  select
    m.id as machine_id,
    m.name as machine_name,
    m.primary_metric,
    r.ts_server as last_ts,
    r.value as last_value,
    (r.ts_server is not null and r.ts_server >= now() - (p_freshness_seconds || ' seconds')::interval) as is_fresh,
    case
      when m.primary_metric = 'rpm'
        then (r.value is not null and r.value > 0)
             and (r.ts_server >= now() - (p_freshness_seconds || ' seconds')::interval)
      else
        (r.ts_server is not null and r.ts_server >= now() - (p_freshness_seconds || ' seconds')::interval)
    end as is_running
  from public.machines m
  left join lateral (
    select ts_server, value
    from public.readings
    where machine_id = m.id
      and metric = m.primary_metric
    order by ts_server desc
    limit 1
  ) r on true
  where m.plant_id = p_plant_id;
$$;
