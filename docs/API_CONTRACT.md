# API Contract

## GET /api/plants/:plantId/cards

Response:
{
  plant_id: string,
  freshness_seconds: number,
  machines: Array<{
    machine_id: string,
    machine_name: string,
    primary_metric: string,
    last_ts: string | null,
    last_value: number | null,
    is_fresh: boolean,
    is_running: boolean
  }>
}

## GET /api/machines/:machineId/history

Query params:

- from ISO (default now-15m)
- to ISO (default now)
- metric optional (defaults to machine.primary_metric)
  Response:
  {
  machine_id: string,
  metric: string,
  from: string,
  to: string,
  points: Array<{ ts_server: string, value: number }>
  }

## POST /functions/v1/ingest

Auth headers (either one):

- `x-machine-key: <device_key>`
- `Authorization: Bearer <device_key>`

`machine_id` behavior:

- `machine_id` in body is optional.
- If provided, it must match the machine resolved from the device key.
- Mismatch returns `403`.

### Legacy value mode

Request body:
{
  machine_id?: string,
  device_ts?: string | null,
  value: number
}

Behavior:

- Inserts one reading using the machine primary metric.

### Counter mode (server computes RPM)

Request body:
{
  machine_id?: string,
  device_ts?: string | null,
  revs_in_window: number,   // >= 0
  window_ms: number,        // > 0
  revs_total?: number,      // >= 0 when present
  seq?: number,             // >= 0 when present
  boot_id?: string
}

Behavior:

- Computes `rpmDerived = (revs_in_window / window_ms) * 60000`.
- Inserts one reading with:
  - `metric = machine.primary_metric`
  - `value = rpmDerived`
  - raw counter fields persisted:
    - `revs_in_window`
    - `window_ms`
    - `revs_total`
    - `ingest_seq` (from `seq`)
    - `ingest_boot_id` (from `boot_id`)
- If both legacy `value` and counter fields are present, counter mode is used.

Response (success):
{
  ok: true,
  inserted: number,
  machine_id: string,
  company_id: string
}
