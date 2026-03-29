import { Router } from "express";

const RSS_CACHE_URL = process.env.RSS_CACHE_URL || "http://rss-cache:8785";

export const newsRouter = Router();

newsRouter.get("/", async (_req, res) => {
  try {
    const resp = await fetch(`${RSS_CACHE_URL}/api/news`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});
