"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Geodash exposes the export endpoints; allow override via NEXT_PUBLIC_GEODASH_URL.
const GEODASH_URL =
  process.env.NEXT_PUBLIC_GEODASH_URL || "http://localhost:8083";

type ExportInfo = {
  connected: boolean;
  total_alerts?: number;
  earliest?: string | null;
  latest?: string | null;
  configured_area?: string | null;
  error?: string;
};

export default function ExportHistoryPage() {
  const [info, setInfo] = useState<ExportInfo | null>(null);
  const [scope, setScope] = useState<"all" | "local">("all");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [fromTs, setFromTs] = useState("");
  const [toTs, setToTs] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${GEODASH_URL}/api/alert-export/info`)
      .then((r) => r.json())
      .then(setInfo)
      .catch((e) => setInfo({ connected: false, error: String(e) }));
  }, []);

  function buildUrl(): string {
    const params = new URLSearchParams();
    params.set("format", format);
    params.set("scope", scope);
    if (fromTs) params.set("from_ts", new Date(fromTs).toISOString());
    if (toTs) params.set("to_ts", new Date(toTs).toISOString());
    return `${GEODASH_URL}/api/alert-export?${params.toString()}`;
  }

  async function download() {
    setBusy(true);
    setMsg(null);
    try {
      const url = buildUrl();
      const resp = await fetch(url);
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`${resp.status}: ${text}`);
      }
      const blob = await resp.blob();
      const dispo = resp.headers.get("Content-Disposition") || "";
      const match = dispo.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `alert-history.${format}`;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      setMsg(`Downloaded ${filename}`);
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    }
    setBusy(false);
  }

  const localDisabled = !info?.configured_area;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-red-600">Red Alert Management</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-zinc-600 hover:text-zinc-900">Dashboard</Link>
            <Link href="/sitrep" className="text-zinc-600 hover:text-zinc-900">SITREP</Link>
            <Link href="/simulation" className="text-zinc-600 hover:text-zinc-900">Simulation</Link>
            <Link href="/export-history" className="text-red-600 font-medium">Export History</Link>
            <Link href="/settings" className="text-zinc-600 hover:text-zinc-900">Settings</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 mb-1">Export Alert History</h2>
          <p className="text-sm text-zinc-500">
            Download saved alerts from Postgres as CSV or JSON. Filter by date range
            and either the whole country or your configured monitoring area.
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5 text-sm">
          <h3 className="font-semibold text-zinc-900 mb-3">Database</h3>
          {!info && <p className="text-zinc-500">Loading…</p>}
          {info && !info.connected && (
            <p className="text-red-600">Postgres not connected{info.error ? `: ${info.error}` : ""}</p>
          )}
          {info?.connected && (
            <ul className="space-y-1 text-zinc-700">
              <li>Total alerts stored: <strong>{info.total_alerts?.toLocaleString()}</strong></li>
              <li>Earliest: {info.earliest || "—"}</li>
              <li>Latest: {info.latest || "—"}</li>
              <li>
                Configured area (ALERT_AREA):{" "}
                {info.configured_area ? (
                  <code className="bg-zinc-100 px-1 rounded">{info.configured_area}</code>
                ) : (
                  <span className="text-zinc-400">not set</span>
                )}
              </li>
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5 space-y-4">
          <h3 className="font-semibold text-zinc-900">Export Options</h3>

          <div>
            <label className="block text-sm text-zinc-600 mb-1">Scope</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  value="all"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                  className="accent-red-600"
                />
                Whole country
              </label>
              <label className={`flex items-center gap-2 ${localDisabled ? "opacity-50" : ""}`}>
                <input
                  type="radio"
                  name="scope"
                  value="local"
                  checked={scope === "local"}
                  disabled={localDisabled}
                  onChange={() => setScope("local")}
                  className="accent-red-600"
                />
                My monitoring area
                {info?.configured_area && (
                  <span className="text-zinc-500">({info.configured_area})</span>
                )}
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-600 mb-1">From (optional)</label>
              <input
                type="datetime-local"
                value={fromTs}
                onChange={(e) => setFromTs(e.target.value)}
                className="w-full bg-white border border-zinc-300 rounded px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-600 mb-1">To (optional)</label>
              <input
                type="datetime-local"
                value={toTs}
                onChange={(e) => setToTs(e.target.value)}
                className="w-full bg-white border border-zinc-300 rounded px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-zinc-400">
            Leave both date fields empty to export the entire database.
          </p>

          <div>
            <label className="block text-sm text-zinc-600 mb-1">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as "csv" | "json")}
              className="bg-white border border-zinc-300 rounded px-3 py-1.5 text-sm"
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={download}
              disabled={busy}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded font-medium disabled:opacity-50"
            >
              {busy ? "Exporting…" : "Download Export"}
            </button>
            {msg && <span className="text-sm text-zinc-600">{msg}</span>}
          </div>
        </div>
      </main>
    </div>
  );
}
