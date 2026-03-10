# Revolution-Counter Next Iteration (Firmware + Codebase Prompt Flow)

## Goal

Move from sending only RPM to sending exact production counters from the device, while still supporting existing UI/analytics.

Recommended strategy:

1. Device sends **counter payloads**:
   - `revs_in_window`
   - `window_ms`
   - `revs_total` (monotonic cumulative counter)
   - `seq` + `boot_id` (idempotency and reset handling)
2. Backend computes/stores RPM server-side.
3. Backend preserves existing API contracts (`history`, `metrics`) so frontend does not break.
4. Analytics uses exact revolution totals where possible.

---

## Telemetry Contract (v2)

Send this JSON to `/functions/v1/ingest`:

```json
{
  "machine_id": "36ca9614-41e9-41e7-9a89-2339714d2f16",
  "revs_in_window": 12,
  "window_ms": 1000,
  "revs_total": 145932,
  "seq": 4821,
  "boot_id": "esp32c3-8f2a-1710182",
  "device_ts": "2026-03-04T15:21:09Z"
}
```

Notes:

- `machine_id` can be omitted if key->machine mapping is authoritative.
- `window_ms` must be exact for accurate derived RPM.
- `revs_total` should be monotonic for the current device stream.
- `seq` should increase by 1 per sent sample (per boot).
- `boot_id` changes on reboot (lets backend detect sequence resets safely).

Why both `revs_in_window` and `revs_total`:

- `revs_in_window`: simple direct per-sample quantity.
- `revs_total`: lets backend recover from dropped packets and avoid undercounting.

---

## Firmware Template (ESP32, Hall Sensor, Counter-First)

Use this as the next iteration base. It keeps your current auth/URL pattern, but sends revolution counters and can optionally send legacy `value` (RPM) during migration.

```cpp
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

// ----------------------------
// Hardware / sampling
// ----------------------------
static const int HALL_PIN = 27;
static const int PULSES_PER_REV = 1; // keep 1 for your current setup
static const uint32_t MIN_PULSE_GAP_US = 2000;
static const uint32_t SAMPLE_WINDOW_MS = 1000;

volatile uint32_t g_pulseWindow = 0;
volatile uint32_t g_lastPulseUs = 0;

uint64_t g_totalPulses = 0;    // monotonic across this boot
uint64_t g_seq = 0;            // monotonic sample sequence
char g_bootId[40] = {0};       // stable for this boot

// ----------------------------
// WiFi / ingest
// ----------------------------
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASS";
const char* INGEST_URL = "https://<PROJECT>.supabase.co/functions/v1/ingest";
const char* MACHINE_KEY = "PLAINTEXT_MACHINE_KEY";
const char* MACHINE_ID = "MACHINE_UUID"; // optional

// Transition mode:
// true  -> include legacy "value" (RPM) so old backend still works
// false -> send counter payload only
static const bool SEND_LEGACY_RPM_VALUE = true;

unsigned long g_lastSampleMs = 0;

void IRAM_ATTR onHallPulse() {
  uint32_t nowUs = micros();
  if (nowUs - g_lastPulseUs >= MIN_PULSE_GAP_US) {
    g_pulseWindow++;
    g_lastPulseUs = nowUs;
  }
}

double computeRpmFromRevs(uint32_t revsInWindow, uint32_t windowMs) {
  double seconds = (double)windowMs / 1000.0;
  if (seconds <= 0) return 0.0;
  return ((double)revsInWindow / seconds) * 60.0;
}

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.disconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

bool postSample(uint32_t revsInWindow, uint32_t windowMs, uint64_t revsTotal, uint64_t seq) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure(); // replace with real cert pinning for production

  HTTPClient http;
  http.begin(client, INGEST_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-machine-key", MACHINE_KEY);

  double rpm = computeRpmFromRevs(revsInWindow, windowMs);

  // Build compact JSON without ArduinoJson
  char body[512];
  if (SEND_LEGACY_RPM_VALUE) {
    snprintf(
      body,
      sizeof(body),
      "{\"machine_id\":\"%s\",\"revs_in_window\":%u,\"window_ms\":%u,\"revs_total\":%llu,"
      "\"seq\":%llu,\"boot_id\":\"%s\",\"value\":%.2f}",
      MACHINE_ID,
      revsInWindow,
      windowMs,
      (unsigned long long)revsTotal,
      (unsigned long long)seq,
      g_bootId,
      rpm
    );
  } else {
    snprintf(
      body,
      sizeof(body),
      "{\"machine_id\":\"%s\",\"revs_in_window\":%u,\"window_ms\":%u,\"revs_total\":%llu,"
      "\"seq\":%llu,\"boot_id\":\"%s\"}",
      MACHINE_ID,
      revsInWindow,
      windowMs,
      (unsigned long long)revsTotal,
      (unsigned long long)seq,
      g_bootId
    );
  }

  int code = http.POST((uint8_t*)body, strlen(body));
  String resp = http.getString();
  http.end();

  Serial.printf("[ingest] code=%d seq=%llu revs_win=%u revs_total=%llu resp=%s\n",
                code,
                (unsigned long long)seq,
                revsInWindow,
                (unsigned long long)revsTotal,
                resp.c_str());

  return (code >= 200 && code < 300);
}

void setup() {
  Serial.begin(115200);
  delay(150);

  pinMode(HALL_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(HALL_PIN), onHallPulse, FALLING);

  uint64_t chip = ESP.getEfuseMac();
  snprintf(g_bootId, sizeof(g_bootId), "esp32-%08lx-%lu",
           (unsigned long)(chip & 0xffffffff),
           (unsigned long)millis());

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  g_lastSampleMs = millis();
}

void loop() {
  ensureWifi();

  unsigned long now = millis();
  if (now - g_lastSampleMs >= SAMPLE_WINDOW_MS) {
    g_lastSampleMs += SAMPLE_WINDOW_MS;

    noInterrupts();
    uint32_t pulses = g_pulseWindow;
    g_pulseWindow = 0;
    interrupts();

    // NOTE: for PULSES_PER_REV != 1, integer division truncates.
    // If that matters, send pulses instead of revs in payload.
    uint32_t revsInWindow = pulses / PULSES_PER_REV;

    g_totalPulses += pulses;
    uint64_t revsTotal = g_totalPulses / PULSES_PER_REV;
    g_seq += 1;

    bool ok = postSample(revsInWindow, SAMPLE_WINDOW_MS, revsTotal, g_seq);
    if (!ok) {
      // Minimal behavior here; for production add queue + retry/backoff.
      Serial.println("[ingest] failed");
    }
  }

  delay(2);
}
```

