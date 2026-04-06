# Cutover: InfluxDB + SQLite → Postgres/Timescale (PR 1)

This document is the step-by-step protocol for migrating the Red Alert
Monitoring Stack from its previous split storage (InfluxDB for alert
time-series + SQLite for management-ui settings/simulations) to a single
unified Postgres + TimescaleDB instance.

> **Scope.** PR 1 covers infrastructure and data migration only. The
> `inferred_guidance` feature that originally motivated this change ships
> separately in PR 2.

> **Expected downtime.** ~10–30 minutes on the target host while the migration
> script runs and containers are rebuilt.

## Prerequisites

- [ ] `master` up to date on the target host (`git pull`)
- [ ] Docker Hub creds available to push rebuilt images
- [ ] ~5 GB free disk for the new `timescaledb-data` volume
- [ ] The old `influxdb` container is currently running and has data in it
- [ ] The old `redalert-api-data` volume exists and contains `management.db`

## Step 1 — Build and push new images (local dev machine)

Two images changed: `redalert-geodash` and `redalert-api`. Build from repo root:

```bash
docker build -t danielrosehill/redalert-geodash:latest ./frontend/geodash
docker build -t danielrosehill/redalert-api:latest ./api

docker push danielrosehill/redalert-geodash:latest
docker push danielrosehill/redalert-api:latest
```

No other images changed in PR 1. `mcp-server` had a tiny health-check
cleanup but no functional change — rebuild only if you care about
consistency.

## Step 2 — Snapshot the current state on the target host

Before touching anything, take a safety backup of the volumes you're about
to migrate away from. These backups are your rollback path.

```bash
# Copy SQLite DB out of the api-data volume
docker run --rm \
  -v redalert-api-data:/src:ro \
  -v "$PWD":/dst \
  alpine cp /src/management.db /dst/management.db.pre-cutover.bak

# Snapshot the whole Influx volume (optional but cheap)
docker run --rm \
  -v redalert-influxdb-data:/src:ro \
  -v "$PWD":/dst \
  alpine tar czf /dst/influxdb-data.pre-cutover.tar.gz -C /src .
```

Keep both files somewhere outside the repo directory.

## Step 3 — Stop the stack (but keep the old Influx data around)

```bash
cd /path/to/Red-Alert-Monitoring-Stack-Public
docker compose -f compose/default.yml down
```

Do **not** delete the `redalert-influxdb-data` volume yet — the migration
script needs to read from it.

## Step 4 — Pull new images and bring up Timescale alone

```bash
git pull
docker compose -f compose/default.yml pull
docker compose -f compose/default.yml up -d timescaledb
```

Wait for the healthcheck to go healthy (~10s). Verify:

```bash
docker compose -f compose/default.yml ps timescaledb
docker exec timescaledb pg_isready -U redalert
```

The schema (`db/schema.sql`) is applied automatically on first boot via
`/docker-entrypoint-initdb.d/`. Confirm the tables exist:

```bash
docker exec -it timescaledb psql -U redalert -d redalert -c '\dt'
```

You should see: `alerts`, `snapshots`, `settings`, `simulation_sessions`.

## Step 5 — Bring up the old Influx container temporarily

The migration script needs both databases reachable. Start only Influx and
the new Timescale:

```bash
# Add a one-off service definition that points at the existing volume
docker run -d --rm \
  --name influxdb-migration \
  --network redalert \
  -v redalert-influxdb-data:/var/lib/influxdb2 \
  influxdb:2
```

Wait ~10s for it to come up.

## Step 6 — Run the migration script

From the repo root, with both DBs reachable:

```bash
# Locate the SQLite file on the host
SQLITE_HOST_PATH=$(docker volume inspect redalert-api-data -f '{{ .Mountpoint }}')/management.db
sudo ls -la "$SQLITE_HOST_PATH"   # sanity check

# Run the migration in a throwaway Python container
docker run --rm \
  --network redalert \
  -v "$PWD":/app \
  -v "$SQLITE_HOST_PATH":/tmp/management.db:ro \
  -w /app \
  -e INFLUX_URL=http://influxdb-migration:8086 \
  -e INFLUX_TOKEN=redalert-dev-token \
  -e INFLUX_ORG=redalert \
  -e INFLUX_BUCKET=alerts \
  -e DATABASE_URL=postgresql://redalert:redalert-dev-password@timescaledb:5432/redalert \
  -e SQLITE_PATH=/tmp/management.db \
  python:3.12-slim sh -c "
    pip install --quiet asyncpg influxdb-client &&
    python frontend/geodash/backend/migrate_influx_to_pg.py
  "
```

