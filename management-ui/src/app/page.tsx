"use client";

import { useEffect, useState, useCallback } from "react";

interface ServiceDef {
  name: string;
  description: string;
  port: number;
  uiUrl?: string;
}

interface ServiceStatus {
  status: "up" | "down" | "unknown";
  code?: number;
  error?: string;
}

interface HealthData {
  services: Record<string, ServiceDef>;
  statuses: Record<string, ServiceStatus>;
  checkedAt: string;
}

export default function DashboardPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/health");
      setData(await resp.json());
    } catch {
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function sendTestAlert(type: string) {
    setTestResult("Sending...");
    try {
      const resp = await fetch("/api/test-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_type: type }),
      });
      const result = await resp.json();
      setTestResult(JSON.stringify(result, null, 2));
    } catch (e) {
      setTestResult(`Error: ${(e as Error).message}`);
    }
  }

  const upCount = data
    ? Object.values(data.statuses).filter((s) => s.status === "up").length
    : 0;
  const totalCount = data ? Object.keys(data.statuses).length : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-sm text-zinc-500 mt-1">
            {data?.checkedAt
              ? `Last checked: ${new Date(data.checkedAt).toLocaleTimeString()}`
              : "Loading..."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">
            {upCount}/{totalCount} services up
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Checking..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Service grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {data &&
          Object.entries(data.services).map(([id, svc]) => {
            const status = data.statuses[id];
            const isUp = status?.status === "up";
            const isDown = status?.status === "down";

            return (
              <div
                key={id}
                className={`rounded-lg border p-4 ${
                  isUp
                    ? "border-green-800/50 bg-green-950/20"
                    : isDown
                    ? "border-red-800/50 bg-red-950/20"
                    : "border-zinc-800 bg-zinc-900/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">{svc.name}</h3>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      isUp
                        ? "text-green-400"
                        : isDown
                        ? "text-red-400"
                        : "text-zinc-500"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isUp
                          ? "bg-green-400"
                          : isDown
                          ? "bg-red-400"
                          : "bg-zinc-600"
                      }`}
                    />
                    {status?.status ?? "unknown"}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mb-2">{svc.description}</p>
                <div className="flex items-center justify-between text-xs text-zinc-600">
                  <span>:{svc.port}</span>
                  {svc.uiUrl && (
                    <a
                      href={svc.uiUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      Open UI
                    </a>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {/* Test alerts */}
      <div className="rounded-lg border border-zinc-800 p-5">
        <h3 className="font-semibold mb-3">Test Alerts</h3>
        <p className="text-sm text-zinc-500 mb-4">
          Send a test alert through the actuator to verify the alert pipeline.
        </p>
        <div className="flex gap-2 mb-4">
          {["red_alert", "early_warning", "all_clear"].map((type) => (
            <button
              key={type}
              onClick={() => sendTestAlert(type)}
              className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                type === "red_alert"
                  ? "border-red-700 bg-red-950/50 hover:bg-red-900/50 text-red-300"
                  : type === "early_warning"
                  ? "border-yellow-700 bg-yellow-950/50 hover:bg-yellow-900/50 text-yellow-300"
                  : "border-green-700 bg-green-950/50 hover:bg-green-900/50 text-green-300"
              }`}
            >
              {type.replace("_", " ")}
            </button>
          ))}
        </div>
        {testResult && (
          <pre className="text-xs bg-zinc-900 rounded p-3 overflow-x-auto text-zinc-400 max-h-48">
            {testResult}
          </pre>
        )}
      </div>
    </div>
  );
}
