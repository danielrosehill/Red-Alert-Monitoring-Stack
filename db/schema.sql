-- Red Alert Monitoring Stack — Unified Postgres/Timescale schema
--
-- This replaces the previous split of InfluxDB (time-series) +
-- SQLite (settings/simulation). One database, one backup, real SQL joins.
--
-- Run this against a fresh timescaledb/timescaledb:latest-pg16 instance.
-- The migrate_influx_to_pg.py script executes this schema idempotently
-- before copying historical data across.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ─── Time-series: alerts ────────────────────────────────────────────────────
-- One row per area per poll that saw an alert. Used by live map, timeline,
-- per-area history, latency analysis.

CREATE TABLE IF NOT EXISTS alerts (
    ts          TIMESTAMPTZ NOT NULL,
    area        TEXT        NOT NULL,
    title       TEXT        NOT NULL DEFAULT '',
    category    SMALLINT    NOT NULL DEFAULT 0,
    alert_date  TEXT        NOT NULL DEFAULT '',
    source      TEXT                 DEFAULT 'oref'  -- 'oref' | 'inferred' | 'test' | 'influx_migration'
);

SELECT create_hypertable('alerts', 'ts', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_alerts_ts           ON alerts (ts DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_area_ts      ON alerts (area, ts DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_category_ts  ON alerts (category, ts DESC);

-- ─── Time-series: snapshots ─────────────────────────────────────────────────
-- One row per poll containing the full raw Oref payload. Used for timeline
-- replay and format-sample inspection. JSONB so we can query into it.

CREATE TABLE IF NOT EXISTS snapshots (
    ts       TIMESTAMPTZ NOT NULL,
    count    INTEGER     NOT NULL,
    payload  JSONB       NOT NULL
);

SELECT create_hypertable('snapshots', 'ts', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots (ts DESC);

-- ─── Relational: key/value settings ─────────────────────────────────────────
-- Ported from api/src/lib/db.ts (previously SQLite).

CREATE TABLE IF NOT EXISTS settings (
    key        TEXT        PRIMARY KEY,
    value      TEXT        NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Relational: simulation sessions ────────────────────────────────────────
-- Ported from api/src/lib/db.ts. JSON fields upgraded to JSONB.

CREATE TABLE IF NOT EXISTS simulation_sessions (
    id            TEXT        PRIMARY KEY,
    created_at    TIMESTAMPTZ NOT NULL,
    step          TEXT        NOT NULL DEFAULT 'idle',
    ground_truth  TEXT,
    sitrep        TEXT,
    forecasts     JSONB,
    summary       JSONB,
    pdf_path      TEXT,
    drive_url     TEXT,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_simulation_sessions_created_at
    ON simulation_sessions (created_at DESC);
