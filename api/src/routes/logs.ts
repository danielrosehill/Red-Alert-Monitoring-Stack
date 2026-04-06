/** Container log streaming — reads logs via Docker Engine API over unix socket. */

import { Router } from "express";
import http from "node:http";

export const logsRouter = Router();

/** Map service IDs to Docker container names (must match compose). */
const CONTAINER_NAMES: Record<string, string> = {
  "oref-proxy": "oref-proxy",
  geodash: "geodash",
  "telegram-bot": "telegram-bot",
  actuator: "actuator",
  timescaledb: "timescaledb",
  "rss-cache": "rss-cache",
  "mcp-server": "mcp-server",
  "prompt-runner": "prompt-runner",
  webhook: "webhook",
  "sms-relay": "sms-relay",
  "mqtt-siren": "mqtt-siren",
  "snapcast-tts": "snapcast-tts",
  api: "red-alert-api",
  "management-ui": "management-ui",
};

function dockerGet(path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: "/var/run/docker.sock", path, method: "GET" },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Docker API ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
          } else {
            resolve(Buffer.concat(chunks));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

// GET /api/logs/:service?tail=100
logsRouter.get("/:service", async (req, res) => {
  const container = CONTAINER_NAMES[req.params.service];
  if (!container) {
    return res.status(404).json({ error: `Unknown service: ${req.params.service}` });
  }

  const tail = Math.min(parseInt(req.query.tail as string) || 100, 500);

  try {
    const raw = await dockerGet(
      `/containers/${container}/logs?stdout=1&stderr=1&tail=${tail}&timestamps=1`
    );

    // Docker multiplexed stream: each frame has 8-byte header
    // [stream_type(1) + padding(3) + size(4)] + payload
    const lines: string[] = [];
    let offset = 0;

    while (offset + 8 <= raw.length) {
      const size = raw.readUInt32BE(offset + 4);
      if (offset + 8 + size > raw.length) break;
      const payload = raw.subarray(offset + 8, offset + 8 + size).toString("utf-8");
      lines.push(payload.trimEnd());
      offset += 8 + size;
    }

    // If the above didn't parse (TTY mode), fall back to splitting raw text
    if (lines.length === 0 && raw.length > 0) {
      lines.push(...raw.toString("utf-8").split("\n").filter(Boolean));
    }

    res.json({ container, lines, count: lines.length });
  } catch (e) {
    res.status(500).json({
      error: "Docker socket unavailable",
      detail: (e as Error).message,
    });
  }
});
