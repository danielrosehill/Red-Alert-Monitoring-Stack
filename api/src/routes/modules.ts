/** Module management — enable/disable optional stack services. */

import { Router } from "express";
import { getSetting, setSetting } from "../lib/db.js";
import { SERVICES, type ServiceStatus, type ServiceDef } from "../lib/services.js";

export const modulesRouter = Router();

export interface ModuleDef {
  id: string;
  name: string;
  description: string;
  requiredConfig: string[];
  service?: string; // key into SERVICES for health checks
}

/** All optional modules in the stack. */
const MODULE_DEFS: ModuleDef[] = [
  {
    id: "actuator",
    name: "Home Assistant Bridge",
    description: "Sets alert state in Home Assistant via REST API for light/siren/TTS automations",
    requiredConfig: ["HASS_HOST", "HASS_TOKEN"],
    service: "actuator",
  },
  {
    id: "snapcast-tts",
    name: "Snapcast TTS",
    description: "Whole-house audio announcements via Snapcast on alert events",
    requiredConfig: ["SNAPCAST_SERVER"],
    service: "snapcast-tts",
  },
  {
    id: "prompt-runner",
    name: "AI Prompt Runner",
    description: "Templated AI prompt execution for immediate intel and daily SITREPs",
    requiredConfig: ["OPENROUTER_API_KEY"],
    service: "prompt-runner",
  },
  {
    id: "telegram-bot",
    name: "Telegram Bot",
    description: "On-demand AI situation reports and alert queries via Telegram",
    requiredConfig: ["TELEGRAM_BOT_TOKEN"],
    service: "telegram-bot",
  },
  {
    id: "notifications",
    name: "Notifications",
    description: "Push notifications via Pushover and/or SMS via Twilio — volumetric thresholds, localized alerts, OSINT intel",
    requiredConfig: [],
    service: "sms-relay",
  },
  {
    id: "mcp-server",
    name: "MCP Server",
    description: "Streamable HTTP MCP exposing alert tools for AI agents",
    requiredConfig: [],
    service: "mcp-server",
  },
  {
    id: "webhook",
    name: "Webhook Notifications",
    description: "HTTP POST payloads on all alert conditions (localized + threshold crossings)",
    requiredConfig: ["WEBHOOK_URLS"],
  },
  {
    id: "geodash",
    name: "Map Dashboard",
    description: "Real-time map dashboard with 1,450 polygon overlays and InfluxDB storage",
    requiredConfig: [],
    service: "geodash",
  },
  {
    id: "mqtt-siren",
    name: "MQTT Sirens",
    description: "Direct Zigbee siren control via MQTT on alert events (TS0601 / NEO NAS-AB02B2)",
    requiredConfig: ["MQTT_BROKER", "MQTT_SIREN_TOPICS_ACTIVE"],
    service: "mqtt-siren",
  },
];

function dbKey(moduleId: string): string {
  return `module_${moduleId}_enabled`;
}

function isEnabled(moduleId: string): boolean {
  const val = getSetting(dbKey(moduleId));
  // Default to enabled if no setting exists
  return val === null ? true : val === "true";
}

async function checkHealth(svcDef: ServiceDef): Promise<ServiceStatus> {
  if (!svcDef.url || !svcDef.health) return { status: "unknown" };
  try {
    const resp = await fetch(`${svcDef.url}${svcDef.health}`, {
      signal: AbortSignal.timeout(3000),
    });
    return { status: "up", code: resp.status };
  } catch {
    return { status: "down" };
  }
}

// GET /api/modules — list all modules with enabled state + health
modulesRouter.get("/", async (_req, res) => {
  const modules = await Promise.all(
    MODULE_DEFS.map(async (mod) => {
      let health: ServiceStatus = { status: "unknown" };
      if (mod.service && SERVICES[mod.service]) {
        health = await checkHealth(SERVICES[mod.service]);
      }
      return {
        id: mod.id,
        name: mod.name,
        description: mod.description,
        enabled: isEnabled(mod.id),
        health: health.status,
        requiredConfig: mod.requiredConfig,
      };
    })
  );
  res.json({ modules });
});

// GET /api/modules/:name — single module status (used by services for enable check)
modulesRouter.get("/:name", async (req, res) => {
  const mod = MODULE_DEFS.find((m) => m.id === req.params.name);
  if (!mod) {
    return res.status(404).json({ error: `Unknown module: ${req.params.name}` });
  }
  let health: ServiceStatus = { status: "unknown" };
  if (mod.service && SERVICES[mod.service]) {
    health = await checkHealth(SERVICES[mod.service]);
  }
  res.json({
    id: mod.id,
    name: mod.name,
    description: mod.description,
    enabled: isEnabled(mod.id),
    health: health.status,
    requiredConfig: mod.requiredConfig,
  });
});

// PUT /api/modules/:name — toggle enabled/disabled
modulesRouter.put("/:name", (req, res) => {
  const mod = MODULE_DEFS.find((m) => m.id === req.params.name);
  if (!mod) {
    return res.status(404).json({ error: `Unknown module: ${req.params.name}` });
  }
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "Body must include { enabled: true|false }" });
  }
  setSetting(dbKey(mod.id), String(enabled));
  res.json({ id: mod.id, enabled });
});
