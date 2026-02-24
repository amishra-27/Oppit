import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

type Body = {
  keepKeyId?: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ machineId: string }> }
) {
  const { machineId } = await params;

  if (!isUuid(machineId)) {
    return NextResponse.json(
      { error: "Invalid machineId" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  let body: Body = {};
  const rawBody = await req.text();
  if (rawBody.trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    body = parsed as Body;
  }

  if (body.keepKeyId !== undefined) {
    if (typeof body.keepKeyId !== "string" || !isUuid(body.keepKeyId)) {
      return NextResponse.json(
        { error: "Invalid keepKeyId" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
  }

  // Session-bound client — enforce auth and RLS checks for the caller.
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  // Verify machine exists and is readable under caller's RLS scope.
  const { data: machine, error: machineError } = await supabase
    .from("machines")
    .select("id, company_id")
    .eq("id", machineId)
    .maybeSingle();

  if (machineError) {
    return NextResponse.json(
      { error: "Failed to verify machine access", details: machineError.message },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  if (!machine) {
    return NextResponse.json(
      { error: "Machine not found or access denied" },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  if (!machine.company_id) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_company_admin", {
    p_company_id: machine.company_id,
  });

  if (adminError) {
    return NextResponse.json(
      { error: "Failed to verify company admin role", details: adminError.message },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  if (!isAdmin) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  let adminSupabase: ReturnType<typeof createAdminClient>;
  try {
    adminSupabase = createAdminClient();
  } catch (err) {
    const details = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Server misconfiguration: failed to initialize admin Supabase client", details },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  let deactivateQuery = adminSupabase
    .from("machine_api_keys")
    .update({ is_active: false }, { count: "exact" })
    .eq("machine_id", machineId)
    .eq("is_active", true);

  if (body.keepKeyId) {
    deactivateQuery = deactivateQuery.neq("id", body.keepKeyId);
  }

  const { error: deactivateError, count } = await deactivateQuery;

  if (deactivateError) {
    return NextResponse.json(
      { error: "Failed to deactivate keys", details: deactivateError.message },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      machineId,
      deactivatedCount: count ?? 0,
    },
    { headers: NO_STORE_HEADERS }
  );
}
