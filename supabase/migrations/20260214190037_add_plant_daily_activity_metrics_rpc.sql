-- RPC: get_plant_daily_activity_metrics
--
-- Returns per-machine activity KPIs for all machines in a plant for a given day.
-- Internally calls get_machine_activity_metrics for each machine, reusing
-- the RPM integration and state-transition logic already defined there.
--
-- The day window is [day_start, day_end) in the caller's timezone (p_tz),
-- converted to timestamptz for the underlying queries.
--
-- Security invoker — RLS on machines filters to the caller's companies.

create or replace function public.get_plant_daily_activity_metrics(
  p_plant_id uuid,
  p_day date,
  p_tz text default 'UTC',
  p_freshness_seconds int default 120
)
returns table (
  machine_id uuid,
  machine_name text,
  line text,
  rotations_total double precision,
  utilization_pct double precision,
  runtime_hours double precision,
  stop_count bigint,
  avg_stop_duration_seconds double precision
)
language sql
stable
security invoker
as $$
  select
    m.id                   as machine_id,
    m.name                 as machine_name,
    m.line,
    a.rotations_total,
    a.utilization_pct,
    a.runtime_hours,
    a.stop_count,
    a.avg_stop_duration_seconds
  from public.machines m
  cross join lateral public.get_machine_activity_metrics(
    m.id,
    -- Day start in the requested timezone, cast to timestamptz
    (p_day::timestamp at time zone p_tz),
    -- Day end (start of next day) in the requested timezone
    ((p_day + 1)::timestamp at time zone p_tz),
    p_freshness_seconds
  ) a
  where m.plant_id = p_plant_id
  order by m.name;
$$;
