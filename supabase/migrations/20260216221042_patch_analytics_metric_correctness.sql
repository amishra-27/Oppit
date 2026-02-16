-- Patch analytics SQL for metric correctness (Step 4 close).
--
-- Fixes:
--   A) Freshness handling: intervals capped at ts_server + freshness_seconds.
--      Stale readings no longer extend active/idle state to p_to.
--   B) Stop duration: computed from actual idle intervals between active runs.
--      Leading idle (before first active) excluded. Trailing idle excluded
--      from avg_stop_duration (its true duration is uncertain).
--   C) Non-RPM handling: only rpm readings drive activity/state metrics.
--      Non-RPM machines gracefully return zeros via empty CTE pipeline.
--      TODO: product decision for non-RPM utilization rule.

-- ============================================================
-- 1. Drop old 3-param timeline to add freshness parameter
-- ============================================================

drop function if exists public.get_machine_state_timeline(uuid, timestamptz, timestamptz);

-- ============================================================
-- 2. Recreate timeline with freshness clipping + RPM guard
-- ============================================================

create or replace function public.get_machine_state_timeline(
  p_machine_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_freshness_seconds int default 120
)
returns table (
  start_ts timestamptz,
  end_ts timestamptz,
  state text,
  duration_seconds double precision
)
language sql
stable
security invoker
as $$
  -- Non-RPM machines: metric='rpm' AND m.primary_metric='rpm' filter
  -- yields no rows, producing an empty timeline.
  -- TODO: For non-RPM, consider "data present = active" freshness rule
  -- once product defines the behaviour.

  with
  raw as (
    select
      r.ts_server,
      r.value,
      (r.value > 0) as is_active,
      lead(r.ts_server) over (order by r.ts_server) as next_ts
    from public.readings r
    join public.machines m on m.id = r.machine_id
    where r.machine_id = p_machine_id
      and r.metric = 'rpm'
      and m.primary_metric = 'rpm'
      and r.ts_server <= p_to
      and r.ts_server >= p_from - make_interval(secs => p_freshness_seconds)
  ),

  -- Freshness-clipped intervals: end = min(next_ts, ts + freshness, p_to).
  -- If data is stale (no next reading within freshness window), the segment
  -- stops at the freshness boundary — NOT at p_to.
  intervals as (
    select
      is_active,
      greatest(ts_server, p_from) as seg_start,
      least(
        coalesce(next_ts, p_to),
        ts_server + make_interval(secs => p_freshness_seconds),
        p_to
      ) as seg_end
    from raw
  ),

  -- Keep only segments that overlap [p_from, p_to] with positive duration
  positive as (
    select * from intervals
    where seg_end > seg_start
      and seg_start < p_to
      and seg_end > p_from
  ),

  -- Detect state transitions (separate CTE to avoid nested window fns)
  with_prev as (
    select
      is_active, seg_start, seg_end,
      lag(is_active) over (order by seg_start) as prev_active
    from positive
  ),

  -- Assign group id: increments on each state change
  grouped as (
    select
      is_active, seg_start, seg_end,
      sum(case when is_active is distinct from prev_active then 1 else 0 end)
        over (order by seg_start) as grp
    from with_prev
  )

  -- Merge consecutive same-state segments into contiguous intervals.
  -- Gaps from freshness clipping appear as missing intervals (unknown state).
  select
    min(seg_start)                 as start_ts,
    max(seg_end)                   as end_ts,
    case when bool_and(is_active)
      then 'active' else 'idle'
    end                            as state,
    round(extract(epoch from max(seg_end) - min(seg_start))::numeric, 2)::double precision
                                   as duration_seconds
  from grouped
  group by grp
  order by min(seg_start);
$$;

