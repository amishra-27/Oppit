import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Accept YYYY-MM-DD; return the string if valid, else null. */
function parseDateOrNull(v: string | null): string | null {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : v;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ plantId: string }> }
) {
  const { plantId } = await params;

  if (!isUuid(plantId)) {
    return NextResponse.json({ error: "Invalid plantId" }, { status: 400 });
  }

  const url = new URL(req.url);
  const dayParam = url.searchParams.get("day");
  const tzParam = url.searchParams.get("tz");

  // Default to today in UTC if no day provided
  const day = parseDateOrNull(dayParam) ?? new Date().toISOString().slice(0, 10);
  const tz = tzParam || "UTC";

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

  const { data, error } = await supabase.rpc("get_plant_daily_activity_metrics", {
    p_plant_id: plantId,
    p_day: day,
    p_tz: tz,
  });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load plant metrics", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      plant_id: plantId,
      day,
      tz,
      machines: data ?? [],
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
