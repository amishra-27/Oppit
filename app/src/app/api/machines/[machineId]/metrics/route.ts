import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  stopCount: number;
  avgStopDurationSec: number;
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
  status: "running" | "stopped" | "no_data";
  from: string;
  to: string;
  durationSec: number;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function parseIsoOrNull(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
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

  const summary: MachineActivitySummary | null = rawActivity
    ? (() => {
        const rotationsTotal = Number(rawActivity.rotations_total) || 0;
        const activeSeconds = Number(rawActivity.active_seconds) || 0;
        const idleSeconds = Number(rawActivity.idle_seconds) || 0;
        const coveredSeconds = activeSeconds + idleSeconds;

        return {
          rotationsTotal,
          avgRpmRunning: activeSeconds > 0 ? (rotationsTotal * 60) / activeSeconds : 0,
          avgRpmAll: coveredSeconds > 0 ? (rotationsTotal * 60) / coveredSeconds : 0,
          utilization: (Number(rawActivity.utilization_pct) || 0) / 100,
          runtimeHours: Number(rawActivity.runtime_hours) || 0,
          stopCount: Number(rawActivity.stop_count) || 0,
          avgStopDurationSec: Number(rawActivity.avg_stop_duration_seconds) || 0,
        };
      })()
    : null;

  const rawTimelineRows: RawMachineTimelineRow[] = Array.isArray(timelineResult.data)
    ? (timelineResult.data as RawMachineTimelineRow[])
    : [];

  const timeline: MachineTimelineRow[] = rawTimelineRows.map((row) => {
    const status: MachineTimelineRow["status"] =
      row.state === "active" ? "running" : row.state === "idle" ? "stopped" : "no_data";

    return {
      machineId,
      machineName,
      status,
      from: row.start_ts ?? fromIso,
      to: row.end_ts ?? toIso,
      durationSec: Number(row.duration_seconds) || 0,
    };
  });

  return NextResponse.json(
    {
      machine_id: machineId,
      from: fromIso,
      to: toIso,
      summary,
      timeline,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
