# Oppit Codebase Onboarding Guide

This document is a practical walkthrough of how this codebase works, aimed at new developers.

## 1) What Oppit Does

Oppit monitors industrial machines using sensor readings, then shows:

- Live machine state (running/stopped/stale)
- Historical trends
- Performance analytics (utilization, runtime, stops, rotations)
- Company/plant/machine organization for multi-customer isolation

At a high level:

1. Sensor posts telemetry to Supabase Edge Function (`ingest`).
2. Ingest authenticates device via machine API key.
3. Reading is stored in Postgres (`readings`).
4. Next.js app reads data via API routes and Supabase RPCs.
5. UI updates via realtime subscriptions + SWR polling fallback.

## 2) System Architecture

```text
ESP32/Hall sensor
    -> HTTPS POST /functions/v1/ingest (x-machine-key)
    -> Supabase Edge Function (auth + insert)
    -> Postgres tables + SQL RPCs
    -> Next.js API routes (/api/...)
    -> React dashboards (plants + machine detail)
```

Core technologies:

- Frontend/API: Next.js App Router + React + SWR
- Database/Auth/Realtime: Supabase (Postgres + RLS + Auth + Realtime)
- Device ingestion: Supabase Edge Function (`Deno`)

## 3) Repository Layout

Top-level folders:

- `app/`: Next.js product app (UI + route handlers)
- `supabase/`: DB migrations, seed data, edge functions
- `docs/`: project docs and setup notes

Important files:

- `app/src/app/companies/page.tsx`: authenticated app entrypoint
- `app/src/app/plants/[plantId]/page.tsx`: plant dashboard
- `app/src/app/machines/[machineId]/page.tsx`: machine detail analytics page
- `app/src/app/api/...`: server routes used by UI
- `supabase/functions/ingest/index.ts`: sensor ingestion endpoint
- `supabase/migrations/*.sql`: schema + RLS + analytics logic

## 4) Business Data Model (How To Think About It)

- `companies`: customer accounts
- `company_members`: users and roles (`owner` / `admin` / `member`)
- `plants`: physical facilities in a company
- `machines`: monitored assets in a plant
- `machine_groups`: optional grouping (line/cell/team)
- `machine_api_keys`: hashed credentials used by devices
- `readings`: telemetry time series (`machine_id`, `metric`, `value`, timestamps)

Industrial mapping:

- Company = customer/org
- Plant = factory/site
- Machine = station/asset
- Reading = sampled measurement (RPM etc.)
- Rotation total = integrated machine output proxy (stitches for sewing use case)

## 5) Security + Multi-Tenancy

### User-facing app security

- Uses Supabase Auth sessions (browser cookie/JWT).
- DB access from app uses anon key + user session.
- RLS enforces company isolation on `plants`, `machines`, `readings`, etc.

### Device ingest security

- Devices do **not** use user auth.
- They authenticate with `x-machine-key` (plaintext key only on device).
- DB stores only `key_hash`, never plaintext.
- Edge function hashes provided key and matches active key row.

### Service role usage

- `SUPABASE_SERVICE_ROLE_KEY` is used only server-side:
  - Edge function ingestion
  - key provisioning/deactivation routes
- Never expose service role in browser/client code.

## 6) End-to-End Flows

### A) Company + plant + machine setup

1. User logs in (`/login`).
2. User creates/selects company (`CompanySwitcher` + RPCs).
3. User opens plant dashboard and adds machines/groups.

### B) Device key provisioning (show once)

1. On machine detail, click "Provision device".
2. API route creates random key, stores hash, returns plaintext once.
3. Firmware gets:
   - ingest URL
   - plaintext machine key
   - machine ID (optional in payload, but commonly included)

Files:

- `app/src/app/components/machines/ProvisionDeviceModal.tsx`
- `app/src/app/api/machines/[machineId]/provision-key/route.ts`
- `app/src/app/api/machines/[machineId]/deactivate-old-keys/route.ts`

### C) Sensor ingestion

Edge function (`supabase/functions/ingest/index.ts`) accepts:

- `x-machine-key` header (preferred), or Bearer token
- body with `value` (single), or `points[]`, or `readings[]`

Then:

1. Hash key and find active key row.
2. Resolve key -> machine.
3. Insert row(s) into `readings`.

### D) Plant dashboard

Route: `/plants/[plantId]`

Uses:

- `/api/plants/[plantId]/cards` for live status cards
- `/api/plants/[plantId]/metrics` for daily station KPI table

### E) Machine detail dashboard

Route: `/machines/[machineId]`

Uses:

- `/api/machines/[machineId]/history` for chart data
- `/api/machines/[machineId]/metrics` for summary + state timeline

Available backend endpoint (UI integration in progress):

- `/api/machines/[machineId]/rpm-trend` for short-vs-long RPM trend comparison

## 7) Analytics Definitions (Current)

Analytics are computed in SQL RPCs (not in frontend math), mainly:

- `get_machine_activity_metrics`
- `get_machine_state_timeline`
- `get_plant_daily_activity_metrics`

Current semantics (RPM machines):

- `active` when `rpm > 0`
- `idle` when `rpm = 0`
- freshness window clips stale intervals (default 120s)
- `rotations_total = sum(rpm * seconds / 60)`
- `utilization_pct = active_seconds / (active_seconds + idle_seconds)`
- `runtime_hours = active_seconds / 3600`
- `stop_count` based on active -> idle transitions
- `avg_stop_duration` from completed stop intervals

Notes:

- For non-RPM machines, activity metrics intentionally return zeros (explicit TODO in SQL).

## 8) Realtime + Polling Behavior

The UI uses both:

- Realtime subscription (`useReadingsRealtime`) for fast updates
- SWR polling fallback (`refreshInterval`) if realtime is unavailable

This makes dashboards resilient during websocket issues.

## 9) Local Development Quickstart

### App

```bash
pnpm -C app install
pnpm -C app dev
```

### Database (if using local Supabase CLI)

```bash
supabase start
supabase db reset
```

### Required env vars (app/server)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `FRESHNESS_SECONDS` (optional, default 120)

## 10) Common Questions / Gotchas

### "Can I use key hash from DB in firmware?"

No. Firmware must use plaintext key shown once during provisioning.

### "What breaks ingestion most often?"

- Wrong key (or rotated key now inactive)
- Wrong ingest URL/project
- Sending machine ID that does not match key mapping
- Device connectivity/TLS issues

### "Why no readings in dashboard even though machine exists?"

Machine metadata and device auth are separate. A machine can exist in DB with keys but still have zero successful ingest posts.

### "If machine is deleted, what happens to keys?"

DB FK is set to `ON DELETE CASCADE`, so machine API keys are removed automatically.

## 11) Where To Modify Features

- New UI component/page behavior:
  - `app/src/app/components/...`
  - `app/src/app/plants/...` / `app/src/app/machines/...`
- New API contract:
  - `app/src/app/api/.../route.ts`
- Security or tenancy rules:
  - `supabase/migrations/*companies*`, `*rls*`
- Analytics definitions:
  - add new migration that updates RPC SQL functions
- Device auth/provisioning behavior:
  - provision/deactivate routes + `ingest` function

## 12) Recommended Working Practice

- Do not edit old migrations in place; add new forward-only migrations.
- Treat `supabase/functions/ingest/index.ts` as production-critical path.
- Keep API response shapes explicit and aligned with UI types.
- Verify with lint and a quick manual ingest curl test before demo.
