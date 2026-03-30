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

export default function ModulesPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

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
    </div>
  );
}