Expected output:

```
✓ Target schema verified.

Migrating alerts...
  Found N alert records in Influx.
  Enriched M records with alert_date.
  Inserted alerts 1-1000
  ...
  ✓ Migrated N alert rows.

Migrating snapshots...
  ...
  ✓ Migrated M snapshot rows.

Migrating SQLite data from /tmp/management.db...
  ✓ Migrated X settings rows.
  ✓ Migrated Y simulation_sessions rows.

Verification:
  alerts:              N
  snapshots:           M
  settings:            X
  simulation_sessions: Y

✓ Migration complete.
```

If any step errors, **stop here** and investigate. The migration script is
idempotent (ON CONFLICT DO NOTHING / DO UPDATE), so rerunning is safe.

## Step 7 — Spot-check the migrated data

```bash
docker exec -it timescaledb psql -U redalert -d redalert -c "
  SELECT area, category, ts
  FROM alerts
  ORDER BY ts DESC
  LIMIT 10;
"

docker exec -it timescaledb psql -U redalert -d redalert -c "
  SELECT COUNT(*), MIN(ts), MAX(ts) FROM alerts;
"

docker exec -it timescaledb psql -U redalert -d redalert -c "
  SELECT key, LEFT(value, 40) FROM settings LIMIT 20;
"
```

Confirm the counts and timestamps look sane vs. what you had in Influx.

## Step 8 — Stop the temporary Influx container

```bash
docker stop influxdb-migration
```

## Step 9 — Bring the full stack up on the new storage

```bash
docker compose -f compose/default.yml up -d
docker compose -f compose/default.yml ps
```

Watch logs for the critical services:

```bash
docker compose -f compose/default.yml logs -f geodash api actuator
```

You should see geodash log `Postgres connected (attempt 1)` and the api
respond to requests without SQLite errors.

## Step 10 — Functional smoke test

- [ ] Open geodash — map loads, live alerts poll, `/api/alert-log/stats`
      returns numbers matching step 7
- [ ] Open management UI — settings page loads and persists a change
- [ ] Trigger a test alert from the management UI — confirm it appears in
      geodash and **does not** end up in the `alerts` table (test alerts
      must not be persisted)
- [ ] Open the simulation page — list of past sessions loads, PDF download
      works on an old session
- [ ] `docker exec timescaledb psql -U redalert -d redalert -c 'SELECT
      COUNT(*) FROM alerts WHERE ts > now() - interval '"'"'5 minutes'"'"';'`
      should be > 0 after a few poll cycles

## Step 11 — Retire the old Influx volume (after a safety window)

Leave `redalert-influxdb-data` in place for **at least a week** in case you
need to re-run the migration or investigate data anomalies. Once you're
confident:

```bash
docker volume rm redalert-influxdb-data
```

The `management.db` file inside `redalert-api-data` becomes orphaned (the
new api code no longer touches it) but is harmless. Clean it up whenever.

## Rollback

If something goes wrong and you need to revert to Influx + SQLite:

1. `docker compose -f compose/default.yml down`
2. `git checkout <previous commit>` on the target host
3. `docker compose -f compose/default.yml pull` (fetches the old images
   again — Docker Hub still has the prior `:latest` digest cached locally
   unless you pruned)
4. `docker compose -f compose/default.yml up -d`
5. The old `redalert-influxdb-data` volume is still intact, so the stack
   comes back up on the old storage.

## Notes for PR 2 (inferred_guidance)

PR 2 will add:

- A new `guidance_transitions` table (already reserved in `schema.sql` as a
  comment — currently **not** created; PR 2 adds a migration that creates it)
- Actuator writes on state change + decay events
- Geodash `/api/guidance` proxy + persistent banner UI

PR 2 depends on this cutover being complete.
