import { Router } from "express";
import { getArticles, getRssStatus } from "../lib/rss.js";

export const newsRouter = Router();

newsRouter.get("/", (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
  res.json(getArticles(limit));
});

newsRouter.get("/full", (_req, res) => {
  res.json(getRssStatus());
});