-- ============================================================
-- 3. Patch activity metrics: freshness + stop correctness + non-RPM
-- ============================================================

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
  -- Non-RPM machines: the metric='rpm' AND m.primary_metric='rpm' filter
  -- in raw yields no rows. All aggregates return 0 via COALESCE.
  -- TODO: Product decision needed — non-RPM machines could use a
  -- "data present = active" freshness rule for utilization/runtime,
  -- but rotations and stop counts have no meaning outside RPM context.
  -- For now, return zeros to avoid misleading metrics.

  with
  raw as (
    select
      r.ts_server,
      r.value,
      lead(r.ts_server) over (order by r.ts_server) as next_ts
    from public.readings r
    join public.machines m on m.id = r.machine_id
    where r.machine_id = p_machine_id
      and r.metric = 'rpm'
      and m.primary_metric = 'rpm'
      and r.ts_server <= p_to
      and r.ts_server >= p_from - make_interval(secs => p_freshness_seconds)
  ),

  -- Freshness-clipped segments: end = min(next_ts, ts + freshness, p_to).
  -- Stale readings stop contributing at the freshness boundary.
  intervals as (
    select
      value,
      (value > 0) as is_active,
      greatest(ts_server, p_from) as seg_start,
      least(
        coalesce(next_ts, p_to),
        ts_server + make_interval(secs => p_freshness_seconds),
        p_to
      ) as seg_end
    from raw
  ),

  positive as (
    select * from intervals
    where seg_end > seg_start
      and seg_start < p_to
      and seg_end > p_from
  ),

  -- ---- Per-segment measurements (for rotation integration) ----
  -- rotations = Σ(rpm × seconds / 60) across active segments
  measured as (
    select
      value, is_active,
      extract(epoch from seg_end - seg_start) as dur
    from positive
  ),

  -- ---- Stop analysis: merge → detect transitions → classify stops ----

  -- Step 1: detect state changes (separate CTE avoids nested window fns)
  with_prev as (
    select
      is_active, seg_start, seg_end,
      lag(is_active) over (order by seg_start) as prev_active
    from positive
  ),

  -- Step 2: group consecutive same-state segments
  grp_assign as (
    select
      is_active, seg_start, seg_end,
      sum(case when is_active is distinct from prev_active then 1 else 0 end)
        over (order by seg_start) as grp
    from with_prev
  ),

  -- Step 3: merge into one row per active/idle run
  merged as (
    select
      bool_and(is_active) as is_active,
      min(seg_start) as interval_start,
      max(seg_end) as interval_end,
      extract(epoch from max(seg_end) - min(seg_start)) as dur
    from grp_assign
    group by grp
  ),

  -- Step 4: classify each merged interval with lead/lag context
  merged_ctx as (
    select
      is_active, dur,
      lag(is_active) over (order by interval_start) as prev_is_active,
      lead(is_active) over (order by interval_start) as next_is_active
    from merged
  ),

  -- stop_count: all active→idle transitions (including trailing stop).
  -- Leading idle (before first active) is excluded because prev_is_active is null.
  all_stops as (
    select dur
    from merged_ctx
    where not is_active
      and prev_is_active is true
  ),

  -- For avg_stop_duration: only completed stops where machine resumed.
  -- Trailing idle is excluded — its true duration is uncertain
  -- (the stop may end moments after p_to).
  completed_stops as (
    select dur
    from merged_ctx
    where not is_active
      and prev_is_active is true
      and next_is_active is true
  ),

  -- ---- Final aggregation ----

  seg_agg as (
    select
      coalesce(sum(case when is_active then value * dur / 60.0 else 0 end), 0) as _rot,
      coalesce(sum(case when is_active then dur else 0 end), 0) as _active,
      coalesce(sum(case when not is_active then dur else 0 end), 0) as _idle
    from measured
  ),

  stop_cnt as (
    select coalesce(count(*), 0)::bigint as _cnt from all_stops
  ),

  stop_avg as (
    select coalesce(avg(dur), 0)::double precision as _avg from completed_stops
  )

  select
    sa._rot                        as rotations_total,
    sa._active                     as active_seconds,
    sa._idle                       as idle_seconds,
    case when (sa._active + sa._idle) > 0
      then round((sa._active / (sa._active + sa._idle) * 100)::numeric, 2)::double precision
      else 0::double precision
    end                            as utilization_pct,
    round((sa._active / 3600.0)::numeric, 4)::double precision
                                   as runtime_hours,
    sc._cnt                        as stop_count,
    round(sv._avg::numeric, 2)::double precision
                                   as avg_stop_duration_seconds
  from seg_agg sa
  cross join stop_cnt sc
  cross join stop_avg sv;
$$;
