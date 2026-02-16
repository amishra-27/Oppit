-- RPC: get_machine_activity_metrics
--
-- Computes operational KPIs for a machine over a time window:
--   rotations_total    — RPM integrated over time (rpm × seconds / 60)
--   active_seconds     — total seconds where rpm > 0
--   idle_seconds       — total seconds where rpm = 0 within covered intervals
--   utilization_pct    — active / (active + idle) × 100
--   runtime_hours      — active_seconds / 3600
--   stop_count         — number of active → idle state transitions
--   avg_stop_duration  — idle_seconds / stop_count
--
-- Uses lead(ts_server) to build intervals between consecutive readings.
-- Each interval is clipped to [p_from, p_to] so partial-overlap readings
-- at the window edges are prorated correctly.
-- If no next reading exists, the interval extends by p_freshness_seconds.
--
-- Security invoker — RLS on readings + machines applies; user must be
-- a company_member to see any results.

create or replace function public.get_machine_activity_metrics(
  p_machine_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_freshness_seconds int default 120
)
returns table (
  rotations_total double precision,
  active_seconds double precision,
  idle_seconds double precision,
  utilization_pct double precision,
  runtime_hours double precision,
  stop_count bigint,
  avg_stop_duration_seconds double precision
)
language sql
stable
security invoker
as $$
  with
  -- Grab readings in the window plus a lookback buffer so a reading just
  -- before p_from can contribute its clipped interval into the window.
  raw as (
    select
      r.ts_server,
      r.value,
      lead(r.ts_server) over (order by r.ts_server) as next_ts
    from public.readings r
    join public.machines m on m.id = r.machine_id
    where r.machine_id = p_machine_id
      and r.metric = m.primary_metric
      and r.ts_server <= p_to
      and r.ts_server >= p_from - make_interval(secs => p_freshness_seconds)
  ),

  -- Build segments: each reading owns [ts_server, next_ts_server),
  -- clipped to [p_from, p_to]. Last reading extends by freshness.
  segments as (
    select
      value,
      greatest(ts_server, p_from) as seg_start,
      least(
        coalesce(next_ts, ts_server + make_interval(secs => p_freshness_seconds)),
        p_to
      ) as seg_end,
      (value > 0) as is_active,
      -- Previous segment's active state for transition detection
      lag(value > 0) over (order by ts_server) as prev_active
    from raw
    where ts_server < p_to
      and coalesce(next_ts, ts_server + make_interval(secs => p_freshness_seconds)) > p_from
  ),

  -- Compute per-segment duration; discard zero/negative durations
  measured as (
    select
      value,
      is_active,
      prev_active,
      greatest(extract(epoch from seg_end - seg_start), 0) as dur
    from segments
    where seg_end > seg_start
  ),

  -- Aggregate across all segments
  agg as (
    select
      -- Rotations = Σ(rpm × duration_in_seconds / 60)
      coalesce(sum(case when is_active then value * dur / 60.0 else 0 end), 0)
        as _rotations,
      coalesce(sum(case when is_active then dur else 0 end), 0)
        as _active,
      coalesce(sum(case when not is_active then dur else 0 end), 0)
        as _idle,
      -- A "stop" is a transition from active (rpm>0) to idle (rpm=0)
      coalesce(sum(case when not is_active and prev_active is true then 1 else 0 end), 0)::bigint
        as _stops
    from measured
  )

  select
    agg._rotations                                           as rotations_total,
    agg._active                                              as active_seconds,
    agg._idle                                                as idle_seconds,
    case when (agg._active + agg._idle) > 0
      then round((agg._active / (agg._active + agg._idle) * 100)::numeric, 2)::double precision
      else 0::double precision
    end                                                      as utilization_pct,
    round((agg._active / 3600.0)::numeric, 4)::double precision
                                                             as runtime_hours,
    agg._stops                                               as stop_count,
    case when agg._stops > 0
      then round((agg._idle / agg._stops)::numeric, 2)::double precision
      else 0::double precision
    end                                                      as avg_stop_duration_seconds
  from agg;
$$;
