import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Metric = "rpm" | "temperature" | "vibration" | "amps";
const METRICS: Metric[] = ["rpm", "temperature", "vibration", "amps"];

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function parseIsoOrNull(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request, { params }: { params: { machineId: string } }) {
  const { machineId } = params;

  if (!isUuid(machineId)) {
    return NextResponse.json({ error: "Invalid machineId" }, { status: 400 });
  }

  const url = new URL(req.url);
  const metricParam = url.searchParams.get("metric");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing server env vars" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
    const { data: machineRow, error: mErr } = await supabase
      .from("machines")
      .select("primary_metric")
      .eq("id", machineId)
      .maybeSingle();

    if (mErr) {
      return NextResponse.json({ error: "Machine lookup failed", details: mErr.message }, { status: 500 });
    }
    if (!machineRow) {
      return NextResponse.json({ error: "Machine not found" }, { status: 404 });
    }

    metric = machineRow.primary_metric as Metric;
  }

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

  return NextResponse.json({
    machine_id: machineId,
    metric,
    from: from.toISOString(),
    to: to.toISOString(),
    points: data ?? [],
  });
}
