"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const SAMPLE_PAYLOADS = {
  localized_active: {
    event: "localized_alert",
    state: "active",
    timestamp: "2026-03-30T14:22:01Z",
    area: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05d3\u05e8\u05d5\u05dd",
    category: 1,
    category_name: "Rockets & Missiles",
    source: "red-alert-stack",
  },
  localized_warning: {
    event: "localized_alert",
    state: "warning",
    timestamp: "2026-03-30T14:20:00Z",
    area: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05d3\u05e8\u05d5\u05dd",
    category: 14,
    category_name: "Pre-Warning",
    source: "red-alert-stack",
  },
  localized_clear: {
    event: "localized_alert",
    state: "clear",
    timestamp: "2026-03-30T14:25:00Z",
    area: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05d3\u05e8\u05d5\u05dd",
    category: 13,
    category_name: "All Clear",
    source: "red-alert-stack",
  },
  threshold: {
    event: "threshold_crossed",
    state: "threshold_500",
    timestamp: "2026-03-30T14:22:01Z",
    threshold: 500,
    active_areas: 523,
    source: "red-alert-stack",
  },
};

type PayloadKey = keyof typeof SAMPLE_PAYLOADS;

const PAYLOAD_LABELS: Record<PayloadKey, { label: string; color: string }> = {
  localized_active: { label: "Red Alert (Active)", color: "bg-red-100 text-red-700 border-red-200" },
  localized_warning: { label: "Early Warning", color: "bg-orange-100 text-orange-700 border-orange-200" },
  localized_clear: { label: "All Clear", color: "bg-green-100 text-green-700 border-green-200" },
  threshold: { label: "Threshold Crossed", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
};

export default function WebhooksPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [webhookHealth, setWebhookHealth] = useState<Record<string, unknown> | null>(null);
  const [selectedPayload, setSelectedPayload] = useState<PayloadKey>("localized_active");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    fetch(api("/api/settings")).then((r) => r.json()).then(setSettings).catch(() => {});
    fetch(api("/api/modules/webhook")).then((r) => r.json()).then(setWebhookHealth).catch(() => {});
  }, []);

  const webhookUrls = (settings.webhook_urls || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  const lanUrl = settings.lan_url || "";
  const wanUrl = settings.wan_url || "";
  const webhookPort = "8784";

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const resp = await fetch(api("/api/modules/webhook"));
      const mod = await resp.json();
      if (!mod.enabled) {
        setTestResult("Webhook module is disabled. Enable it in Modules first.");
        setTesting(false);
        return;
      }
      // Call the webhook test endpoint via the API proxy or directly
      const baseUrl = lanUrl || window.location.origin;
      const testResp = await fetch(`${baseUrl}:${webhookPort}/api/test-webhook`, {
        method: "POST",
      });
      const data = await testResp.json();
      setTestResult(`Sent to ${data.urls} URL(s): ${data.successes} succeeded, ${data.failures} failed`);
    } catch (e) {
      setTestResult(`Error: ${(e as Error).message}`);
    }
    setTesting(false);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Webhooks</h1>
        <p className="text-sm text-zinc-500 mt-1">
          The webhook service sends HTTP POST payloads to configured URLs on
          every alert event — localized alerts, early warnings, all-clear, and
          nationwide threshold crossings.
        </p>
      </div>

      {/* Endpoint URLs */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5 mb-4">
        <h3 className="font-semibold text-zinc-900 mb-3">Webhook Service Endpoints</h3>
        <p className="text-xs text-zinc-500 mb-3">
          Point external systems to these URLs if they need to reach the webhook
          service directly (e.g., for health checks or test triggers).
        </p>
        <div className="space-y-2">
          {lanUrl && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-500 w-12">LAN</span>
              <code className="text-sm bg-zinc-50 border border-zinc-200 rounded px-3 py-1.5 font-mono flex-1">
                {lanUrl}:{webhookPort}
              </code>
            </div>
          )}
          {wanUrl && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-500 w-12">WAN</span>
              <code className="text-sm bg-zinc-50 border border-zinc-200 rounded px-3 py-1.5 font-mono flex-1">
                {wanUrl}:{webhookPort}
              </code>
            </div>
          )}
          {!lanUrl && !wanUrl && (
            <p className="text-xs text-zinc-400">
              Set LAN URL and/or WAN URL in{" "}
              <a href="/settings" className="text-red-600 underline">Settings</a>{" "}
              to see constructed endpoints here.
            </p>
          )}
        </div>
      </div>

      {/* Configured Destinations */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-zinc-900">Configured Destinations</h3>
          {webhookHealth && (
            <span className={`text-xs font-medium rounded-full px-2 py-0.5 border ${
              (webhookHealth as Record<string, unknown>).health === "up"
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-zinc-50 text-zinc-500 border-zinc-200"
            }`}>
              {String((webhookHealth as Record<string, unknown>).health ?? "unknown")}
            </span>
          )}
        </div>
        {webhookUrls.length > 0 ? (
          <div className="space-y-2">
            {webhookUrls.map((url, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded px-3 py-2"
              >
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <code className="text-sm font-mono text-zinc-700 truncate">{url}</code>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">
            No webhook URLs configured. Add them in{" "}
            <a href="/settings" className="text-red-600 underline">Settings</a>.
          </p>
        )}
        {webhookUrls.length > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={sendTest}
              disabled={testing}
              className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded font-medium disabled:opacity-50 transition-colors"
            >
              {testing ? "Sending..." : "Send Test Payload"}
            </button>
            {testResult && (
              <span className={`text-sm ${testResult.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
                {testResult}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Sample Payloads */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h3 className="font-semibold text-zinc-900 mb-3">Sample Payloads</h3>
        <p className="text-xs text-zinc-500 mb-3">
          These are the JSON payloads sent to your webhook URLs on each event
          type. All payloads include a timestamp, source identifier, and event
          details.
        </p>
        <div className="flex gap-2 mb-4 flex-wrap">
          {(Object.keys(SAMPLE_PAYLOADS) as PayloadKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setSelectedPayload(key)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                selectedPayload === key
                  ? PAYLOAD_LABELS[key].color
                  : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-zinc-300"
              }`}
            >
              {PAYLOAD_LABELS[key].label}
            </button>
          ))}
        </div>
        <pre className="bg-zinc-900 text-zinc-100 rounded-lg p-4 text-sm overflow-x-auto font-mono leading-relaxed">
          {JSON.stringify(SAMPLE_PAYLOADS[selectedPayload], null, 2)}
        </pre>
        <p className="text-xs text-zinc-400 mt-2">
          If <code className="bg-zinc-100 px-1 rounded">WEBHOOK_SECRET</code> is
          set, an <code className="bg-zinc-100 px-1 rounded">X-Webhook-Signature</code> header
          with an HMAC-SHA256 hex digest is included.
        </p>
      </div>
    </div>
  );
}
