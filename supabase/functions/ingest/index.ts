// Edge Function: ingest
// Accepts machine readings authenticated via machine API key.
// Key resolved from x-machine-key header or Authorization: Bearer <key>.
// Uses service-role key internally — does NOT rely on RLS.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Metric = "rpm" | "temperature" | "vibration" | "amps";

type IngestBody = {
  // Optional: if provided, must match the key's machine_id
  machine_id?: string;
  device_ts?: string | null;
  value?: number;
  revs_in_window?: number;
  window_ms?: number;
  revs_total?: number;
  seq?: number;
  boot_id?: string;
  points?: Array<{ ts: string; value: number }>;
  readings?: Array<{ metric: Metric; value: number }>;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type,x-machine-key,authorization",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Extract the machine API key from either:
 *   1. x-machine-key header (preferred)
 *   2. Authorization: Bearer <key>
 */
function extractKey(req: Request): string | null {
  const machineKey = req.headers.get("x-machine-key");
  if (machineKey) return machineKey;

  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1];
  }

  return null;
}

async function touchKeyLastUsed(
  supabase: SupabaseClient,
  keyId: string
) {
  const { error } = await supabase
    .from("machine_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyId);

  if (error) {
    // Best effort only: observability update should never fail ingestion.
    console.warn("[ingest] failed to update key last_used_at", {
      keyId,
      error: error.message,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // --- Authenticate via machine API key ---
  const rawKey = extractKey(req);
  if (!rawKey) {
    return json(401, {
      error: "Missing machine API key (x-machine-key header or Bearer token)",
    });
  }

  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, {
      error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars",
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Key lookup: hash → machine_api_keys → machines (join) ---
  const keyHash = await sha256Hex(rawKey);

  const { data: keyRow, error: keyErr } = await supabase
    .from("machine_api_keys")
    .select("id, machine_id, machines(id, company_id, primary_metric)")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .maybeSingle();

  if (keyErr) {
    return json(500, { error: "Key lookup failed", details: keyErr.message });
  }
  if (!keyRow) {
    return json(401, { error: "Invalid or inactive machine API key" });
  }

  // Supabase returns the joined row as an object (single FK)
  const machine = keyRow.machines as unknown as {
    id: string;
    company_id: string;
    primary_metric: Metric;
  } | null;

  if (!machine) {
    return json(404, { error: "Machine not found for this API key" });
  }

  const keyId = keyRow.id as string;
  const machineId = machine.id;
  const companyId = machine.company_id;
  const primaryMetric = machine.primary_metric;

  // If body includes machine_id, validate it matches the key
  if (body.machine_id && body.machine_id !== machineId) {
    return json(403, {
      error: "machine_id in body does not match the API key's machine",
    });
  }

  // --- Insert readings ---

  // Mode 1: batch of timestamped points
  if (Array.isArray(body.points) && body.points.length > 0) {
    const rows = body.points.map((p) => ({
      machine_id: machineId,
      ts_device: p.ts,
      metric: primaryMetric,
      value: p.value,
    }));

    const { error: insErr } = await supabase.from("readings").insert(rows);
    if (insErr)
      return json(500, { error: "Insert failed", details: insErr.message });
    await touchKeyLastUsed(supabase, keyId);
    return json(200, {
      ok: true,
      inserted: rows.length,
      machine_id: machineId,
      company_id: companyId,
    });
  }

  // Mode 2: multi-metric readings array
  if (Array.isArray(body.readings) && body.readings.length > 0) {
    const bad = body.readings.find((r) => r.metric !== primaryMetric);
    if (bad) {
      return json(400, {
        error: `Metric ${bad.metric} not allowed for this machine (expected ${primaryMetric})`,
      });
    }

    const rows = body.readings.map((r) => ({
      machine_id: machineId,
      ts_device: body.device_ts ?? null,
      metric: r.metric,
      value: r.value,
    }));

    const { error: insErr } = await supabase.from("readings").insert(rows);
    if (insErr)
      return json(500, { error: "Insert failed", details: insErr.message });
    await touchKeyLastUsed(supabase, keyId);
    return json(200, {
      ok: true,
      inserted: rows.length,
      machine_id: machineId,
      company_id: companyId,
    });
  }

  // Mode 3: counter payload (preferred over legacy single value when present)
  const hasCounterFields =
    body.revs_in_window !== undefined ||
    body.window_ms !== undefined ||
    body.revs_total !== undefined ||
    body.seq !== undefined ||
    body.boot_id !== undefined;

  if (hasCounterFields) {
    if (
      typeof body.revs_in_window !== "number" ||
      !Number.isFinite(body.revs_in_window) ||
      body.revs_in_window < 0
    ) {
      return json(400, { error: "Invalid revs_in_window (must be a number >= 0)" });
    }

    if (
      typeof body.window_ms !== "number" ||
      !Number.isFinite(body.window_ms) ||
      body.window_ms <= 0
    ) {
      return json(400, { error: "Invalid window_ms (must be a number > 0)" });
    }

    if (body.revs_total !== undefined) {
      if (
        typeof body.revs_total !== "number" ||
        !Number.isFinite(body.revs_total) ||
        body.revs_total < 0
      ) {
        return json(400, { error: "Invalid revs_total (must be a number >= 0)" });
      }
    }

    if (body.seq !== undefined) {
      if (
        typeof body.seq !== "number" ||
        !Number.isFinite(body.seq) ||
        body.seq < 0
      ) {
        return json(400, { error: "Invalid seq (must be a number >= 0)" });
      }
    }

    if (body.boot_id !== undefined && typeof body.boot_id !== "string") {
      return json(400, { error: "Invalid boot_id (must be a string)" });
    }

    const rpmDerived = (body.revs_in_window / body.window_ms) * 60000;
    const row = {
      machine_id: machineId,
      ts_device: body.device_ts ?? null,
      metric: primaryMetric,
      value: rpmDerived,
      revs_in_window: body.revs_in_window,
      window_ms: body.window_ms,
      revs_total: body.revs_total ?? null,
      ingest_seq: body.seq ?? null,
      ingest_boot_id: body.boot_id ?? null,
    };

    const { error: insErr } = await supabase.from("readings").insert([row]);
    if (insErr)
      return json(500, { error: "Insert failed", details: insErr.message });
    await touchKeyLastUsed(supabase, keyId);
    return json(200, {
      ok: true,
      inserted: 1,
      machine_id: machineId,
      company_id: companyId,
    });
  }

  // Mode 4: single value
  if (typeof body.value === "number") {
    const row = {
      machine_id: machineId,
      ts_device: body.device_ts ?? null,
      metric: primaryMetric,
      value: body.value,
    };

    const { error: insErr } = await supabase.from("readings").insert([row]);
    if (insErr)
      return json(500, { error: "Insert failed", details: insErr.message });
    await touchKeyLastUsed(supabase, keyId);
    return json(200, {
      ok: true,
      inserted: 1,
      machine_id: machineId,
      company_id: companyId,
    });
  }

  return json(400, { error: "Provide points[], readings[], value, or counter fields" });
});
