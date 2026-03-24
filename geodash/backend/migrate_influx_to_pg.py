"""One-time migration script: InfluxDB → PostgreSQL.

Run with both containers up:
    docker compose exec geodash python -m backend.migrate_influx_to_pg

Or standalone:
    INFLUX_URL=http://localhost:8086 INFLUX_TOKEN=... DATABASE_URL=postgresql://geodash:pass@localhost:5432/geodash \
    python backend/migrate_influx_to_pg.py
"""

import asyncio
import json
import os
import sys

import asyncpg

# InfluxDB client is optional — only needed for migration
try:
    from influxdb_client import InfluxDBClient
except ImportError:
    print("ERROR: influxdb-client not installed. Run: pip install influxdb-client")
    sys.exit(1)

INFLUX_URL = os.environ.get("INFLUX_URL", "http://localhost:8086")
INFLUX_TOKEN = os.environ.get("INFLUX_TOKEN", "")
INFLUX_ORG = os.environ.get("INFLUX_ORG", "geodash")
INFLUX_BUCKET = os.environ.get("INFLUX_BUCKET", "redalerts")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://geodash:geodash@localhost:5432/geodash")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS alerts (
    id          BIGSERIAL PRIMARY KEY,
    ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
    area        TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    category    SMALLINT NOT NULL DEFAULT 0,
    alert_date  TEXT NOT NULL DEFAULT '',
    source      TEXT DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts (ts DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_area_ts ON alerts (area, ts DESC);

CREATE TABLE IF NOT EXISTS snapshots (
    id      BIGSERIAL PRIMARY KEY,
    ts      TIMESTAMPTZ NOT NULL DEFAULT now(),
    count   INTEGER NOT NULL,
    payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots (ts DESC);
"""


async def migrate():
    print(f"Connecting to InfluxDB at {INFLUX_URL}...")
    influx = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
    query_api = influx.query_api()

    print(f"Connecting to PostgreSQL at {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else DATABASE_URL}...")
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)

    async with pool.acquire() as conn:
        await conn.execute(SCHEMA_SQL)
    print("Schema created.")

    # ── Migrate alerts ──────────────────────────────────────────────────────
    print("\nMigrating alerts...")
    alert_query = f'''
        from(bucket: "{INFLUX_BUCKET}")
            |> range(start: -365d)
            |> filter(fn: (r) => r["_measurement"] == "alert")
            |> filter(fn: (r) => r["_field"] == "category")
            |> sort(columns: ["_time"], desc: false)
    '''

    tables = query_api.query(alert_query)
    alert_rows = []
    for table in tables:
        for record in table.records:
            ts = record.get_time()
            area = record.values.get("area", "")
            title = record.values.get("title", "")
            category = int(record.get_value() or 0)

            # Try to get alert_date from a sibling field
            alert_date = ""
            alert_rows.append((ts, area, title, category, alert_date, "influx_migration"))

    print(f"  Found {len(alert_rows)} alert records.")

    # Also try to get alert_date field values
    try:
        date_query = f'''
            from(bucket: "{INFLUX_BUCKET}")
                |> range(start: -365d)
                |> filter(fn: (r) => r["_measurement"] == "alert")
                |> filter(fn: (r) => r["_field"] == "alert_date")
                |> sort(columns: ["_time"], desc: false)
        '''
        date_tables = query_api.query(date_query)
        # Build lookup: (ts, area) -> alert_date
        date_lookup = {}
        for table in date_tables:
            for record in table.records:
                key = (record.get_time().isoformat(), record.values.get("area", ""))
                date_lookup[key] = record.get_value() or ""

        # Update alert_rows with alert_date values
        updated_rows = []
        for ts, area, title, category, _, source in alert_rows:
            ad = date_lookup.get((ts.isoformat(), area), "")
            updated_rows.append((ts, area, title, category, ad, source))
        alert_rows = updated_rows
        print(f"  Enriched {len(date_lookup)} records with alert_date.")
    except Exception as e:
        print(f"  Warning: could not fetch alert_date field: {e}")

    if alert_rows:
        batch_size = 1000
        async with pool.acquire() as conn:
            for i in range(0, len(alert_rows), batch_size):
                batch = alert_rows[i:i + batch_size]
                await conn.executemany(
                    "INSERT INTO alerts (ts, area, title, category, alert_date, source) "
                    "VALUES ($1, $2, $3, $4, $5, $6)",
                    batch,
                )
                print(f"  Inserted alerts {i+1}-{min(i+batch_size, len(alert_rows))}")
        print(f"  ✓ Migrated {len(alert_rows)} alerts to PostgreSQL.")

    # ── Migrate snapshots ───────────────────────────────────────────────────
    print("\nMigrating snapshots...")
    snap_query = f'''
        from(bucket: "{INFLUX_BUCKET}")
            |> range(start: -365d)
            |> filter(fn: (r) => r["_measurement"] == "snapshot")
            |> filter(fn: (r) => r["_field"] == "payload")
            |> sort(columns: ["_time"], desc: false)
    '''

    snap_tables = query_api.query(snap_query)
    snap_rows = []
    for table in snap_tables:
        for record in table.records:
            ts = record.get_time()
            payload_str = record.get_value() or "[]"
            try:
                payload = json.loads(payload_str)
                count = len(payload) if isinstance(payload, list) else 0
            except json.JSONDecodeError:
                continue
            snap_rows.append((ts, count, payload_str))

    print(f"  Found {len(snap_rows)} snapshot records.")

    if snap_rows:
        batch_size = 500
        async with pool.acquire() as conn:
            for i in range(0, len(snap_rows), batch_size):
                batch = snap_rows[i:i + batch_size]
                await conn.executemany(
                    "INSERT INTO snapshots (ts, count, payload) VALUES ($1, $2, $3::jsonb)",
                    batch,
                )
                print(f"  Inserted snapshots {i+1}-{min(i+batch_size, len(snap_rows))}")
        print(f"  ✓ Migrated {len(snap_rows)} snapshots to PostgreSQL.")

    # ── Verify ──────────────────────────────────────────────────────────────
    print("\nVerification:")
    async with pool.acquire() as conn:
        pg_alerts = await conn.fetchval("SELECT COUNT(*) FROM alerts")
        pg_snaps = await conn.fetchval("SELECT COUNT(*) FROM snapshots")
    print(f"  PostgreSQL alerts:    {pg_alerts}")
    print(f"  PostgreSQL snapshots: {pg_snaps}")
    print(f"  InfluxDB alerts:      {len(alert_rows)}")
    print(f"  InfluxDB snapshots:   {len(snap_rows)}")

    match = pg_alerts >= len(alert_rows) and pg_snaps >= len(snap_rows)
    print(f"\n{'✓ Migration complete!' if match else '⚠ Row count mismatch — check for pre-existing data.'}")

    await pool.close()
    influx.close()


if __name__ == "__main__":
    asyncio.run(migrate())
