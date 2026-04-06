"""One-time migration: InfluxDB + SQLite → Postgres/Timescale.

Copies historical alert data from the old InfluxDB bucket and the
management-ui's SQLite database into the unified Timescale schema.

Prerequisites:
  1. The new timescaledb container is running and /docker-entrypoint-initdb.d/
     has applied db/schema.sql (hypertables + tables created).
  2. The old influxdb container is still reachable (just stopped writes).
  3. The old management.db SQLite file is accessible on disk.

Usage (from repo root):

    INFLUX_URL=http://localhost:8086 \
    INFLUX_TOKEN=redalert-dev-token \
    INFLUX_ORG=redalert \
    INFLUX_BUCKET=alerts \
    DATABASE_URL=postgresql://redalert:redalert-dev-password@localhost:5432/redalert \
    SQLITE_PATH=/var/lib/docker/volumes/redalert-api-data/_data/management.db \
    python frontend/geodash/backend/migrate_influx_to_pg.py

Idempotency:
  - Alerts: skipped if (ts, area, category) already present.
  - Snapshots: skipped if ts already present.
  - Settings / simulation_sessions: ON CONFLICT DO UPDATE.
"""

import asyncio
import csv
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

import asyncpg

# Influx snapshot payloads can exceed the default 128KB CSV field limit used
# by the influxdb_client CSV parser. Raise it so the parser can read them.
csv.field_size_limit(sys.maxsize)

try:
    from influxdb_client import InfluxDBClient
except ImportError:
    print("ERROR: influxdb-client not installed. Run: pip install influxdb-client")
    sys.exit(1)

INFLUX_URL = os.environ.get("INFLUX_URL", "http://localhost:8086")
INFLUX_TOKEN = os.environ.get("INFLUX_TOKEN", "")
INFLUX_ORG = os.environ.get("INFLUX_ORG", "redalert")
INFLUX_BUCKET = os.environ.get("INFLUX_BUCKET", "alerts")
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    os.environ.get("POSTGRES_URL", "postgresql://redalert:redalert-dev-password@localhost:5432/redalert"),
)
SQLITE_PATH = os.environ.get("SQLITE_PATH", "")
LOOKBACK_DAYS = os.environ.get("LOOKBACK_DAYS", "365")


async def ensure_schema(pool: asyncpg.Pool):
    """Verify the target schema exists. Schema is applied by timescaledb init,
    so this is a sanity check, not a creation step."""
    async with pool.acquire() as conn:
        tables = await conn.fetch(
            """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('alerts', 'snapshots', 'settings', 'simulation_sessions')
            """
        )
        names = {r["table_name"] for r in tables}
        missing = {"alerts", "snapshots", "settings", "simulation_sessions"} - names
        if missing:
            print(f"ERROR: target schema missing tables: {missing}")
            print("Run db/schema.sql against the target database first.")
            sys.exit(1)
        print("✓ Target schema verified.")


