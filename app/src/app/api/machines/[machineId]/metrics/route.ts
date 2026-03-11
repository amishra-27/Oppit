import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const FRESHNESS_SECONDS = 120;

type RawMachineActivityRow = {
  rotations_total: number | string | null;
  active_seconds: number | string | null;
  idle_seconds: number | string | null;
  utilization_pct: number | string | null;
  runtime_hours: number | string | null;
  stop_count: number | string | null;
  avg_stop_duration_seconds: number | string | null;
};

type MachineActivitySummary = {
  rotationsTotal: number;
  avgRpmRunning: number;
  avgRpmAll: number;
  utilization: number;
  runtimeHours: number;
  runtimeSeconds: number;
  idleSeconds: number;
  coveredSeconds: number;
  stopCount: number;
  avgStopDurationSec: number;
  avgStopDurationCompletedSec: number;
  currentStopDurationSec: number;
  currentState: "running" | "stopped" | "stale" | "no_data";
};

type RawMachineTimelineRow = {
  start_ts: string | null;
  end_ts: string | null;
  state: string | null;
  duration_seconds: number | string | null;
};

type MachineTimelineRow = {
  machineId: string;
  machineName: string;
  status: "running" | "stopped" | "stale" | "no_data";
  from: string;
  to: string;
  durationSec: number;
};

