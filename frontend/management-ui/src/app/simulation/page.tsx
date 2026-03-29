"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface SessionSummary {
  id: string;
  created_at: string;
  step: string;
  drive_url: string | null;
}

const STEP_LABELS: Record<string, string> = {
  gathering: "Gathering intelligence...",
  sitrep: "Generating SITREP...",
  forecasting: "Running 6-lens forecasts...",
  summarizing: "Writing executive summary...",
  generating_pdf: "Generating PDF...",
  uploading: "Finalizing...",
  done: "Complete",
  error: "Error",
};

const STEP_ORDER = [
  "gathering",
  "sitrep",
  "forecasting",
  "summarizing",
  "generating_pdf",
  "done",
];

export default function SimulationPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [running, setRunning] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Poll for progress while pipeline is running
  useEffect(() => {
    if (!activeSessionId) return;

    pollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(
          api(`/api/simulation/sessions?id=${activeSessionId}`)
        );
        if (resp.ok) {
          const session = await resp.json();
          setCurrentStep(session.step);
          if (session.step === "done" || session.step === "error") {
            if (pollRef.current) clearInterval(pollRef.current);
            setRunning(false);
            setActiveSessionId(null);
            if (session.step === "error") {
              setError("Pipeline failed. Check server logs for details.");
            }
            loadSessions();
          }
        }
      } catch {
        // keep polling
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeSessionId, loadSessions]);

  async function runSimulation() {
    setRunning(true);
    setError(null);
    setCurrentStep("gathering");

    try {
      const resp = await fetch(api("/api/simulation/run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliver_to: [] }),
      });
      const result = await resp.json();

      if (result.error) {
        setError(result.error);
        setRunning(false);
      } else {
        // Pipeline finished synchronously (or we got the session ID back)
        setCurrentStep("done");
        setRunning(false);
        setActiveSessionId(null);
        loadSessions();
      }
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
    }
  }

  async function deleteSession(sessionId: string) {
    if (!confirm("Delete this simulation session?")) return;
    await fetch(api(`/api/simulation/sessions?id=${sessionId}`), {
      method: "DELETE",
    });
    loadSessions();
  }

  async function sendToEmail(sessionId: string) {
    try {
      const resp = await fetch(api("/api/simulation/deliver"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId, target: "email" }),
      });
      const data = await resp.json();
      if (data.ok) alert("Sent to email.");
      else alert(`Email failed: ${data.error}`);
    } catch (e) {
      alert(`Error: ${(e as Error).message}`);
    }
  }

  async function sendToTelegram(sessionId: string) {
    try {
      const resp = await fetch(api("/api/simulation/deliver"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId, target: "telegram" }),
      });
      const data = await resp.json();
      if (data.ok) alert("Sent to Telegram.");
      else alert(`Telegram failed: ${data.error}`);
    } catch (e) {
      alert(`Error: ${(e as Error).message}`);
    }
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
        alert("Uploaded to Google Drive.");
        loadSessions();
      } else {
        alert(`Upload failed: ${data.error}`);
      }
    } catch (e) {
      alert(`Error: ${(e as Error).message}`);
    }
  }

  const stepIndex = currentStep ? STEP_ORDER.indexOf(currentStep) : -1;
  const progressPercent =
    stepIndex >= 0 ? Math.round(((stepIndex + 1) / STEP_ORDER.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-red-600">
            Red Alert Management
          </h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-zinc-600 hover:text-zinc-900">
              Dashboard
            </Link>
            <Link href="/sitrep" className="text-zinc-600 hover:text-zinc-900">
              SITREP
            </Link>
            <Link href="/simulation" className="text-red-600 font-medium">
              Forecast
            </Link>
            <Link
              href="/settings"
              className="text-zinc-600 hover:text-zinc-900"
            >
              Settings
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Generate report */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-2xl font-bold text-zinc-900 mb-1">
            Geopolitical Forecast
          </h2>
          <p className="text-sm text-zinc-500 mb-5">
            Generates a multi-lens geopolitical forecast report as a
            downloadable PDF. The pipeline gathers current intelligence, builds a
            structured SITREP, runs 6 analytical lenses in parallel, and
            produces an executive summary. Takes 2-5 minutes.
          </p>

          <button
            onClick={runSimulation}
            disabled={running}
            className="px-5 py-2.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded font-medium disabled:opacity-50 transition-colors"
          >
            {running ? "Generating..." : "Generate Report"}
          </button>

          {running && currentStep && (
            <div className="mt-5">
              <div className="flex items-center justify-between text-sm text-zinc-600 mb-2">
                <span className="flex items-center gap-2">
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
                  {STEP_LABELS[currentStep] ?? currentStep}
                </span>
                <span className="text-xs text-zinc-400">
                  {progressPercent}%
                </span>
              </div>
              <div className="w-full bg-zinc-200 rounded-full h-2">
                <div
                  className="bg-red-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3">
              {error}
            </div>
          )}
        </div>

        {/* Past reports */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-zinc-900">Past Reports</h3>
            <button
              onClick={loadSessions}
              className="px-3 py-1.5 text-xs bg-zinc-200 hover:bg-zinc-300 rounded border border-zinc-300 text-zinc-900 transition-colors"
            >
              Refresh
            </button>
          </div>

          {sessions.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No reports generated yet. Click &quot;Generate Report&quot; above
              to create your first forecast.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-zinc-500">
                    <th className="pb-2 pr-4 font-medium">Report</th>
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
                          {s.step === "done" ? "Ready" : s.step}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-3">
                          {s.step === "done" && (
                            <>
                              <a
                                href={api(`/api/simulation/pdf?id=${s.id}`)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded font-medium transition-colors"
                              >
                                Download PDF
                              </a>
                              <span className="text-zinc-300">|</span>
                              <button
                                onClick={() => sendToEmail(s.id)}
                                className="text-xs text-zinc-500 hover:text-zinc-900"
                                title="Send via email"
                              >
                                Email
                              </button>
                              <button
                                onClick={() => sendToTelegram(s.id)}
                                className="text-xs text-zinc-500 hover:text-zinc-900"
                                title="Send to Telegram"
                              >
                                Telegram
                              </button>
                              {s.drive_url ? (
                                <a
                                  href={s.drive_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-zinc-500 hover:text-zinc-900"
                                  title="Open in Google Drive"
                                >
                                  Drive
                                </a>
                              ) : (
                                <button
                                  onClick={() => uploadToDrive(s.id)}
                                  className="text-xs text-zinc-500 hover:text-zinc-900"
                                  title="Upload to Google Drive"
                                >
                                  Drive
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
