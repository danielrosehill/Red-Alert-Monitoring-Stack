"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface Module {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  health: "up" | "down" | "unknown";
  requiredConfig: string[];
}

interface LogData {
  container: string;
  lines: string[];
  count: number;
}

export default function ModulesPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  // Logs viewer state
  const [logsOpen, setLogsOpen] = useState<string | null>(null);
  const [logData, setLogData] = useState<LogData | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logTail, setLogTail] = useState(100);

  // Snapcast test state
  const [snapTestOpen, setSnapTestOpen] = useState(false);
  const [snapMessage, setSnapMessage] = useState("");
  const [snapMessageKey, setSnapMessageKey] = useState("");
  const [snapMessages, setSnapMessages] = useState<Record<string, { text: string; cached: boolean }>>({});
  const [snapResult, setSnapResult] = useState<string | null>(null);
  const [snapTesting, setSnapTesting] = useState(false);

  const fetchModules = useCallback(async () => {
    try {
      const resp = await fetch(api("/api/modules"));
      const data = await resp.json();
      setModules(data.modules || []);
    } catch (err) {
      console.error("Failed to fetch modules:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModules();
    const interval = setInterval(fetchModules, 10000);
    return () => clearInterval(interval);
  }, [fetchModules]);

  async function toggleModule(id: string, enabled: boolean) {
    setToggling(id);
    try {
      await fetch(api(`/api/modules/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      setModules((prev) =>
        prev.map((m) => (m.id === id ? { ...m, enabled } : m))
      );
    } catch (err) {
      console.error("Failed to toggle module:", err);
    } finally {
      setToggling(null);
    }
  }

  async function fetchLogs(serviceId: string, tail: number = 100) {
    setLogsLoading(true);
    setLogData(null);
    try {
      const resp = await fetch(api(`/api/logs/${serviceId}?tail=${tail}`));
      const data = await resp.json();
      if (data.error) {
        setLogData({ container: serviceId, lines: [`Error: ${data.error}`], count: 0 });
      } else {
        setLogData(data);
      }
    } catch (err) {
      setLogData({ container: serviceId, lines: [`Failed to fetch logs: ${(err as Error).message}`], count: 0 });
    } finally {
      setLogsLoading(false);
    }
  }

  function openLogs(serviceId: string) {
    setLogsOpen(serviceId);
    setLogTail(100);
    fetchLogs(serviceId, 100);
  }

  function closeLogs() {
    setLogsOpen(null);
    setLogData(null);
  }

  async function openSnapTest() {
    setSnapTestOpen(true);
    setSnapResult(null);
    setSnapMessage("");
    setSnapMessageKey("");
    try {
      const resp = await fetch(api("/api/snapcast/messages"));
      const data = await resp.json();
      setSnapMessages(data.messages || {});
    } catch {
      setSnapMessages({});
    }
  }

  async function sendSnapTest() {
    setSnapTesting(true);
    setSnapResult(null);
    try {
      const body: Record<string, string> = {};
      if (snapMessage.trim()) {
        body.message = snapMessage.trim();
      } else if (snapMessageKey) {
        body.message_key = snapMessageKey;
      }
      const resp = await fetch(api("/api/snapcast/test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      setSnapResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setSnapResult(`Error: ${(e as Error).message}`);
    } finally {
      setSnapTesting(false);
    }
  }

  const healthBadge = (health: string) => {
    if (health === "up")
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          Running
        </span>
      );
    if (health === "down")
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Down
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-full px-2 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
        Unknown
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400">
        Loading modules...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Modules</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Enable or disable optional stack components. Disabled modules stay
          running but go dormant — they stop processing until re-enabled.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => (
          <div
            key={mod.id}
            className={`rounded-lg border p-4 transition-colors ${
              mod.enabled
                ? "bg-white border-zinc-200"
                : "bg-zinc-50 border-zinc-200 opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-zinc-900 truncate">
                    {mod.name}
                  </h3>
                  {healthBadge(mod.health)}
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  {mod.description}
                </p>
              </div>

              {/* Toggle switch */}
              <button
                onClick={() => toggleModule(mod.id, !mod.enabled)}
                disabled={toggling === mod.id}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
                  mod.enabled ? "bg-red-600" : "bg-zinc-300"
                } ${toggling === mod.id ? "opacity-50" : ""}`}
                role="switch"
                aria-checked={mod.enabled}
                aria-label={`Toggle ${mod.name}`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    mod.enabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Action buttons */}
            <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center gap-2">
              <button
                onClick={() => openLogs(mod.id)}
                className="text-xs text-zinc-500 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-2 py-1 rounded transition-colors"
              >
                View Logs
              </button>
              {mod.id === "snapcast-tts" && (
                <button
                  onClick={openSnapTest}
                  className="text-xs text-white bg-red-600 hover:bg-red-500 px-2 py-1 rounded transition-colors"
                >
                  Test TTS
                </button>
              )}
            </div>

            {mod.requiredConfig.length > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-100">
                <p className="text-xs text-zinc-400">
                  Requires:{" "}
                  {mod.requiredConfig.map((key, i) => (
                    <span key={key}>
                      <code className="text-xs bg-zinc-100 px-1 rounded">
                        {key}
                      </code>
                      {i < mod.requiredConfig.length - 1 && ", "}
                    </span>
                  ))}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Logs Modal */}
      {logsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">
                  Logs: {modules.find((m) => m.id === logsOpen)?.name || logsOpen}
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {logData ? `${logData.count} lines` : "Loading..."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={logTail}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setLogTail(val);
                    fetchLogs(logsOpen, val);
                  }}
                  className="text-xs border border-zinc-200 rounded px-2 py-1 bg-white text-zinc-700"
                >
                  <option value={50}>50 lines</option>
                  <option value={100}>100 lines</option>
                  <option value={200}>200 lines</option>
                  <option value={500}>500 lines</option>
                </select>
                <button
                  onClick={() => fetchLogs(logsOpen, logTail)}
                  disabled={logsLoading}
                  className="text-xs bg-zinc-100 hover:bg-zinc-200 px-2 py-1 rounded text-zinc-700 disabled:opacity-50 transition-colors"
                >
                  {logsLoading ? "Loading..." : "Refresh"}
                </button>
                <button
                  onClick={closeLogs}
                  className="text-zinc-400 hover:text-zinc-700 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-zinc-950">
              {logsLoading && !logData ? (
                <p className="text-zinc-500 text-sm font-mono">Loading logs...</p>
              ) : logData?.lines.length === 0 ? (
                <p className="text-zinc-500 text-sm font-mono">No logs available</p>
              ) : (
                <pre className="text-xs font-mono text-green-400 leading-relaxed whitespace-pre-wrap break-all">
                  {logData?.lines.join("\n")}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Snapcast Test Modal */}
      {snapTestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
              <h2 className="text-sm font-semibold text-zinc-900">Test Snapcast TTS</h2>
              <button
                onClick={() => setSnapTestOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-zinc-500">
                Send a test announcement through Snapcast speakers. Choose a predefined message or type custom text.
              </p>

              {/* Predefined messages */}
              <div>
                <label className="text-xs font-medium text-zinc-700 block mb-1.5">
                  Predefined Message
                </label>
                <select
                  value={snapMessageKey}
                  onChange={(e) => {
                    setSnapMessageKey(e.target.value);
                    if (e.target.value) setSnapMessage("");
                  }}
                  className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 bg-white text-zinc-700"
                >
                  <option value="">— Select a message —</option>
                  {Object.entries(snapMessages).map(([key, { text }]) => (
                    <option key={key} value={key}>
                      {key} — {text.slice(0, 60)}{text.length > 60 ? "..." : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-zinc-200" />
                <span className="text-xs text-zinc-400">or</span>
                <div className="flex-1 h-px bg-zinc-200" />
              </div>

              {/* Custom message */}
              <div>
                <label className="text-xs font-medium text-zinc-700 block mb-1.5">
                  Custom Text
                </label>
                <input
                  type="text"
                  value={snapMessage}
                  onChange={(e) => {
                    setSnapMessage(e.target.value);
                    if (e.target.value) setSnapMessageKey("");
                  }}
                  placeholder="Type a custom TTS message..."
                  className="w-full text-sm border border-zinc-200 rounded-md px-3 py-2 text-zinc-900 placeholder:text-zinc-400"
                />
              </div>

              <button
                onClick={sendSnapTest}
                disabled={snapTesting}
                className="w-full px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-md transition-colors disabled:opacity-50"
              >
                {snapTesting ? "Sending..." : "Send Test Announcement"}
              </button>

              {snapResult && (
                <pre className="bg-zinc-100 text-zinc-700 text-xs rounded-md p-3 overflow-x-auto max-h-32">
                  {snapResult}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
