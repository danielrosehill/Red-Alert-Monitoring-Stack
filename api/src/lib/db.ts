import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "management.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Settings table — key-value store for stack configuration
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Simulation sessions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS simulation_sessions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        step TEXT NOT NULL DEFAULT 'idle',
        ground_truth TEXT,
        sitrep TEXT,
        forecasts TEXT,
        summary TEXT,
        pdf_path TEXT,
        drive_url TEXT,
        updated_at TEXT NOT NULL
      )
    `);
  }
  return db;
}

// ─── Settings ───

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb()
    .prepare("SELECT key, value FROM settings")
    .all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, new Date().toISOString());
}

export function setSettings(entries: Record<string, string>): void {
  const stmt = getDb().prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  const now = new Date().toISOString();
  const tx = getDb().transaction(() => {
    for (const [key, value] of Object.entries(entries)) {
      stmt.run(key, value, now);
    }
  });
  tx();
}

export function deleteSetting(key: string): void {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
}

// ─── Simulation Sessions ───

export interface SimulationSessionRow {
  id: string;
  created_at: string;
  step: string;
  ground_truth: string | null;
  sitrep: string | null;
  forecasts: string | null;
  summary: string | null;
  pdf_path: string | null;
  drive_url: string | null;
  updated_at: string;
}

export function listSimulationSessions(): SimulationSessionRow[] {
  return getDb()
    .prepare("SELECT * FROM simulation_sessions ORDER BY created_at DESC")
    .all() as SimulationSessionRow[];
}

export function getSimulationSession(id: string): SimulationSessionRow | undefined {
  return getDb()
    .prepare("SELECT * FROM simulation_sessions WHERE id = ?")
    .get(id) as SimulationSessionRow | undefined;
}

export function upsertSimulationSession(session: {
  id: string;
  createdAt: string;
  step: string;
  groundTruth?: string | null;
  sitrep?: string | null;
  forecasts?: Record<string, unknown> | null;
  summary?: unknown | null;
  pdfPath?: string | null;
  driveUrl?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO simulation_sessions (id, created_at, step, ground_truth, sitrep, forecasts, summary, pdf_path, drive_url, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         step = excluded.step,
         ground_truth = COALESCE(excluded.ground_truth, simulation_sessions.ground_truth),
         sitrep = COALESCE(excluded.sitrep, simulation_sessions.sitrep),
         forecasts = COALESCE(excluded.forecasts, simulation_sessions.forecasts),
         summary = COALESCE(excluded.summary, simulation_sessions.summary),
         pdf_path = COALESCE(excluded.pdf_path, simulation_sessions.pdf_path),
         drive_url = COALESCE(excluded.drive_url, simulation_sessions.drive_url),
         updated_at = excluded.updated_at`
    )
    .run(
      session.id,
      session.createdAt,
      session.step,
      session.groundTruth ?? null,
      session.sitrep ?? null,
      session.forecasts ? JSON.stringify(session.forecasts) : null,
      session.summary ? JSON.stringify(session.summary) : null,
      session.pdfPath ?? null,
      session.driveUrl ?? null,
      new Date().toISOString()
    );
}

export function deleteSimulationSession(id: string): void {
  getDb().prepare("DELETE FROM simulation_sessions WHERE id = ?").run(id);
}
