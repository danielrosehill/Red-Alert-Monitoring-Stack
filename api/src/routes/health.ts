import { Router } from "express";
import { getAllStatuses, SERVICES } from "../lib/services.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const statuses = await getAllStatuses();
  res.json({
    services: SERVICES,
    statuses,
    checkedAt: new Date().toISOString(),
  });
});
