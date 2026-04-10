"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { daytimePosture, nighttimePosture, type ReadinessPosture } from "@/lib/sops";

/* ── Types ── */

interface Alert {
  data: string[];
  cat: string;
  title: string;
  desc: string;
}

interface AlertHistory {
  alerts: Alert[];
  timestamp?: string;
}

/* ── Kan TV embed ── */
// Kan 11 live YouTube stream — official Israeli public broadcaster
const KAN_EMBED_URL = "https://www.youtube.com/embed/live_stream?channel=UCIIbMho3CK21NiE0MYbXaBA&autoplay=1&mute=1";

/* ── Posture selector based on time of day ── */
function getActivePosture(): { posture: ReadinessPosture; label: string } {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 22) {
    return { posture: daytimePosture, label: "Daytime" };
  }
  return { posture: nighttimePosture, label: "Nighttime" };
}

/* ── Checklist panel ── */
function ReadinessChecklist() {
  const { posture, label } = getActivePosture();
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const totalItems = posture.sections.reduce((n, s) => n + s.items.length, 0);
  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wide">
            Readiness Posture
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">{label} checklist</p>
        </div>
        <span className="text-xs font-medium text-zinc-500">
          {checkedCount}/{totalItems}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-zinc-200 rounded-full h-1.5 mb-4">
        <div
          className="bg-green-500 h-1.5 rounded-full transition-all"
          style={{ width: `${totalItems ? (checkedCount / totalItems) * 100 : 0}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {posture.sections.map((section) => (
          <div key={section.name}>
            <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-2">
              {section.icon && <span className="mr-1">{section.icon}</span>}
              {section.name}
            </h3>
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.id}>
                  <label className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={!!checked[item.id]}
                      onChange={() => toggle(item.id)}
                      className="mt-0.5 accent-green-600 shrink-0"
                    />
                    <span
                      className={`text-xs leading-snug ${
                        checked[item.id]
                          ? "text-zinc-400 line-through"
                          : "text-zinc-800 group-hover:text-zinc-900"
                      }`}
                    >
                      {item.item}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-zinc-200">
        <Link
          href="/sops"
          className="text-xs text-red-600 hover:text-red-700 font-medium"
        >
          View all SOPs &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ── Alerts panel ── */
function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [history, setHistory] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [currentResp, historyResp] = await Promise.all([
        fetch(api("/api/alerts")).catch(() => null),
        fetch(api("/api/alerts/history")).catch(() => null),
      ]);

      if (currentResp?.ok) {
        const data = await currentResp.json();
        setAlerts(Array.isArray(data) ? data : data?.alerts ?? []);
      }
      if (historyResp?.ok) {
        const data: AlertHistory = await historyResp.json();
        setHistory(Array.isArray(data) ? data : data?.alerts ?? []);
      }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const hasActive = alerts.length > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wide">
          Alerts
        </h2>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              hasActive ? "bg-red-500 animate-pulse" : "bg-green-500"
            }`}
          />
          <span className="text-xs text-zinc-500">
            {hasActive ? "ACTIVE" : "Clear"}
          </span>
        </div>
      </div>

      {loading && (
        <p className="text-xs text-zinc-400 animate-pulse">Loading...</p>
      )}

      {error && (
        <div className="rounded bg-red-50 border border-red-200 p-2 mb-3">
          <p className="text-xs text-red-600">Connection error: {error}</p>
        </div>
      )}

      {/* Active alerts */}
      {hasActive && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">
            Active Now
          </h3>
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className="rounded border border-red-300 bg-red-50 p-3"
              >
                <p className="text-sm font-semibold text-red-800">
                  {alert.title}
                </p>
                {alert.desc && (
                  <p className="text-xs text-red-600 mt-1">{alert.desc}</p>
                )}
                {alert.data?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {alert.data.map((area, j) => (
                      <span
                        key={j}
                        className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No active — calm state */}
      {!hasActive && !loading && (
        <div className="rounded border border-green-200 bg-green-50 p-4 mb-4 text-center">
          <p className="text-sm font-medium text-green-700">
            No active alerts
          </p>
          <p className="text-xs text-green-600 mt-1">
            Monitoring Pikud HaOref
          </p>
        </div>
      )}

      {/* Recent history */}
      <div className="flex-1 overflow-y-auto">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
          Recent History
        </h3>
        {history.length === 0 && (
          <p className="text-xs text-zinc-400">No recent alerts</p>
        )}
        <div className="space-y-1.5">
          {history.slice(0, 20).map((alert, i) => (
            <div
              key={i}
              className="rounded border border-zinc-200 bg-white p-2"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-700">
                  {alert.title}
                </p>
                <span className="text-[10px] text-zinc-400">
                  cat {alert.cat}
                </span>
              </div>
              {alert.data?.length > 0 && (
                <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
                  {alert.data.join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Kan TV panel ── */
function KanTvPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wide">
          Kan 11 Live
        </h2>
        <span className="text-[10px] text-zinc-400 uppercase">
          Israeli Public Broadcast
        </span>
      </div>
      <div className="flex-1 rounded-lg overflow-hidden bg-black min-h-[300px]">
        <iframe
          src={KAN_EMBED_URL}
          className="w-full h-full min-h-[300px]"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="Kan 11 Live"
        />
      </div>
      <p className="text-[10px] text-zinc-400 mt-2 text-center">
        Auto-muted. Click the video to unmute.
      </p>
    </div>
  );
}

/* ── Main page ── */
export default function DashPage() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Dash</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Centralised situation awareness — readiness, alerts, and live broadcast
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Column 1: Readiness Posture */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 lg:max-h-[calc(100vh-10rem)] lg:overflow-hidden flex flex-col">
          <ReadinessChecklist />
        </div>

        {/* Column 2: Alerts */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 lg:max-h-[calc(100vh-10rem)] lg:overflow-hidden flex flex-col">
          <AlertsPanel />
        </div>

        {/* Column 3: Kan TV */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5 lg:max-h-[calc(100vh-10rem)] lg:overflow-hidden flex flex-col">
          <KanTvPanel />
        </div>
      </div>
    </div>
  );
}
