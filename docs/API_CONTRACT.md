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
