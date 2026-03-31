/** Snapcast TTS proxy — forwards test/status requests to the Snapcast TTS service. */

import { Router } from "express";
import { SERVICES } from "../lib/services.js";

export const snapcastRouter = Router();

function snapcastUrl(): string {
  return SERVICES["snapcast-tts"]?.url || "http://snapcast-tts:8783";
}

// POST /api/snapcast/test — send a test TTS announcement
snapcastRouter.post("/test", async (req, res) => {
  try {
    const resp = await fetch(`${snapcastUrl()}/api/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: "Snapcast TTS unreachable", detail: (e as Error).message });
  }
});

// GET /api/snapcast/messages — list predefined TTS messages
snapcastRouter.get("/messages", async (_req, res) => {
  try {
    const resp = await fetch(`${snapcastUrl()}/api/messages`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: "Snapcast TTS unreachable", detail: (e as Error).message });
  }
});
