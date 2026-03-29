import { Router } from "express";

const OREF_PROXY_URL = process.env.OREF_PROXY_URL || "http://oref-proxy:8764";

export const alertsRouter = Router();

// Proxy current alerts from oref-proxy
alertsRouter.get("/", async (_req, res) => {
  try {
    const resp = await fetch(`${OREF_PROXY_URL}/api/alerts`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

// Proxy alert history
alertsRouter.get("/history", async (_req, res) => {
  try {
    const resp = await fetch(`${OREF_PROXY_URL}/api/history`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

// Proxy status
alertsRouter.get("/status", async (_req, res) => {
  try {
    const resp = await fetch(`${OREF_PROXY_URL}/api/status`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

// Test alert — forward to actuator
alertsRouter.post("/test", async (req, res) => {
  const ACTUATOR_URL = process.env.ACTUATOR_URL || "http://actuator:8782";
  try {
    const resp = await fetch(`${ACTUATOR_URL}/api/test-alert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alert_type: req.body.alert_type ?? "red_alert",
        area: req.body.area ?? "",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
