import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Metric = "rpm" | "temperature" | "vibration" | "amps";
const METRICS: Metric[] = ["rpm", "temperature", "vibration", "amps"];

function isUuid(v: string) {
  // Lenient UUID check - allows any hex in variant position
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
  const metricParam = url.searchParams.get("metric");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

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

  const now = new Date();
  const from = parseIsoOrNull(fromParam) ?? new Date(now.getTime() - 15 * 60 * 1000);
  const to = parseIsoOrNull(toParam) ?? now;

  if (from > to) {
    return NextResponse.json({ error: "`from` must be <= `to`" }, { status: 400 });
  }

  let metric: Metric | null = null;

  if (metricParam) {
    if (!METRICS.includes(metricParam as Metric)) {
      return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
    }
    metric = metricParam as Metric;
  } else {
    // RLS on machines ensures user can only see machines in their companies
    const { data: machineRow, error: mErr } = await supabase
      .from("machines")
      .select("primary_metric")
      .eq("id", machineId)
      .maybeSingle();

    if (mErr) {
      return NextResponse.json(
        { error: "Machine lookup failed", details: mErr.message },
        { status: 500 }
      );
    }
    if (!machineRow) {
      return NextResponse.json({ error: "Machine not found" }, { status: 404 });
    }

    metric = machineRow.primary_metric as Metric;
  }

  // RLS on readings ensures user can only see readings for their machines
  const { data, error } = await supabase
    .from("readings")
    .select("ts_server,value")
    .eq("machine_id", machineId)
    .eq("metric", metric)
    .gte("ts_server", from.toISOString())
    .lte("ts_server", to.toISOString())
    .order("ts_server", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load history", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      machine_id: machineId,
      metric,
      from: from.toISOString(),
      to: to.toISOString(),
      points: data ?? [],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
