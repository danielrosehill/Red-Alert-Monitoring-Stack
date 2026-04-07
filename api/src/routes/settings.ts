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
  "google_drive_sitrep_folder_id",
  "google_drive_forecast_folder_id",
  "pushover_api_token",
  "pushover_user_key",
  "oref_area_thresholds",
  "telegram_bot_token",
  "tavily_api_key",
  "allowed_telegram_users",
  "snapcast_server",
  "snapcast_port",
  "lan_url",
  "wan_url",
  "twilio_account_sid",
  "twilio_auth_token",
  "twilio_from_number",
  "sms_recipients",
  "twilio_delivery_mode",
  "webhook_urls",
  "webhook_secret",
];

settingsRouter.get("/", async (_req, res) => {
  const dbSettings = await getAllSettings();
  const merged: Record<string, string> = {};
  for (const key of MANAGED_KEYS) {
    const envKey = key.toUpperCase();
    merged[key] = dbSettings[key] ?? process.env[envKey] ?? "";
  }
  res.json(merged);
});

settingsRouter.put("/", async (req, res) => {
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.body)) {
    if (MANAGED_KEYS.includes(key) && typeof value === "string") {
      filtered[key] = value;
    }
  }

  if (Object.keys(filtered).length === 0) {
    return res.status(400).json({ error: "No valid settings provided" });
  }

  await setSettings(filtered);
  res.json({ ok: true, updated: Object.keys(filtered) });
});
