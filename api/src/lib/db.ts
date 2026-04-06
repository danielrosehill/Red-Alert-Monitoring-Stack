/**
 * Postgres database client — replaces the previous better-sqlite3 layer.
 *
 * Schema lives in db/schema.sql and is applied by the timescaledb container
 * on first boot from /docker-entrypoint-initdb.d/. This module only reads and
 * writes; it does not create tables.
 *
 * All exported functions are async. JSONB columns (forecasts, summary) are
 * returned as parsed objects — do not JSON.parse them at call sites. The
 * `sitrep` column is TEXT (stores a JSON-encoded Record<string,string>), so
 * callers still parse that one themselves.
 */

import pg from "pg";

const { Pool } = pg;

const POSTGRES_URL =
  process.env.POSTGRES_URL ||
  "postgresql://redalert:redalert-dev-password@timescaledb:5432/redalert";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: POSTGRES_URL });
    pool.on("error", (err) => {
      console.error("[db] unexpected pool error:", err);
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const { rows } = await getPool().query<{ value: string }>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const { rows } = await getPool().query<{ key: string; value: string }>(
    "SELECT key, value FROM settings",
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(key: string, value: string): Promise<void> {
  await getPool().query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_at = EXCLUDED.updated_at`,
    [key, value],
  );
}

export async function setSettings(entries: Record<string, string>): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const [key, value] of Object.entries(entries)) {
      await client.query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           updated_at = EXCLUDED.updated_at`,
        [key, value],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteSetting(key: string): Promise<void> {
  await getPool().query("DELETE FROM settings WHERE key = $1", [key]);
}

// ─── Simulation Sessions ────────────────────────────────────────────────────

export interface SimulationSessionRow {
  id: string;
  created_at: string;
  step: string;
  ground_truth: string | null;
  sitrep: string | null; // TEXT — caller parses
  forecasts: Record<string, unknown> | null; // JSONB — already parsed
  summary: unknown | null; // JSONB — already parsed
  pdf_path: string | null;
  drive_url: string | null;
  updated_at: string;
}

/** Normalize a raw pg row: created_at/updated_at come back as Date, stringify them. */
function normalizeSession(row: Record<string, unknown>): SimulationSessionRow {
  return {
    id: row.id as string,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : (row.created_at as string),
    step: row.step as string,
    ground_truth: (row.ground_truth as string | null) ?? null,
    sitrep: (row.sitrep as string | null) ?? null,
    forecasts: (row.forecasts as Record<string, unknown> | null) ?? null,
    summary: (row.summary as unknown) ?? null,
    pdf_path: (row.pdf_path as string | null) ?? null,
    drive_url: (row.drive_url as string | null) ?? null,
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : (row.updated_at as string),
  };
}

export async function listSimulationSessions(): Promise<SimulationSessionRow[]> {
  const { rows } = await getPool().query(
    "SELECT * FROM simulation_sessions ORDER BY created_at DESC",
  );
  return rows.map(normalizeSession);
}

export async function getSimulationSession(
  id: string,
): Promise<SimulationSessionRow | undefined> {
  const { rows } = await getPool().query(
    "SELECT * FROM simulation_sessions WHERE id = $1",
    [id],
  );
  return rows[0] ? normalizeSession(rows[0]) : undefined;
}

export async function upsertSimulationSession(session: {
  id: string;
  createdAt: string;
  step: string;
  groundTruth?: string | null;
  sitrep?: string | null;
  forecasts?: Record<string, unknown> | null;
  summary?: unknown | null;
  pdfPath?: string | null;
  driveUrl?: string | null;
}): Promise<void> {
  // JSONB columns accept a JSON-encoded string via $n::jsonb
  const forecastsJson =
    session.forecasts !== undefined && session.forecasts !== null
      ? JSON.stringify(session.forecasts)
      : null;
  const summaryJson =
    session.summary !== undefined && session.summary !== null
      ? JSON.stringify(session.summary)
      : null;

  await getPool().query(
    `INSERT INTO simulation_sessions
       (id, created_at, step, ground_truth, sitrep, forecasts, summary,
        pdf_path, drive_url, updated_at)
     VALUES ($1, $2::timestamptz, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, now())
     ON CONFLICT (id) DO UPDATE SET
       step         = EXCLUDED.step,
       ground_truth = COALESCE(EXCLUDED.ground_truth, simulation_sessions.ground_truth),
       sitrep       = COALESCE(EXCLUDED.sitrep,       simulation_sessions.sitrep),
       forecasts    = COALESCE(EXCLUDED.forecasts,    simulation_sessions.forecasts),
       summary      = COALESCE(EXCLUDED.summary,      simulation_sessions.summary),
       pdf_path     = COALESCE(EXCLUDED.pdf_path,     simulation_sessions.pdf_path),
       drive_url    = COALESCE(EXCLUDED.drive_url,    simulation_sessions.drive_url),
       updated_at   = now()`,
    [
      session.id,
      session.createdAt,
      session.step,
      session.groundTruth ?? null,
      session.sitrep ?? null,
      forecastsJson,
      summaryJson,
      session.pdfPath ?? null,
      session.driveUrl ?? null,
    ],
  );
}

export async function deleteSimulationSession(id: string): Promise<void> {
  await getPool().query("DELETE FROM simulation_sessions WHERE id = $1", [id]);
}
