import { randomBytes, createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ machineId: string }> }
) {
  const { machineId } = await params;

  if (!isUuid(machineId)) {
    return NextResponse.json(
      { error: "Invalid machineId" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json(
      { error: "Server misconfiguration: missing NEXT_PUBLIC_SUPABASE_URL" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  const deviceKey = randomBytes(32).toString("hex");
  const keyHash = createHash("sha256").update(deviceKey).digest("hex");

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

  const { data: insertedKey, error: insertError } = await adminSupabase
    .from("machine_api_keys")
    .insert({
      machine_id: machineId,
      key_hash: keyHash,
      is_active: true,
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to create device key", details: insertError.message },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      machineId,
      keyId: insertedKey.id,
      deviceKey,
      ingestUrl: `${supabaseUrl}/functions/v1/ingest`,
    },
    { headers: NO_STORE_HEADERS }
  );
}
