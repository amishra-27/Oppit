// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Metric = "rpm" | "temperature" | "vibration" | "amps";

type IngestBody = {
  machine_id: string;

  device_ts?: string | null;
  value?: number;

  points?: Array<{ ts: string; value: number }>;

  readings?: Array<{ metric: Metric; value: number }>;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type,x-machine-key",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const machineKey = req.headers.get("x-machine-key");
  if (!machineKey) return json(401, { error: "Missing x-machine-key header" });

  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  if (!body.machine_id) return json(400, { error: "machine_id is required" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const keyHash = await sha256Hex(machineKey);

  const { data: keyRow, error: keyErr } = await supabase
    .from("machine_api_keys")
    .select("id")
    .eq("machine_id", body.machine_id)
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .maybeSingle();

  if (keyErr) return json(500, { error: "Key lookup failed", details: keyErr.message });
  if (!keyRow) return json(403, { error: "Invalid or inactive machine key" });

  const { data: machineRow, error: machineErr } = await supabase
    .from("machines")
    .select("primary_metric")
    .eq("id", body.machine_id)
    .maybeSingle();

  if (machineErr) return json(500, { error: "Machine lookup failed", details: machineErr.message });
  if (!machineRow) return json(404, { error: "Machine not found" });

  const primaryMetric = machineRow.primary_metric as Metric;

  if (Array.isArray(body.points) && body.points.length > 0) {
    const rows = body.points.map((p) => ({
      machine_id: body.machine_id,
      ts_device: p.ts,
      metric: primaryMetric,
      value: p.value,
    }));

    const { error: insErr } = await supabase.from("readings").insert(rows);
    if (insErr) return json(500, { error: "Insert failed", details: insErr.message });
    return json(200, { ok: true, inserted: rows.length });
  }

  if (Array.isArray(body.readings) && body.readings.length > 0) {
    const bad = body.readings.find((r) => r.metric !== primaryMetric);
    if (bad) {
      return json(400, {
        error: `Metric ${bad.metric} not allowed for this machine (expected ${primaryMetric})`,
      });
    }

    const rows = body.readings.map((r) => ({
      machine_id: body.machine_id,
      ts_device: body.device_ts ?? null,
      metric: r.metric,
      value: r.value,
    }));

    const { error: insErr } = await supabase.from("readings").insert(rows);
    if (insErr) return json(500, { error: "Insert failed", details: insErr.message });
    return json(200, { ok: true, inserted: rows.length });
  }

  if (typeof body.value === "number") {
    const row = {
      machine_id: body.machine_id,
      ts_device: body.device_ts ?? null,
      metric: primaryMetric,
      value: body.value,
    };

    const { error: insErr } = await supabase.from("readings").insert([row]);
    if (insErr) return json(500, { error: "Insert failed", details: insErr.message });
    return json(200, { ok: true, inserted: 1 });
  }

  return json(400, { error: "Provide points[], readings[], or value" });
});
