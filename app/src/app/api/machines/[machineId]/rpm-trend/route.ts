import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RawMachineActivityRow = {
  rotations_total: number | string | null;
  active_seconds: number | string | null;
  idle_seconds: number | string | null;
  runtime_hours: number | string | null;
};

type WindowMetrics = {
  avg_rpm_running: number;
  avg_rpm_all: number;
  rotations_total: number;
  runtime_hours: number;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function parseIsoOrNull(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parsePositiveNumberOrNull(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function toWindowMetrics(raw: RawMachineActivityRow | null): WindowMetrics {
  const rotationsTotal = Number(raw?.rotations_total) || 0;
  const runtimeHours = Number(raw?.runtime_hours) || 0;
  const activeSeconds = Number(raw?.active_seconds) || 0;
  const idleSeconds = Number(raw?.idle_seconds) || 0;
  const coveredSeconds = activeSeconds + idleSeconds;

  return {
    avg_rpm_running: activeSeconds > 0 ? (rotationsTotal * 60) / activeSeconds : 0,
    avg_rpm_all: coveredSeconds > 0 ? (rotationsTotal * 60) / coveredSeconds : 0,
    rotations_total: rotationsTotal,
    runtime_hours: runtimeHours,
  };
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
  const shortMinutesParam = url.searchParams.get("short_minutes");
  const longDaysParam = url.searchParams.get("long_days");
  const toParam = url.searchParams.get("to");

  const shortMinutes =
    shortMinutesParam === null ? 60 : parsePositiveNumberOrNull(shortMinutesParam);
  if (shortMinutes === null) {
    return NextResponse.json(
      { error: "Invalid short_minutes (must be a positive number)" },
      { status: 400 }
    );
  }

  const longDays = longDaysParam === null ? 7 : parsePositiveNumberOrNull(longDaysParam);
  if (longDays === null) {
    return NextResponse.json(
      { error: "Invalid long_days (must be a positive number)" },
      { status: 400 }
    );
  }

  const parsedTo = toParam === null ? new Date() : parseIsoOrNull(toParam);
  if (!parsedTo) {
    return NextResponse.json({ error: "Invalid to timestamp" }, { status: 400 });
  }

  // Session-bound client — RLS enforces tenancy.
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

  const toIso = parsedTo.toISOString();
  const shortFromIso = new Date(parsedTo.getTime() - shortMinutes * 60 * 1000).toISOString();
  const longFromIso = new Date(parsedTo.getTime() - longDays * 24 * 60 * 60 * 1000).toISOString();

  const [shortResult, longResult] = await Promise.all([
    supabase.rpc("get_machine_activity_metrics", {
      p_machine_id: machineId,
      p_from: shortFromIso,
      p_to: toIso,
    }),
    supabase.rpc("get_machine_activity_metrics", {
      p_machine_id: machineId,
      p_from: longFromIso,
      p_to: toIso,
    }),
  ]);

  if (shortResult.error) {
    return NextResponse.json(
      { error: "Failed to load short-window activity metrics", details: shortResult.error.message },
      { status: 500 }
    );
  }

  if (longResult.error) {
    return NextResponse.json(
      { error: "Failed to load long-window activity metrics", details: longResult.error.message },
      { status: 500 }
    );
  }

  const shortRaw: RawMachineActivityRow | null = Array.isArray(shortResult.data)
    ? ((shortResult.data[0] ?? null) as RawMachineActivityRow | null)
    : ((shortResult.data ?? null) as RawMachineActivityRow | null);

  const longRaw: RawMachineActivityRow | null = Array.isArray(longResult.data)
    ? ((longResult.data[0] ?? null) as RawMachineActivityRow | null)
    : ((longResult.data ?? null) as RawMachineActivityRow | null);

  const shortWindow = toWindowMetrics(shortRaw);
  const longWindow = toWindowMetrics(longRaw);

  const deltaPctRunning =
    longWindow.avg_rpm_running > 0
      ? ((shortWindow.avg_rpm_running - longWindow.avg_rpm_running) /
          longWindow.avg_rpm_running) *
        100
      : null;

  const trend: "up" | "flat" | "down" | "insufficient_data" =
    deltaPctRunning === null || !Number.isFinite(deltaPctRunning)
      ? "insufficient_data"
      : deltaPctRunning > 5
        ? "up"
        : deltaPctRunning < -5
          ? "down"
          : "flat";

  return NextResponse.json(
    {
      machine_id: machineId,
      to: toIso,
      short_window: shortWindow,
      long_window: longWindow,
      delta_pct_running: deltaPctRunning,
      trend,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
