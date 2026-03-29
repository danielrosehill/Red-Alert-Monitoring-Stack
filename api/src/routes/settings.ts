import { Router } from "express";
import { getAllSettings, setSettings } from "../lib/db.js";

export const settingsRouter = Router();

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

settingsRouter.get("/", (_req, res) => {
  const dbSettings = getAllSettings();
  const merged: Record<string, string> = {};
  for (const key of MANAGED_KEYS) {
    const envKey = key.toUpperCase();
    merged[key] = dbSettings[key] ?? process.env[envKey] ?? "";
  }
  res.json(merged);
});

settingsRouter.put("/", (req, res) => {
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.body)) {
    if (MANAGED_KEYS.includes(key) && typeof value === "string") {
      filtered[key] = value;
    }
  }

  if (Object.keys(filtered).length === 0) {
    return res.status(400).json({ error: "No valid settings provided" });
  }

  setSettings(filtered);
  res.json({ ok: true, updated: Object.keys(filtered) });
});
