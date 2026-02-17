import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(v: string) {
  // Lenient UUID check - allows any hex in variant position
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function getFreshnessSeconds() {
  const raw = process.env.FRESHNESS_SECONDS ?? "120";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 120;
  return Math.min(Math.floor(n), 60 * 60);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ plantId: string }> }
) {
  const { plantId } = await params;

  if (!isUuid(plantId)) {
    return NextResponse.json({ error: "Invalid plantId" }, { status: 400 });
  }

  // Use session-bound client — RLS enforces tenancy
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

  const freshnessSeconds = getFreshnessSeconds();

  const { data, error } = await supabase.rpc("get_machine_cards", {
    p_plant_id: plantId,
    p_freshness_seconds: freshnessSeconds,
  });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load cards", details: error.message },
      { status: 500 }
    );
  }

  const machines = (data ?? []) as Array<{
    machine_id: string;
    machine_name: string;
    primary_metric: string;
    last_ts: string | null;
    last_value: number | null;
    is_fresh: boolean;
    is_running: boolean;
  }>;

  if (machines.length === 0) {
    return NextResponse.json(
      { plant_id: plantId, freshness_seconds: freshnessSeconds, machines: [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const machineIds = machines.map((m) => m.machine_id);

  // Fetch line from machines table and group assignment in parallel.
  // RLS on machines and machine_group_machines enforces tenancy.
  const [linesResult, groupsResult] = await Promise.all([
    supabase
      .from("machines")
      .select("id, line")
      .in("id", machineIds),
    supabase
      .from("machine_group_machines")
      .select("machine_id, machine_groups(id, name)")
      .in("machine_id", machineIds)
      .order("created_at", { ascending: true }),
  ]);

  // Build lookup: machine_id → line
  const lineMap = new Map<string, string | null>();
  if (linesResult.data) {
    for (const row of linesResult.data) {
      lineMap.set(row.id, row.line);
    }
  }

  // Build lookup: machine_id → first group (deterministic by created_at asc)
  const groupMap = new Map<string, { group_id: string; group_name: string }>();
  if (groupsResult.data) {
    for (const row of groupsResult.data) {
      // Only keep the first group per machine (earliest created_at)
      if (groupMap.has(row.machine_id)) continue;

      const group = row.machine_groups as unknown as {
        id: string;
        name: string;
      } | null;

      if (group) {
        groupMap.set(row.machine_id, {
          group_id: group.id,
          group_name: group.name,
        });
      }
    }
  }

  // Merge metadata into each card
  const enriched = machines.map((m) => {
    const grp = groupMap.get(m.machine_id);
    return {
      ...m,
      line: lineMap.get(m.machine_id) ?? null,
      group_id: grp?.group_id ?? null,
      group_name: grp?.group_name ?? null,
    };
  });

  return NextResponse.json(
    { plant_id: plantId, freshness_seconds: freshnessSeconds, machines: enriched },
    { headers: { "Cache-Control": "no-store" } }
  );
}
