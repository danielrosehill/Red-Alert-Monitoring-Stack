"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

interface SettingField {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "password" | "area-select";
  help?: string;
}

interface AreaOption {
  hebrew: string;
  english: string;
}

const SETTING_GROUPS: { title: string; fields: SettingField[] }[] = [
  {
    title: "Core",
    fields: [
      {
        key: "alert_area",
        label: "Alert Area",
        type: "area-select",
        help: "Your local area as it appears in Pikud HaOref alerts. Search by English or Hebrew name.",
      },
    ],
  },
  {
    title: "AI / LLM Keys",
    fields: [
      {
        key: "openrouter_api_key",
        label: "OpenRouter API Key",
        type: "password",
        placeholder: "sk-or-v1-...",
        help: "Used by prompt runner and simulation pipeline.",
      },
      {
        key: "gemini_api_key",
        label: "Gemini API Key",
        type: "password",
        placeholder: "AIzaSy...",
        help: "Used by simulation pipeline for search-grounded intelligence gathering.",
      },
    ],
  },
  {
    title: "Email Delivery (Resend)",
    fields: [
      { key: "resend_api_key", label: "Resend API Key", type: "password" },
      { key: "sitrep_email_from", label: "Sender Address", placeholder: "sitrep@yourdomain.com" },
      { key: "sitrep_email_to", label: "Recipient(s)", placeholder: "user@example.com", help: "Comma-separated email addresses." },
    ],
  },
  {
    title: "SITREP Schedule",
    fields: [
      { key: "sitrep_schedule", label: "Schedule", placeholder: "0,6,18 or every:6", help: "UTC hours or interval. Leave empty to disable." },
      { key: "sitrep_deliver_to", label: "Delivery Targets", placeholder: "telegram,email" },
    ],
  },
  {
    title: "Home Assistant",
    fields: [
      { key: "hass_host", label: "HA Host", placeholder: "http://10.0.0.3:8123" },
      { key: "hass_token", label: "HA Token", type: "password" },
      { key: "hass_entity", label: "HA Entity", placeholder: "input_select.red_alert_state" },
    ],
  },
  {
    title: "Google Drive",
    fields: [
      { key: "google_drive_folder_id", label: "Drive Folder ID", help: "The ID of the Google Drive folder for report uploads." },
    ],
  },
  {
    title: "Notifications",
    fields: [
      { key: "pushover_api_token", label: "Pushover API Token", type: "password" },
      { key: "pushover_user_key", label: "Pushover User Key", type: "password" },
      { key: "telegram_bot_token", label: "Telegram Bot Token", type: "password" },
    ],
  },
  {
    title: "Audio",
    fields: [
      { key: "snapcast_server", label: "Snapcast Server", placeholder: "10.0.0.4" },
      { key: "snapcast_port", label: "Snapcast Port", placeholder: "1780" },
    ],
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [areaSearch, setAreaSearch] = useState("");
  const [areaDropdownOpen, setAreaDropdownOpen] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setSettings);
    fetch("/api/areas").then((r) => r.json()).then(setAreas).catch(() => {});
  }, []);

  // Close area dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (areaRef.current && !areaRef.current.contains(e.target as Node)) {
        setAreaDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function updateField(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty((prev) => new Set(prev).add(key));
  }

  async function save() {
    setSaving(true);
    setMessage(null);

    const payload: Record<string, string> = {};
    for (const key of dirty) {
      payload[key] = settings[key] ?? "";
    }

    try {
      const resp = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (data.ok) {
        setMessage(`Saved ${data.updated.length} setting(s)`);
        setDirty(new Set());
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (e) {
      setMessage(`Error: ${(e as Error).message}`);
    }

    setSaving(false);
    setTimeout(() => setMessage(null), 4000);
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-red-600">Red Alert Management</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-zinc-600 hover:text-zinc-900">Dashboard</Link>
            <Link href="/sitrep" className="text-zinc-600 hover:text-zinc-900">SITREP</Link>
            <Link href="/simulation" className="text-zinc-600 hover:text-zinc-900">Simulation</Link>
            <Link href="/settings" className="text-red-600 font-medium">Settings</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900">Settings</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Configure the Red Alert stack. Changes are saved to the management
              database and override environment variables.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {message && (
              <span
                className={`text-sm ${
                  message.startsWith("Error") ? "text-red-600" : "text-green-600"
                }`}
              >
                {message}
              </span>
            )}
            <button
              onClick={save}
              disabled={saving || dirty.size === 0}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : `Save Changes${dirty.size > 0 ? ` (${dirty.size})` : ""}`}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {SETTING_GROUPS.map((group) => (
            <div
              key={group.title}
              className="rounded-lg border border-zinc-200 bg-white p-5"
            >
              <h3 className="font-semibold text-zinc-900 mb-4">{group.title}</h3>
              <div className="space-y-3">
                {group.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm text-zinc-600 mb-1">
                      {field.label}
                      {dirty.has(field.key) && (
                        <span className="ml-2 text-xs text-red-600">
                          (modified)
                        </span>
                      )}
                    </label>
                    {field.type === "area-select" ? (
                      <div ref={areaRef} className="relative max-w-lg">
                        <input
                          type="text"
                          value={areaDropdownOpen ? areaSearch : (() => {
                            const val = settings[field.key] ?? "";
                            const match = areas.find((a) => a.hebrew === val);
                            return match ? `${match.english} (${match.hebrew})` : val;
                          })()}
                          onChange={(e) => {
                            setAreaSearch(e.target.value);
                            setAreaDropdownOpen(true);
                          }}
                          onFocus={() => {
                            setAreaSearch("");
                            setAreaDropdownOpen(true);
                          }}
                          placeholder="Search areas..."
                          className="w-full bg-white border border-zinc-300 rounded px-3 py-1.5 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400"
                        />
                        {settings[field.key] && !areaDropdownOpen && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                            {settings[field.key]}
                          </span>
                        )}
                        {areaDropdownOpen && (
                          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-zinc-300 rounded shadow-lg max-h-64 overflow-y-auto">
                            {areas
                              .filter((a) => {
                                if (!areaSearch) return true;
                                const q = areaSearch.toLowerCase();
                                return (
                                  a.english.toLowerCase().includes(q) ||
                                  a.hebrew.includes(areaSearch)
                                );
                              })
                              .slice(0, 50)
                              .map((a) => (
                                <button
                                  key={a.hebrew}
                                  type="button"
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 flex items-center justify-between ${
                                    settings[field.key] === a.hebrew
                                      ? "bg-red-50 text-red-700"
                                      : "text-zinc-900"
                                  }`}
                                  onClick={() => {
                                    updateField(field.key, a.hebrew);
                                    setAreaDropdownOpen(false);
                                    setAreaSearch("");
                                  }}
                                >
                                  <span>{a.english}</span>
                                  <span className="text-xs text-zinc-400">{a.hebrew}</span>
                                </button>
                              ))}
                            {areas.filter((a) => {
                              if (!areaSearch) return true;
                              const q = areaSearch.toLowerCase();
                              return a.english.toLowerCase().includes(q) || a.hebrew.includes(areaSearch);
                            }).length === 0 && (
                              <div className="px-3 py-2 text-sm text-zinc-500">No matching areas</div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <input
                        type={field.type ?? "text"}
                        value={settings[field.key] ?? ""}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full max-w-lg bg-white border border-zinc-300 rounded px-3 py-1.5 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400"
                      />
                    )}
                    {field.help && (
                      <p className="text-xs text-zinc-400 mt-1">{field.help}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
