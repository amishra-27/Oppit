-- RPC: get_machine_state_timeline
--
-- Returns contiguous active/idle intervals for a machine over [p_from, p_to].
-- Each reading "owns" the time until the next reading arrives. Adjacent
-- readings with the same state (active/idle) are merged into a single row.
-- Edge intervals are clipped to the requested window.
--
-- Security invoker — RLS on readings + machines applies.

create or replace function public.get_machine_state_timeline(
  p_machine_id uuid,
  p_from timestamptz,
  p_to timestamptz
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
  with
  -- Fetch readings within the window. Include a lookback buffer so
  -- a reading just before p_from can have its interval clipped in.
  raw as (
    select
      r.ts_server,
      r.value,
      (r.value > 0) as is_active,
      lead(r.ts_server) over (order by r.ts_server) as next_ts
    from public.readings r
    join public.machines m on m.id = r.machine_id
    where r.machine_id = p_machine_id
      and r.metric = m.primary_metric
      and r.ts_server <= p_to
      and r.ts_server >= p_from - interval '10 minutes'
  ),

  -- Build per-reading segments clipped to [p_from, p_to].
  -- If no next reading, the segment ends at p_to (assume state holds).
  clipped as (
    select
      is_active,
      greatest(ts_server, p_from) as seg_start,
      least(coalesce(next_ts, p_to), p_to) as seg_end
    from raw
    where ts_server < p_to
      and coalesce(next_ts, p_to) > p_from
  ),

  -- Filter out zero-duration segments
  positive as (
    select *
    from clipped
    where seg_end > seg_start
  ),

  -- Detect state changes: compute whether the previous segment had a
  -- different state. This must be a separate CTE to avoid nesting
  -- window functions (lag cannot be inside sum(...) over(...)).
  with_prev as (
    select
      is_active,
      seg_start,
      seg_end,
      lag(is_active) over (order by seg_start) as prev_active
    from positive
  ),

  -- Assign a group id: increment whenever state changes from the
  -- previous segment so consecutive same-state segments share a group.
  grouped as (
    select
      is_active,
      seg_start,
      seg_end,
      sum(case when is_active is distinct from prev_active then 1 else 0 end)
        over (order by seg_start) as grp
    from with_prev
  )

  -- Merge contiguous same-state segments
  select
    min(seg_start)                                             as start_ts,
    max(seg_end)                                               as end_ts,
    case when bool_and(is_active) then 'active' else 'idle' end as state,
    round(extract(epoch from max(seg_end) - min(seg_start))::numeric, 2)::double precision
                                                               as duration_seconds
  from grouped
  group by grp
  order by min(seg_start);
$$;