async def migrate_alerts(influx: InfluxDBClient, pool: asyncpg.Pool) -> int:
    """Copy alert records from Influx. Returns rows inserted."""
    print("\nMigrating alerts...")
    query_api = influx.query_api()

    alert_query = f'''
        from(bucket: "{INFLUX_BUCKET}")
            |> range(start: -{LOOKBACK_DAYS}d)
            |> filter(fn: (r) => r["_measurement"] == "alert")
            |> filter(fn: (r) => r["_field"] == "category")
            |> sort(columns: ["_time"], desc: false)
    '''

    rows = []
    for table in query_api.query(alert_query):
        for record in table.records:
            rows.append((
                record.get_time(),
                record.values.get("area", ""),
                record.values.get("title", ""),
                int(record.get_value() or 0),
                "",  # alert_date — enriched below
                "influx_migration",
            ))

    print(f"  Found {len(rows)} alert records in Influx.")

    # Enrich with alert_date field values
    try:
        date_query = f'''
            from(bucket: "{INFLUX_BUCKET}")
                |> range(start: -{LOOKBACK_DAYS}d)
                |> filter(fn: (r) => r["_measurement"] == "alert")
                |> filter(fn: (r) => r["_field"] == "alert_date")
                |> sort(columns: ["_time"], desc: false)
        '''
        date_lookup = {}
        for table in query_api.query(date_query):
            for record in table.records:
                key = (record.get_time().isoformat(), record.values.get("area", ""))
                date_lookup[key] = record.get_value() or ""
        rows = [
            (ts, area, title, category, date_lookup.get((ts.isoformat(), area), ""), source)
            for ts, area, title, category, _, source in rows
        ]
        print(f"  Enriched {len(date_lookup)} records with alert_date.")
    except Exception as e:
        print(f"  Warning: could not fetch alert_date field: {e}")

    if not rows:
        return 0

    inserted = 0
    batch_size = 1000
    async with pool.acquire() as conn:
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i + batch_size]
            result = await conn.executemany(
                """
                INSERT INTO alerts (ts, area, title, category, alert_date, source)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT DO NOTHING
                """,
                batch,
            )
            inserted += len(batch)
            print(f"  Inserted alerts {i + 1}-{min(i + batch_size, len(rows))}")
    print(f"  ✓ Migrated {inserted} alert rows.")
    return inserted


async def migrate_snapshots(influx: InfluxDBClient, pool: asyncpg.Pool) -> int:
    """Copy snapshot records from Influx. Returns rows inserted."""
    print("\nMigrating snapshots...")
    query_api = influx.query_api()

    snap_query = f'''
        from(bucket: "{INFLUX_BUCKET}")
            |> range(start: -{LOOKBACK_DAYS}d)
            |> filter(fn: (r) => r["_measurement"] == "snapshot")
            |> filter(fn: (r) => r["_field"] == "payload")
            |> sort(columns: ["_time"], desc: false)
    '''

    rows = []
    for table in query_api.query(snap_query):
        for record in table.records:
            ts = record.get_time()
            payload_str = record.get_value() or "[]"
            try:
                payload = json.loads(payload_str)
                count = len(payload) if isinstance(payload, list) else 0
            except json.JSONDecodeError:
                continue
            rows.append((ts, count, payload_str))

    print(f"  Found {len(rows)} snapshot records in Influx.")
    if not rows:
        return 0

    inserted = 0
    batch_size = 500
    async with pool.acquire() as conn:
        # Deduplicate by ts in the batch (Influx sometimes has exact-ts collisions)
        seen: set = set()
        for i in range(0, len(rows), batch_size):
            batch = [
                (ts, count, payload)
                for ts, count, payload in rows[i:i + batch_size]
                if ts not in seen and not seen.add(ts)
            ]
            if not batch:
                continue
            await conn.executemany(
                """
                INSERT INTO snapshots (ts, count, payload)
                VALUES ($1, $2, $3::jsonb)
                ON CONFLICT DO NOTHING
                """,
                batch,
            )
            inserted += len(batch)
            print(f"  Inserted snapshots {i + 1}-{min(i + batch_size, len(rows))}")
    print(f"  ✓ Migrated {inserted} snapshot rows.")
    return inserted


