import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

const VALID_METRICS = ["rpm", "temperature", "vibration", "amps"] as const;
type Metric = (typeof VALID_METRICS)[number];

interface PatchBody {
  name?: string;
  line?: string | null;
  primary_metric?: Metric;
  group_id?: string | null;
}

// ── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ machineId: string }> }
) {
  const { machineId } = await params;

  if (!isUuid(machineId)) {
    return NextResponse.json({ error: "Invalid machineId" }, { status: 400 });
  }

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

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Build update payload ─────────────────────────────────────────────────
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const trimmed = typeof body.name === "string" ? body.name.trim() : "";
    if (trimmed === "") {
      return NextResponse.json(
        { error: "name cannot be empty" },
        { status: 400 }
      );
    }
    updates.name = trimmed;
  }

  if ("line" in body) {
    updates.line =
      body.line === null ? null : typeof body.line === "string" ? body.line.trim() : null;
  }

  if (body.primary_metric !== undefined) {
    if (!VALID_METRICS.includes(body.primary_metric)) {
      return NextResponse.json(
        { error: `Invalid primary_metric. Must be one of: ${VALID_METRICS.join(", ")}` },
        { status: 400 }
      );
    }
    updates.primary_metric = body.primary_metric;
  }

  if (body.group_id !== undefined && body.group_id !== null && !isUuid(body.group_id)) {
    return NextResponse.json(
      { error: "Invalid group_id UUID" },
      { status: 400 }
    );
  }

  // ── Update machine row (if any fields to update) ────────────────────────
  if (Object.keys(updates).length > 0) {
    const { error: updateErr, count } = await supabase
      .from("machines")
      .update(updates)
      .eq("id", machineId)
      .select("id");

    if (updateErr) {
      return NextResponse.json(
        { error: "Failed to update machine", details: updateErr.message },
        { status: 500 }
      );
    }

    // RLS may silently return 0 rows if user has no access
    if (count === 0) {
      // Double-check existence vs permission
      const { data: exists } = await supabase
        .from("machines")
        .select("id")
        .eq("id", machineId)
        .maybeSingle();

      if (!exists) {
        return NextResponse.json(
          { error: "Machine not found or access denied" },
          { status: 404 }
        );
      }
    }
  } else if (!("group_id" in body)) {
    // Nothing to update at all
    return NextResponse.json(
      { error: "No fields provided to update" },
      { status: 400 }
    );
  }

  // ── Group assignment ─────────────────────────────────────────────────────
  if ("group_id" in body) {
    // Remove existing group links for this machine
    const { error: delErr } = await supabase
      .from("machine_group_machines")
      .delete()
      .eq("machine_id", machineId);

    if (delErr) {
      return NextResponse.json(
        { error: "Failed to remove existing group links", details: delErr.message },
        { status: 500 }
      );
    }

    // Insert new link if group_id is provided (non-null)
    if (body.group_id !== null && body.group_id !== undefined) {
      const { error: insErr } = await supabase
        .from("machine_group_machines")
        .insert({ group_id: body.group_id, machine_id: machineId });

      if (insErr) {
        return NextResponse.json(
          { error: "Failed to assign group", details: insErr.message },
          { status: 500 }
        );
      }
    }
  }

  // ── Return updated machine ───────────────────────────────────────────────
  const { data: machine, error: fetchErr } = await supabase
    .from("machines")
    .select("id, plant_id, name, line, primary_metric, company_id, created_at")
    .eq("id", machineId)
    .maybeSingle();

  if (fetchErr || !machine) {
    return NextResponse.json(
      { error: "Machine not found or access denied" },
      { status: 404 }
    );
  }

  // Fetch current group assignment
  const { data: groupLink } = await supabase
    .from("machine_group_machines")
    .select("machine_groups(id, name)")
    .eq("machine_id", machineId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const group = groupLink?.machine_groups as unknown as {
    id: string;
    name: string;
  } | null;

  return NextResponse.json(
    {
      ...machine,
      group_id: group?.id ?? null,
      group_name: group?.name ?? null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ machineId: string }> }
) {
  const { machineId } = await params;

  if (!isUuid(machineId)) {
    return NextResponse.json({ error: "Invalid machineId" }, { status: 400 });
  }

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

  // Check machine exists and user has access (RLS)
  const { data: existing } = await supabase
    .from("machines")
    .select("id")
    .eq("id", machineId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { error: "Machine not found or access denied" },
      { status: 404 }
    );
  }

  const { error: deleteErr } = await supabase
    .from("machines")
    .delete()
    .eq("id", machineId);

  if (deleteErr) {
    return NextResponse.json(
      { error: "Failed to delete machine", details: deleteErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
