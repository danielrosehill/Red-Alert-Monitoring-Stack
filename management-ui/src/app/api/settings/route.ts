import { NextResponse } from "next/server";
import { getAllSettings, setSettings } from "@/lib/db";

/** Settings keys that can be managed via the UI. */
const MANAGED_KEYS = [
  "alert_area",
  "openrouter_api_key",
  "gemini_api_key",
  "resend_api_key",
  "sitrep_email_from",
  "sitrep_email_to",
  "sitrep_schedule",
  "sitrep_deliver_to",
  "hass_host",
  "hass_token",
  "hass_entity",
  "google_drive_folder_id",
  "pushover_api_token",
  "pushover_user_key",
  "telegram_bot_token",
  "snapcast_server",
  "snapcast_port",
];

export async function GET() {
  const dbSettings = getAllSettings();

  // Merge: DB overrides env vars. Return only managed keys.
  const merged: Record<string, string> = {};
  for (const key of MANAGED_KEYS) {
    const envKey = key.toUpperCase();
    merged[key] = dbSettings[key] ?? process.env[envKey] ?? "";
  }

  return NextResponse.json(merged);
}

export async function PUT(request: Request) {
  const body = await request.json();

  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (MANAGED_KEYS.includes(key) && typeof value === "string") {
      filtered[key] = value;
    }
  }

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: "No valid settings provided" }, { status: 400 });
  }

  setSettings(filtered);
  return NextResponse.json({ ok: true, updated: Object.keys(filtered) });
}
