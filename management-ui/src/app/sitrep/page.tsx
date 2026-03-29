"use client";

import { useEffect, useState } from "react";

export default function SitrepPage() {
  const [schedule, setSchedule] = useState("");
  const [deliverTo, setDeliverTo] = useState("telegram");
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
        body: JSON.stringify({ deliver_to: targets }),
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
    <div>
      <h2 className="text-2xl font-bold mb-1">SITREP Management</h2>
      <p className="text-sm text-zinc-500 mb-6">
        Generate and deliver situation reports via the prompt runner service.
      </p>

      {/* Manual trigger */}
      <div className="rounded-lg border border-zinc-800 p-5 mb-6">
        <h3 className="font-semibold mb-3">Generate SITREP Now</h3>
        <p className="text-sm text-zinc-500 mb-4">
          Runs the <code className="text-zinc-400">daily_sitrep</code> template
          via the prompt runner and delivers results.
        </p>
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm text-zinc-400">Deliver to:</label>
          <input
            type="text"
            value={deliverTo}
            onChange={(e) => setDeliverTo(e.target.value)}
            placeholder="telegram,email"
            className="flex-1 max-w-xs bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={runSitrep}
            disabled={loading}
            className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-500 rounded font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? "Generating..." : "Generate SITREP"}
          </button>
        </div>
        {runResult && (
          <pre className="text-xs bg-zinc-900 rounded p-3 overflow-x-auto text-zinc-400 max-h-64">
            {runResult}
          </pre>
        )}
      </div>

      {/* Schedule config */}
      <div className="rounded-lg border border-zinc-800 p-5">
        <h3 className="font-semibold mb-3">Automatic Schedule</h3>
        <p className="text-sm text-zinc-500 mb-4">
          Configure when SITREPs are automatically generated and delivered.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Schedule (UTC hours or interval)
            </label>
            <input
              type="text"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder='e.g. "0,6,18" or "every:6"'
              className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
            />
            <p className="text-xs text-zinc-600 mt-1">
              Comma-separated UTC hours (0,6,18) or interval format (every:6).
              Leave empty to disable.
            </p>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Delivery targets
            </label>
            <input
              type="text"
              value={deliverTo}
              onChange={(e) => setDeliverTo(e.target.value)}
              placeholder="telegram,email"
              className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={saveSchedule}
              className="px-4 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 rounded font-medium transition-colors"
            >
              Save Schedule
            </button>
            {saveMsg && (
              <span className="text-sm text-green-400">{saveMsg}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
