import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Call both RPCs in parallel — RLS on readings/machines enforces access
  const [activityResult, timelineResult] = await Promise.all([
    supabase.rpc("get_machine_activity_metrics", {
      p_machine_id: machineId,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    }),
    supabase.rpc("get_machine_state_timeline", {
      p_machine_id: machineId,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
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

  // activity returns a single-row table; extract the first row or null
  const activity = Array.isArray(activityResult.data)
    ? activityResult.data[0] ?? null
    : activityResult.data;

  return NextResponse.json(
    {
      machine_id: machineId,
      from: from.toISOString(),
      to: to.toISOString(),
      activity,
      timeline: timelineResult.data ?? [],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