type TimelineSegment = {
  status: MachineTimelineRow["status"];
  fromMs: number;
  toMs: number;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function parseIsoOrNull(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mapTimelineStatus(state: string | null): MachineTimelineRow["status"] {
  if (state === "active") return "running";
  if (state === "idle") return "stopped";
  return "no_data";
}

function buildTimelineWithStaleCoverage(
  rawTimelineRows: RawMachineTimelineRow[],
  machineId: string,
  machineName: string,
  fromMs: number,
  toMs: number
): MachineTimelineRow[] {
  const mappedSegments: TimelineSegment[] = rawTimelineRows
    .map((row) => {
      const startMs = row.start_ts ? Date.parse(row.start_ts) : Number.NaN;
      const endMs = row.end_ts ? Date.parse(row.end_ts) : Number.NaN;
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

      const clampedStart = Math.max(startMs, fromMs);
      const clampedEnd = Math.min(endMs, toMs);
      if (clampedEnd <= clampedStart) return null;

      return {
        status: mapTimelineStatus(row.state),
        fromMs: clampedStart,
        toMs: clampedEnd,
      } as TimelineSegment;
    })
    .filter((seg): seg is TimelineSegment => seg !== null)
    .sort((a, b) => a.fromMs - b.fromMs || a.toMs - b.toMs);

  const withStale: TimelineSegment[] = [];
  let cursor = fromMs;

  for (const seg of mappedSegments) {
    if (seg.fromMs > cursor) {
      withStale.push({ status: "stale", fromMs: cursor, toMs: seg.fromMs });
    }

    const segStart = Math.max(seg.fromMs, cursor);
    if (seg.toMs > segStart) {
      withStale.push({ status: seg.status, fromMs: segStart, toMs: seg.toMs });
      cursor = Math.max(cursor, seg.toMs);
    }
  }

  if (cursor < toMs) {
    withStale.push({ status: "stale", fromMs: cursor, toMs });
  }

  const merged: TimelineSegment[] = [];
  for (const seg of withStale) {
    if (seg.toMs <= seg.fromMs) continue;
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push(seg);
      continue;
    }

    if (last.status === seg.status && last.toMs >= seg.fromMs) {
      last.toMs = Math.max(last.toMs, seg.toMs);
    } else {
      merged.push(seg);
    }
  }

  return merged.map((seg) => ({
    machineId,
    machineName,
    status: seg.status,
    from: new Date(seg.fromMs).toISOString(),
    to: new Date(seg.toMs).toISOString(),
    durationSec: Math.max(0, (seg.toMs - seg.fromMs) / 1000),
  }));
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ machineId: string }> }
) {
  const { machineId } = await params;

  if (!isUuid(machineId)) {
    return NextResponse.json({ error: "Invalid machineId" }, { status: 400 });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  // Session-bound client — RLS enforces tenancy
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const now = new Date();
  const from = parseIsoOrNull(fromParam) ?? new Date(now.getTime() - 60 * 60 * 1000); // default 1h
  const to = parseIsoOrNull(toParam) ?? now;

  if (from > to) {
    return NextResponse.json({ error: "`from` must be <= `to`" }, { status: 400 });
  }

  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const fromMs = from.getTime();
  const toMs = to.getTime();

  // Call both RPCs in parallel — RLS on readings/machines enforces access
  const [machineResult, activityResult, timelineResult] = await Promise.all([
    supabase.from("machines").select("name").eq("id", machineId).maybeSingle(),
    supabase.rpc("get_machine_activity_metrics", {
      p_machine_id: machineId,
      p_from: fromIso,
      p_to: toIso,
    }),
    supabase.rpc("get_machine_state_timeline", {
      p_machine_id: machineId,
      p_from: fromIso,
      p_to: toIso,
    }),
  ]);

  if (activityResult.error) {
    return NextResponse.json(
      { error: "Failed to load activity metrics", details: activityResult.error.message },
      { status: 500 }
    );
  }

  if (timelineResult.error) {
    return NextResponse.json(
      { error: "Failed to load state timeline", details: timelineResult.error.message },
      { status: 500 }
    );
  }

  const machineName = machineResult.data?.name ?? "Machine";

  // activity returns a single-row table; extract the first row or null
  const rawActivity: RawMachineActivityRow | null = Array.isArray(activityResult.data)
    ? ((activityResult.data[0] ?? null) as RawMachineActivityRow | null)
    : ((activityResult.data ?? null) as RawMachineActivityRow | null);

  const rawTimelineRows: RawMachineTimelineRow[] = Array.isArray(timelineResult.data)
    ? (timelineResult.data as RawMachineTimelineRow[])
    : [];

  const timeline = buildTimelineWithStaleCoverage(
    rawTimelineRows,
    machineId,
    machineName,
    fromMs,
    toMs
  );

  const currentState: MachineActivitySummary["currentState"] =
    timeline.length > 0 ? timeline[timeline.length - 1].status : "no_data";
  const currentStopDurationSec =
    currentState === "stopped" && timeline.length > 0
      ? timeline[timeline.length - 1].durationSec
      : 0;

  const summary: MachineActivitySummary | null = rawActivity
    ? (() => {
        const rotationsTotal = Number(rawActivity.rotations_total) || 0;
        const activeSeconds = Number(rawActivity.active_seconds) || 0;
        const idleSeconds = Number(rawActivity.idle_seconds) || 0;
        const coveredSeconds = activeSeconds + idleSeconds;
        const avgStopDurationCompletedSec =
          Number(rawActivity.avg_stop_duration_seconds) || 0;

        return {
          rotationsTotal,
          avgRpmRunning: activeSeconds > 0 ? (rotationsTotal * 60) / activeSeconds : 0,
          avgRpmAll: coveredSeconds > 0 ? (rotationsTotal * 60) / coveredSeconds : 0,
          utilization: (Number(rawActivity.utilization_pct) || 0) / 100,
          runtimeHours: Number(rawActivity.runtime_hours) || 0,
          runtimeSeconds: activeSeconds,
          idleSeconds,
          coveredSeconds,
          stopCount: Number(rawActivity.stop_count) || 0,
          avgStopDurationSec: avgStopDurationCompletedSec,
          avgStopDurationCompletedSec,
          currentStopDurationSec,
          currentState,
        };
      })()
    : null;

  return NextResponse.json(
    {
      machine_id: machineId,
      from: fromIso,
      to: toIso,
      freshnessSeconds: FRESHNESS_SECONDS,
      summary,
      timeline,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
