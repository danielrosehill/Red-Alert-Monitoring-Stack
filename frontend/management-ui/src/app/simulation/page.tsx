"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface SessionSummary {
  id: string;
  created_at: string;
  step: string;
  drive_url: string | null;
}

export default function SimulationPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [running, setRunning] = useState(false);
  const [deliverTo, setDeliverTo] = useState<string[]>(["email"]);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const resp = await fetch(api("/api/simulation/sessions"));
      setSessions(await resp.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  function toggleDelivery(target: string) {
    setDeliverTo((prev) =>
      prev.includes(target)
        ? prev.filter((t) => t !== target)
        : [...prev, target]
    );
  }

  async function runSimulation() {
    setRunning(true);
    setRunResult(null);
    setProgress("Starting pipeline...");

    try {
      const resp = await fetch(api("/api/simulation/run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliver_to: deliverTo }),
      });
      const result = await resp.json();

      if (result.error) {
        setProgress(null);
        setRunResult(`Error: ${result.error}`);
      } else {
        setProgress(null);
        setRunResult(
          `Simulation complete! Session: ${result.sessionId?.slice(0, 8)}\n` +
            `Step: ${result.step}\n` +
            (result.driveUrl ? `Google Drive: ${result.driveUrl}\n` : "") +
            (result.deliveryResults
              ? `Delivery: ${JSON.stringify(result.deliveryResults, null, 2)}`
              : "")
        );
        loadSessions();
      }
    } catch (e) {
      setProgress(null);
      setRunResult(`Error: ${(e as Error).message}`);
    }

    setRunning(false);
  }

  async function uploadToDrive(sessionId: string) {
    try {
      const resp = await fetch(api("/api/simulation/upload"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId }),
      });
      const data = await resp.json();
      if (data.url) {
        alert(`Uploaded! ${data.url}`);
        loadSessions();
      } else {
        alert(`Upload failed: ${data.error}`);
      }
    } catch (e) {
      alert(`Error: ${(e as Error).message}`);
    }
  }

  async function deleteSession(sessionId: string) {
    if (!confirm("Delete this simulation session?")) return;
    await fetch(api(`/api/simulation/sessions?id=${sessionId}`), {
      method: "DELETE",
    });
    loadSessions();
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-red-600">Red Alert Management</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-zinc-600 hover:text-zinc-900">Dashboard</Link>
            <Link href="/sitrep" className="text-zinc-600 hover:text-zinc-900">SITREP</Link>
            <Link href="/simulation" className="text-red-600 font-medium">Simulation</Link>
            <Link href="/settings" className="text-zinc-600 hover:text-zinc-900">Settings</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 mb-1">Geopolitical Simulation</h2>
          <p className="text-sm text-zinc-500 mb-6">
            Run the full 6-stage geopolitical forecasting pipeline: intelligence
            gathering, SITREP, 6-lens forecasts, executive summary, PDF report, and
            delivery.
          </p>
        </div>

        {/* Run simulation */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h3 className="font-semibold text-zinc-900 mb-3">Run New Simulation</h3>
          <p className="text-sm text-zinc-500 mb-4">
            This runs the full pipeline. It makes multiple LLM calls across 6
            analytical lenses and takes several minutes to complete.
          </p>

          <div className="mb-4">
            <label className="block text-sm text-zinc-600 mb-2">
              Deliver results to:
            </label>
            <div className="flex gap-4">
              {["email", "telegram", "drive"].map((target) => (
                <label
                  key={target}
                  className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={deliverTo.includes(target)}
                    onChange={() => toggleDelivery(target)}
                    className="accent-red-600"
                  />
                  {target === "drive" ? "Google Drive" : target}
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={runSimulation}
            disabled={running}
            className="px-5 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded font-medium disabled:opacity-50 transition-colors"
          >
            {running ? "Running Pipeline..." : "Run Simulation"}
          </button>

          {progress && (
            <div className="mt-4 flex items-center gap-2 text-sm text-zinc-600">
              <svg
                className="animate-spin h-4 w-4 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              {progress}
            </div>
          )}

          {runResult && (
            <pre className="mt-4 bg-zinc-100 text-zinc-700 text-sm rounded-md p-3 overflow-x-auto max-h-64 whitespace-pre-wrap">
              {runResult}
            </pre>
          )}
        </div>

        {/* Past sessions */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-zinc-900">Past Simulations</h3>
            <button
              onClick={loadSessions}
              className="px-3 py-1.5 text-xs bg-zinc-200 hover:bg-zinc-300 rounded border border-zinc-300 text-zinc-900 transition-colors"
            >
              Refresh
            </button>
          </div>

          {sessions.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No simulations run yet. Start one above.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-zinc-500">
                    <th className="pb-2 pr-4 font-medium">Session</th>
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-zinc-200 hover:bg-zinc-50"
                    >
                      <td className="py-2.5 pr-4 font-mono text-xs text-zinc-600">
                        {s.id.slice(0, 8)}
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-600">
                        {new Date(s.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            s.step === "done"
                              ? "bg-green-50 border border-green-300 text-green-600"
                              : s.step === "error"
                              ? "bg-red-50 border border-red-300 text-red-600"
                              : "bg-zinc-100 border border-zinc-300 text-zinc-600"
                          }`}
                        >
                          {s.step}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          {s.step === "done" && (
                            <>
                              <a
                                href={api(`/api/simulation/pdf?id=${s.id}`)}
                                className="text-xs text-red-600 hover:underline font-medium"
                              >
                                PDF
                              </a>
                              {s.drive_url ? (
                                <a
                                  href={s.drive_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-red-600 hover:underline font-medium"
                                >
                                  Drive
                                </a>
                              ) : (
                                <button
                                  onClick={() => uploadToDrive(s.id)}
                                  className="text-xs text-zinc-600 hover:text-zinc-900"
                                >
                                  Upload to Drive
                                </button>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => deleteSession(s.id)}
                            className="text-xs text-zinc-400 hover:text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
