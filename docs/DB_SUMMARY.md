# DB Summary

Tables:

- plants(id, name)
- machines(id, plant_id, name, line, primary_metric, created_at)
- machine_api_keys(machine_id, key_hash, is_active, created_at)
- readings(machine_id, ts_device nullable, ts_server default now(), metric, value)

Indexes:

- readings(machine_id, metric, ts_server DESC)

Derived:

- last update uses ts_server
- Running = rpm machines: (last_value > 0) AND fresh
- freshness window configurable (FRESHNESS_SECONDS default 120)
