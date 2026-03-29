"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function SitrepPage() {
  const [schedule, setSchedule] = useState("");
  const [deliverTo, setDeliverTo] = useState("telegram");
  const [saveToDrive, setSaveToDrive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sitrep/schedule")
      .then((r) => r.json())
      .then((data) => {
        setSchedule(data.schedule || "");
        setDeliverTo(data.deliver_to || "telegram");
      });
  }, []);

  async function runSitrep() {
    setLoading(true);
    setRunResult(null);
    try {
      const targets = deliverTo.split(",").map((s) => s.trim());
      const resp = await fetch("/api/sitrep/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliver_to: targets, save_to_drive: saveToDrive }),
      });
      const data = await resp.json();
      setRunResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setRunResult(`Error: ${(e as Error).message}`);
    }
    setLoading(false);
  }

  async function saveSchedule() {
    setSaveMsg(null);
    try {
      await fetch("/api/sitrep/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule, deliver_to: deliverTo }),
      });
      setSaveMsg("Schedule saved");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch {
      setSaveMsg("Failed to save");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-red-600">Red Alert Management</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-zinc-600 hover:text-zinc-900">Dashboard</Link>
            <Link href="/sitrep" className="text-red-600 font-medium">SITREP</Link>
            <Link href="/simulation" className="text-zinc-600 hover:text-zinc-900">Simulation</Link>
            <Link href="/settings" className="text-zinc-600 hover:text-zinc-900">Settings</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 mb-1">SITREP Management</h2>
          <p className="text-sm text-zinc-500 mb-6">
            Generate and deliver situation reports via the prompt runner service.
            SITREPs are automatically saved as PDFs locally.
          </p>
        </div>

        {/* Manual trigger */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h3 className="font-semibold text-zinc-900 mb-3">Generate SITREP Now</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Runs the <code className="text-zinc-700 bg-zinc-100 px-1 rounded">daily_sitrep</code> template
            via the prompt runner, generates a PDF, and delivers results.
          </p>
          <div className="space-y-3 mb-4">
            <div className="flex items-center gap-3">
              <label className="text-sm text-zinc-600">Deliver to:</label>
              <input
                type="text"
                value={deliverTo}
                onChange={(e) => setDeliverTo(e.target.value)}
                placeholder="telegram,email"
                className="flex-1 max-w-xs bg-white border border-zinc-300 rounded px-3 py-1.5 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
              <input
                type="checkbox"
                checked={saveToDrive}
                onChange={(e) => setSaveToDrive(e.target.checked)}
                className="accent-red-600"
              />
              Upload PDF to Google Drive
            </label>
          </div>
          <button
            onClick={runSitrep}
            disabled={loading}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? "Generating..." : "Generate SITREP"}
          </button>
          {runResult && (
            <pre className="mt-4 bg-zinc-100 text-zinc-700 text-sm rounded-md p-3 overflow-x-auto max-h-64">
              {runResult}
            </pre>
          )}
        </div>

        {/* Schedule config */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h3 className="font-semibold text-zinc-900 mb-3">Automatic Schedule</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Configure when SITREPs are automatically generated and delivered.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-600 mb-1">
                Schedule (UTC hours or interval)
              </label>
              <input
                type="text"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder='e.g. "0,6,18" or "every:6"'
                className="w-full max-w-md bg-white border border-zinc-300 rounded px-3 py-1.5 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400"
              />
              <p className="text-xs text-zinc-400 mt-1">
                Comma-separated UTC hours (0,6,18) or interval format (every:6).
                Leave empty to disable.
              </p>
            </div>

            <div>
              <label className="block text-sm text-zinc-600 mb-1">
                Delivery targets
              </label>
              <input
                type="text"
                value={deliverTo}
                onChange={(e) => setDeliverTo(e.target.value)}
                placeholder="telegram,email"
                className="w-full max-w-md bg-white border border-zinc-300 rounded px-3 py-1.5 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={saveSchedule}
                className="px-4 py-2 text-sm bg-zinc-200 hover:bg-zinc-300 text-zinc-900 rounded font-medium transition-colors"
              >
                Save Schedule
              </button>
              {saveMsg && (
                <span className="text-sm text-green-600">{saveMsg}</span>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
