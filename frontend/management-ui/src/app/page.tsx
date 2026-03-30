"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

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
  const [pushoverResult, setPushoverResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(api("/api/health"));
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
      const resp = await fetch(api("/api/alerts/test"), {
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

  async function testPushover() {
    setPushoverResult("Sending...");
    try {
      const resp = await fetch(api("/api/notifications/test-pushover"), {
        method: "POST",
      });
      const result = await resp.json();
      setPushoverResult(result.message || JSON.stringify(result, null, 2));
    } catch (e) {
      setPushoverResult(`Error: ${(e as Error).message}`);
    }
  }

  const upCount = data
    ? Object.values(data.statuses).filter((s) => s.status === "up").length
    : 0;
  const totalCount = data ? Object.keys(data.statuses).length : 0;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-red-600">Red Alert Management</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-red-600 font-medium">Dashboard</Link>
            <Link href="/sitrep" className="text-zinc-600 hover:text-zinc-900">SITREP</Link>
            <Link href="/simulation" className="text-zinc-600 hover:text-zinc-900">Simulation</Link>
            <Link href="/settings" className="text-zinc-600 hover:text-zinc-900">Settings</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Service Health */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900">Dashboard</h2>
              <p className="text-sm text-zinc-500 mt-1">
                {data?.checkedAt
                  ? `Last checked: ${new Date(data.checkedAt).toLocaleTimeString()}`
                  : "Loading..."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-600">
                {upCount}/{totalCount} services up
              </span>
              <button
                onClick={refresh}
                disabled={loading}
                className="px-3 py-1.5 text-sm bg-zinc-200 hover:bg-zinc-300 rounded border border-zinc-300 text-zinc-900 disabled:opacity-50 transition-colors"
              >
                {loading ? "Checking..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {data &&
              Object.entries(data.services).map(([id, svc]) => {
                const status = data.statuses[id];
                const isUp = status?.status === "up";
                const isDown = status?.status === "down";

                return (
                  <div
                    key={id}
                    className={`rounded-lg border p-5 ${
                      isUp
                        ? "border-green-300 bg-green-50"
                        : isDown
                        ? "border-red-300 bg-red-50"
                        : "border-zinc-200 bg-zinc-100"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-sm text-zinc-900">{svc.name}</h3>
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          isUp
                            ? "text-green-600"
                            : isDown
                            ? "text-red-600"
                            : "text-zinc-500"
                        }`}
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            isUp
                              ? "bg-green-500"
                              : isDown
                              ? "bg-red-500"
                              : "bg-zinc-400"
                          }`}
                        />
                        {status?.status ?? "unknown"}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mb-2">{svc.description}</p>
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span>:{svc.port}</span>
                      {svc.uiUrl && (
                        <a
                          href={svc.uiUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-red-600 hover:underline"
                        >
                          Open UI
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </section>

        {/* Test Alerts */}
        <section>
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <h3 className="font-semibold text-zinc-900 mb-3">Test Alerts</h3>
            <p className="text-sm text-zinc-500 mb-4">
              Send a test alert through the actuator to verify the alert pipeline.
            </p>
            <div className="flex flex-wrap gap-3 mb-4">
              {["red_alert", "early_warning", "all_clear"].map((type) => (
                <button
                  key={type}
                  onClick={() => sendTestAlert(type)}
                  className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                    type === "red_alert"
                      ? "bg-red-600 hover:bg-red-500 text-white"
                      : type === "early_warning"
                      ? "bg-yellow-500 hover:bg-yellow-400 text-white"
                      : "bg-green-600 hover:bg-green-500 text-white"
                  }`}
                >
                  {type === "red_alert" ? "Red Alert" : type === "early_warning" ? "Alerts Expected" : "All Clear"}
                </button>
              ))}
            </div>
            {testResult && (
              <pre className="bg-zinc-100 text-zinc-700 text-sm rounded-md p-3 overflow-x-auto max-h-48">
                {testResult}
              </pre>
            )}
          </div>
        </section>

        {/* Test Pushover */}
        <section>
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <h3 className="font-semibold text-zinc-900 mb-3">Notifications</h3>
            <p className="text-sm text-zinc-500 mb-4">
              Test push notification delivery via Pushover.
            </p>
            <button
              onClick={testPushover}
              className="px-4 py-2 text-sm bg-zinc-200 hover:bg-zinc-300 text-zinc-900 rounded font-medium transition-colors"
            >
              Test Pushover
            </button>
            {pushoverResult && (
              <pre className="mt-4 bg-zinc-100 text-zinc-700 text-sm rounded-md p-3 overflow-x-auto max-h-48">
                {pushoverResult}
              </pre>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
