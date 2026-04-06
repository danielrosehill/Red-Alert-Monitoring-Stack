-- 002_dedup_alerts.sql
--
-- One-time cleanup: collapse the alerts hypertable so each (area, category)
-- alert event is stored exactly once instead of once per poll cycle.
--
-- Why: the original geodash writer (and the InfluxDB schema before it)
-- inserted one row per area per poll. A sustained 100-area event lasting
-- 5 minutes produced ~2,000 rows when the meaningful information is 100
-- state-transitions. The /api/alert-log endpoint already deduplicates at
-- read time within a 3-minute window — this migration applies the same
-- rule once at the storage layer.
--
-- Strategy: rebuild the hypertable from a window-function query that keeps
-- only rows where the previous row for the same (area, category) is more
-- than 3 minutes earlier (or there is no previous row).
--
-- Safe to re-run: idempotent on the result. Wraps in a transaction so a
-- failure leaves the original table untouched.
--
-- Run with:
--   docker exec -i timescaledb psql -U redalert -d redalert \
--     < db/migrations/002_dedup_alerts.sql

\timing on
\set ON_ERROR_STOP on

BEGIN;

-- Snapshot pre-migration counts for the report at the end.
CREATE TEMP TABLE _dedup_stats AS
SELECT count(*) AS before_count FROM alerts;

-- Build the deduplicated set into a temp table first so we can validate
-- before touching the live hypertable.
CREATE TEMP TABLE alerts_keep ON COMMIT DROP AS
SELECT ts, area, title, category, alert_date, source
FROM (
    SELECT
        ts, area, title, category, alert_date, source,
        LAG(ts) OVER (PARTITION BY area, category ORDER BY ts) AS prev_ts
    FROM alerts
) t
WHERE prev_ts IS NULL
   OR ts - prev_ts > INTERVAL '3 minutes';

-- Sanity check: must have at least one row, and never more than the original.
DO $$
DECLARE
    keep_count BIGINT;
    orig_count BIGINT;
BEGIN
    SELECT count(*) INTO keep_count FROM alerts_keep;
    SELECT before_count INTO orig_count FROM _dedup_stats;
    IF keep_count = 0 AND orig_count > 0 THEN
        RAISE EXCEPTION 'Dedup produced 0 rows from % originals — aborting', orig_count;
    END IF;
    IF keep_count > orig_count THEN
        RAISE EXCEPTION 'Dedup produced more rows (%) than original (%) — aborting', keep_count, orig_count;
    END IF;
END $$;

-- Replace the hypertable contents in place. TRUNCATE on a hypertable drops
-- all chunks, which is exactly what we want — much cheaper than DELETE.
TRUNCATE alerts;

INSERT INTO alerts (ts, area, title, category, alert_date, source)
SELECT ts, area, title, category, alert_date, source
FROM alerts_keep
ORDER BY ts;

-- Drop the redundant ts index (alerts_ts_idx is auto-created by the
-- hypertable; idx_alerts_ts from schema.sql duplicates it).
DROP INDEX IF EXISTS idx_alerts_ts;

-- Add a 2-year retention policy so even with sustained writes the
-- hypertable can't grow without bound. Idempotent.
SELECT add_retention_policy('alerts', INTERVAL '2 years', if_not_exists => TRUE);

-- Final report.
SELECT
    (SELECT before_count FROM _dedup_stats)         AS rows_before,
    (SELECT count(*) FROM alerts)                   AS rows_after,
    (SELECT before_count FROM _dedup_stats)
        - (SELECT count(*) FROM alerts)             AS rows_removed,
    round(
        100.0 * (1 - (SELECT count(*) FROM alerts)::numeric
                     / NULLIF((SELECT before_count FROM _dedup_stats), 0)),
        2
    )                                                AS pct_reduction;

COMMIT;

VACUUM ANALYZE alerts;
