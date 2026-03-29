import express from "express";
import cors from "cors";

import { healthRouter } from "./routes/health.js";
import { alertsRouter } from "./routes/alerts.js";
import { newsRouter } from "./routes/news.js";
import { sitrepRouter } from "./routes/sitrep.js";
import { simulationRouter } from "./routes/simulation.js";
import { settingsRouter } from "./routes/settings.js";
import { notificationsRouter } from "./routes/notifications.js";
import { driveRouter } from "./routes/drive.js";

const app = express();
const PORT = parseInt(process.env.PORT || "8890", 10);

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api/health", healthRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/news", newsRouter);
app.use("/api/sitrep", sitrepRouter);
app.use("/api/simulation", simulationRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/drive", driveRouter);

// Root health check
app.get("/", (_req, res) => {
  res.json({ service: "red-alert-api", status: "ok" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Red Alert API listening on :${PORT}`);
});