async def migrate_sqlite(pool: asyncpg.Pool) -> tuple[int, int]:
    """Copy settings and simulation_sessions from the old SQLite file.
    Returns (settings_count, sessions_count)."""
    if not SQLITE_PATH or not os.path.exists(SQLITE_PATH):
        print(f"\nSkipping SQLite migration (SQLITE_PATH='{SQLITE_PATH}' not found).")
        return (0, 0)

    print(f"\nMigrating SQLite data from {SQLITE_PATH}...")
    sq = sqlite3.connect(SQLITE_PATH)
    sq.row_factory = sqlite3.Row

    # ── settings ─────────────────────────────────────────────────────────
    settings_rows = []
    try:
        for row in sq.execute("SELECT key, value, updated_at FROM settings"):
            # Old updated_at was ISO string; pass through as timestamptz
            settings_rows.append((row["key"], row["value"], row["updated_at"]))
    except sqlite3.OperationalError as e:
        print(f"  settings table not found: {e}")

    # ── simulation_sessions ──────────────────────────────────────────────
    session_rows = []
    try:
        for row in sq.execute(
            """SELECT id, created_at, step, ground_truth, sitrep, forecasts,
                      summary, pdf_path, drive_url, updated_at
               FROM simulation_sessions"""
        ):
            session_rows.append((
                row["id"],
                row["created_at"],
                row["step"],
                row["ground_truth"],
                row["sitrep"],
                row["forecasts"],  # already JSON text, cast to jsonb in SQL
                row["summary"],
                row["pdf_path"],
                row["drive_url"],
                row["updated_at"],
            ))
    except sqlite3.OperationalError as e:
        print(f"  simulation_sessions table not found: {e}")

    sq.close()

    async with pool.acquire() as conn:
        if settings_rows:
            await conn.executemany(
                """
                INSERT INTO settings (key, value, updated_at)
                VALUES ($1, $2, $3::timestamptz)
                ON CONFLICT (key) DO UPDATE SET
                    value = EXCLUDED.value,
                    updated_at = EXCLUDED.updated_at
                """,
                settings_rows,
            )
            print(f"  ✓ Migrated {len(settings_rows)} settings rows.")

        if session_rows:
            await conn.executemany(
                """
                INSERT INTO simulation_sessions
                    (id, created_at, step, ground_truth, sitrep, forecasts,
                     summary, pdf_path, drive_url, updated_at)
                VALUES ($1, $2::timestamptz, $3, $4, $5, $6::jsonb, $7::jsonb,
                        $8, $9, $10::timestamptz)
                ON CONFLICT (id) DO UPDATE SET
                    step = EXCLUDED.step,
                    ground_truth = COALESCE(EXCLUDED.ground_truth, simulation_sessions.ground_truth),
                    sitrep = COALESCE(EXCLUDED.sitrep, simulation_sessions.sitrep),
                    forecasts = COALESCE(EXCLUDED.forecasts, simulation_sessions.forecasts),
                    summary = COALESCE(EXCLUDED.summary, simulation_sessions.summary),
                    pdf_path = COALESCE(EXCLUDED.pdf_path, simulation_sessions.pdf_path),
                    drive_url = COALESCE(EXCLUDED.drive_url, simulation_sessions.drive_url),
                    updated_at = EXCLUDED.updated_at
                """,
                session_rows,
            )
            print(f"  ✓ Migrated {len(session_rows)} simulation_sessions rows.")

    return (len(settings_rows), len(session_rows))


async def verify(pool: asyncpg.Pool):
    print("\nVerification:")
    async with pool.acquire() as conn:
        pg_alerts = await conn.fetchval("SELECT COUNT(*) FROM alerts")
        pg_snaps = await conn.fetchval("SELECT COUNT(*) FROM snapshots")
        pg_settings = await conn.fetchval("SELECT COUNT(*) FROM settings")
        pg_sims = await conn.fetchval("SELECT COUNT(*) FROM simulation_sessions")
    print(f"  alerts:              {pg_alerts}")
    print(f"  snapshots:           {pg_snaps}")
    print(f"  settings:            {pg_settings}")
    print(f"  simulation_sessions: {pg_sims}")


async def migrate():
    print(f"Connecting to InfluxDB at {INFLUX_URL}...")
    influx = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)

    dsn_display = DATABASE_URL.split("@")[1] if "@" in DATABASE_URL else DATABASE_URL
    print(f"Connecting to Postgres at {dsn_display}...")
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)

    try:
        await ensure_schema(pool)
        await migrate_alerts(influx, pool)
        await migrate_snapshots(influx, pool)
        await migrate_sqlite(pool)
        await verify(pool)
        print("\n✓ Migration complete.")
    finally:
        await pool.close()
        influx.close()


if __name__ == "__main__":
    asyncio.run(migrate())
