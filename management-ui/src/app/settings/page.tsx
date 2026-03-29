"use client";

import { useEffect, useState } from "react";

interface SettingField {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "password";
  help?: string;
}

const SETTING_GROUPS: { title: string; fields: SettingField[] }[] = [
  {
    title: "Alert Configuration",
    fields: [
      {
        key: "alert_area",
        label: "Alert Area",
        placeholder: "ירושלים - דרום",
        help: "Your local area name in Hebrew as it appears in Pikud HaOref alerts.",
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

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings);
  }, []);

  function updateField(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty((prev) => new Set(prev).add(key));
  }

  async function save() {
    setSaving(true);
    setMessage(null);

    // Only send changed fields
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Settings</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Configure the Red Alert stack. Changes are saved to the management
            database and override environment variables.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <span
              className={`text-sm ${
                message.startsWith("Error") ? "text-red-400" : "text-green-400"
              }`}
            >
              {message}
            </span>
          )}
          <button
            onClick={save}
            disabled={saving || dirty.size === 0}
            className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-500 rounded font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : `Save Changes${dirty.size > 0 ? ` (${dirty.size})` : ""}`}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {SETTING_GROUPS.map((group) => (
          <div
            key={group.title}
            className="rounded-lg border border-zinc-800 p-5"
          >
            <h3 className="font-semibold mb-4">{group.title}</h3>
            <div className="space-y-3">
              {group.fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm text-zinc-400 mb-1">
                    {field.label}
                    {dirty.has(field.key) && (
                      <span className="ml-2 text-xs text-yellow-500">
                        (modified)
                      </span>
                    )}
                  </label>
                  <input
                    type={field.type ?? "text"}
                    value={settings[field.key] ?? ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
                  />
                  {field.help && (
                    <p className="text-xs text-zinc-600 mt-1">{field.help}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
