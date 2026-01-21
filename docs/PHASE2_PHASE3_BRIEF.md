# Oppit Pilot – Phase 2 & 3 Brief

## Phase 2 (Days 3–6): Dashboard

Deliverables:

1) Dashboard UI

- Route: /plants/[plantId]
- Shows machine cards:
  - status pill: Running vs Not Running (derived)
  - latest value of primary metric
  - last update time (ts_server)

2) Machine detail

- Route: /machines/[machineId]
- Chart of primary metric vs time
- Time range selector (15m, 1h, 6h, 24h, custom)

3) Data APIs

- GET /api/plants/:plantId/cards -> uses RPC get_machine_cards(plantId, freshnessSeconds)
- GET /api/machines/:machineId/history?from=&to=&metric= -> queries readings by ts_server

## Phase 3 (Days 6–10): Live feel + polish

- Realtime: subscribe to readings INSERT and trigger refetch (SWR mutate)
- Polling fallback stays on (5s)
- Auth (if required): magic link / OTP preferred
- Deploy: runs unattended; simulator optional always-on but ideally togglable for demo

## Non-negotiables

- "live" means <= 1 second for cards (realtime is the path; polling fallback acceptable)
- One metric per machine for pilot
- Running logic uses freshness window (config)