---

## Backend Prompt Flow (One File At A Time)

Use these prompts in order.

### B1) Add revolution fields to `readings`

```md
Create exactly one new migration file: `supabase/migrations/<timestamp>_add_revolution_fields_to_readings.sql`.
Do not modify any other file.

Goal:
Store raw revolution counters per reading.

Requirements:
- `alter table public.readings add column if not exists revs_in_window bigint;`
- `alter table public.readings add column if not exists window_ms integer;`
- `alter table public.readings add column if not exists revs_total bigint;`
- `alter table public.readings add column if not exists ingest_seq bigint;`
- `alter table public.readings add column if not exists ingest_boot_id text;`
- Add an index to support latest-counter lookup:
  - `(machine_id, ts_server desc)` (if not already sufficient).

Acceptance criteria:
- Migration is idempotent.
- No other file edited.
```

### B2) Add ingest cursor table for idempotency and monotonic tracking

```md
Create exactly one new migration file: `supabase/migrations/<timestamp>_add_machine_ingest_cursor.sql`.
Do not modify any other file.

Goal:
Track last accepted `(boot_id, seq, revs_total)` per machine to handle retries/resets safely.

Requirements:
- Create table `public.machine_ingest_cursor` with:
  - `machine_id uuid primary key references public.machines(id) on delete cascade`
  - `boot_id text not null`
  - `last_seq bigint not null default 0`
  - `last_revs_total bigint not null default 0`
  - `updated_at timestamptz not null default now()`
- Add `updated_at` touch trigger optional (or update in code).
- Enable RLS and add policy denying direct client access (`using (false)` for authenticated).

Acceptance criteria:
- Table exists and is service-role writable.
- No other file edited.
```

### B3) Accept counter payload in ingest and compute RPM server-side

```md
Edit exactly one file: `supabase/functions/ingest/index.ts`.
Do not modify any other file.

Goal:
Support counter-based ingestion (`revs_in_window`, `window_ms`, `revs_total`, `seq`, `boot_id`) and compute RPM server-side.

Requirements:
- Extend request body type to include:
  - `revs_in_window?: number`
  - `window_ms?: number`
  - `revs_total?: number`
  - `seq?: number`
  - `boot_id?: string`
- Add "counter mode" branch with validation:
  - `window_ms > 0`
  - `revs_in_window >= 0`
  - if `revs_total` present then `revs_total >= 0`
  - if `seq` present then `seq >= 0`
- Compute `rpmDerived = (revs_in_window / window_ms) * 60000`.
- Insert into `readings` with:
  - `metric = primaryMetric` (for rpm machines this is rpm)
  - `value = rpmDerived`
  - new raw columns (`revs_in_window`, `window_ms`, `revs_total`, `ingest_seq`, `ingest_boot_id`)
- Maintain backward compatibility with current `value` / `points[]` / `readings[]` modes.
- If both legacy `value` and counter fields are sent, prefer counter-derived RPM for insert.
- Keep `last_used_at` update behavior.

Acceptance criteria:
- Existing firmware payloads still work.
- Counter payloads produce valid readings with computed RPM.
- Only this file edited.
```

