import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing server env vars" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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

  return NextResponse.json(
    { plant_id: plantId, freshness_seconds: freshnessSeconds, machines: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}
