/** Service health checking — queries all stack services concurrently. */

export interface ServiceDef {
  name: string;
  url: string | null;
  health: string | null;
  port: number;
  description: string;
  tcpCheck?: string;
  uiUrl?: string;
}

export const SERVICES: Record<string, ServiceDef> = {
  "oref-proxy": {
    name: "Oref Alert Proxy",
    url: process.env.OREF_PROXY_URL || "http://oref-proxy:8764",
    health: "/api/status",
    port: 8764,
    description: "Polls Pikud HaOref every 3s, serves raw alert data",
  },
  geodash: {
    name: "Geodash Dashboard",
    url: process.env.GEODASH_URL || "http://geodash:8083",
    health: "/",
    port: 8083,
    description: "Real-time map dashboard with InfluxDB storage",
    uiUrl: process.env.GEODASH_EXTERNAL_URL || "http://localhost:8083",
  },
  "telegram-bot": {
    name: "Telegram Bot",
    url: process.env.TELEGRAM_BOT_URL || "http://telegram-bot:8781",
    health: "/health",
    port: 8781,
    description: "AI situation reports and on-demand alert queries",
  },
  actuator: {
    name: "Actuator",
    url: process.env.ACTUATOR_URL || "http://actuator:8782",
    health: "/health",
    port: 8782,
    description: "HA bridge: sets input_select state + triggers prompt runner",
  },
  timescaledb: {
    name: "TimescaleDB",
    url: process.env.POSTGRES_URL || "postgresql://timescaledb:5432/redalert",
    health: "",  // Not an HTTP service — health via docker healthcheck (pg_isready)
    port: 5432,
    description: "Postgres + Timescale: alert history, settings, simulations",
  },
  "rss-cache": {
    name: "RSS Cache",
    url: process.env.RSS_CACHE_URL || "http://rss-cache:8785",
    health: "/api/health",
    port: 8785,
    description: "Cached news feeds for dashboard and Telegram bot",
  },
  "mcp-server": {
    name: "MCP Server",
    url: process.env.MCP_SERVER_URL || "http://mcp-server:8786",
    health: "/mcp",
    port: 8786,
    description: "AI agent tools for alert data access",
  },
  "prompt-runner": {
    name: "Prompt Runner",
    url: process.env.PROMPT_RUNNER_URL || "http://prompt-runner:8787",
    health: "/health",
    port: 8787,
    description: "Templated AI prompt execution for intel reports",
  },
  webhook: {
    name: "Webhook",
    url: process.env.WEBHOOK_URL || "http://webhook:8784",
    health: "/health",
    port: 8784,
    description: "HTTP POST notifications on alert events",
  },
  "sms-relay": {
    name: "SMS Relay",
    url: process.env.SMS_RELAY_URL || "http://sms-relay:8792",
    health: "/health",
    port: 8792,
    description: "Twilio SMS and voice call notifications",
  },
  "mqtt-siren": {
    name: "MQTT Siren",
    url: process.env.MQTT_SIREN_URL || "http://mqtt-siren:8789",
    health: "/health",
    port: 8789,
    description: "Direct Zigbee siren control via MQTT",
  },
  "snapcast-tts": {
    name: "Snapcast TTS",
    url: process.env.SNAPCAST_TTS_URL || "http://snapcast-tts:8783",
    health: "/health",
    port: 8783,
    description: "Whole-house audio announcements via Snapcast",
  },
};

export interface ServiceStatus {
  status: "up" | "down" | "unknown";
  code?: number;
  error?: string;
  data?: Record<string, unknown>;
}

async function checkHttp(
  url: string,
  path: string
): Promise<ServiceStatus> {
  try {
    const resp = await fetch(`${url}${path}`, {
      signal: AbortSignal.timeout(3000),
    });
    let data: Record<string, unknown> | undefined;
    try {
      data = await resp.json();
    } catch {
      // not JSON, that's fine
    }
    return { status: "up", code: resp.status, data };
  } catch (e) {
    return { status: "down", error: (e as Error).name };
  }
}

export async function getAllStatuses(): Promise<
  Record<string, ServiceStatus>
> {
  const results: Record<string, ServiceStatus> = {};
  const promises: Array<[string, Promise<ServiceStatus>]> = [];

  for (const [id, svc] of Object.entries(SERVICES)) {
    if (svc.url && svc.health) {
      promises.push([id, checkHttp(svc.url, svc.health)]);
    } else {
      results[id] = { status: "unknown" };
    }
  }

  const settled = await Promise.allSettled(
    promises.map(([, p]) => p)
  );

  for (let i = 0; i < promises.length; i++) {
    const [id] = promises[i];
    const result = settled[i];
    if (result.status === "fulfilled") {
      results[id] = result.value;
    } else {
      results[id] = { status: "down", error: String(result.reason) };
    }
  }

  return results;
}