### B4) Update generated DB type definitions for new columns

```md
Edit exactly one file: `app/src/lib/database.types.ts`.
Do not modify any other file.

Goal:
Reflect newly added `readings` columns in TS types.

Requirements:
- In `readings.Row`, `Insert`, and `Update`, add:
  - `revs_in_window`
  - `window_ms`
  - `revs_total`
  - `ingest_seq`
  - `ingest_boot_id`
- Keep existing fields intact.

Acceptance criteria:
- TypeScript references to new columns compile.
- Only this file edited.
```

### B5) Use exact revolution totals in analytics RPC

```md
dCreate exactly one new migration file: `supabase/migrations/<timestamp>_prefer_raw_revolutions_in_activity_metrics.sql`.
Do not modify any other file.

Goal:
Make `rotations_total` exact when raw revolution data exists.

Requirements:
- `create or replace function public.get_machine_activity_metrics(...)`
- In aggregation logic:
  - if `revs_in_window` is present, sum that as rotations contribution
  - otherwise fallback to `rpm * seconds / 60`
- Preserve existing output columns and meanings:
  - `rotations_total, active_seconds, idle_seconds, utilization_pct, runtime_hours, stop_count, avg_stop_duration_seconds`
- Preserve non-RPM behavior and freshness clipping logic.

Acceptance criteria:
- Existing API responses keep same shape.
- `rotations_total` uses exact counts for new counter-ingested data.
- Only one migration file added.
```

### B6) Document new ingest contract

```md
Edit exactly one file: `docs/API_CONTRACT.md`.
Do not modify any other file.

Goal:
Document counter-based ingest mode.

Requirements:
- Add section for `POST /functions/v1/ingest` showing:
  - legacy `value` mode
  - new counter mode (`revs_in_window`, `window_ms`, `revs_total`, `seq`, `boot_id`)
- Clarify auth header options and machine_id behavior.

Acceptance criteria:
- API contract doc includes both modes.
- Only this file edited.
```

---

## Frontend Prompt Flow (One File At A Time)

If backend keeps existing API response shape, frontend is mostly unchanged. These prompts are for surfacing the new meaning clearly.

### F1) Clarify “Rotations” as stitch count in machine summary

```md
Edit exactly one file: `app/src/app/components/analytics/MachineMetricsSummary.tsx`.
Do not modify any other file.

Goal:
Make it explicit that rotations are stitch-count ground truth.

Requirements:
- Change label from `Rotations` to `Stitches (Revs)` (or similar).
- Update subtitle to clarify this is exact total from revolution counters when available.
- Keep existing prop API and layout behavior unchanged.

Acceptance criteria:
- Component renders the renamed metric tile.
- No other file edited.
```

### F2) Clarify daily table column meaning

```md
Edit exactly one file: `app/src/app/components/analytics/PlantDailyMetricsTable.tsx`.
Do not modify any other file.

Goal:
Rename daily `Rotations` column to reflect stitch-count meaning.

Requirements:
- Update column label from `Rotations` to `Stitches (Revs)` (or equivalent).
- Keep sorting key `rotationsTotal` unchanged.
- Keep all existing table behavior unchanged.

Acceptance criteria:
- Column title updated without breaking sort/render.
- No other file edited.
```

### F3) Add a note on machine detail analytics

```md
Edit exactly one file: `app/src/app/machines/[machineId]/page.tsx`.
Do not modify any other file.

Goal:
Explain data provenance on the machine dashboard.

Requirements:
- Add a small helper note near Performance Summary:
  - stitches/rotations are exact device revolution totals when available
  - RPM is derived server-side from counter windows
- Keep existing fetch and rendering logic unchanged.

Acceptance criteria:
- Informational note is visible and non-intrusive.
- No other file edited.
```

---

## Recommended Rollout

1. Deploy backend support first (B1-B5).
2. Keep firmware in transition mode (`SEND_LEGACY_RPM_VALUE=true`) for one demo cycle.
3. Verify parity of RPM and improved daily total stability.
4. Disable legacy `value` field in firmware.
5. Apply frontend copy updates (F1-F3).

---

## Validation Checklist

- New payload succeeds (HTTP 200).
- `readings` rows contain raw revolution fields + derived RPM.
- `rotations_total` in machine/plant analytics matches expected stitch totals.
- Key rotation still works (old key 401, new key 200).
- Existing dashboards remain functional during migration.
