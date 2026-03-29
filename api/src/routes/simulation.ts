import { Router } from "express";
import { runPipeline, formatSummaryText, formatTelegramSummary } from "../lib/simulation/pipeline.js";
import {
  listSimulationSessions,
  getSimulationSession,
  deleteSimulationSession,
  upsertSimulationSession,
} from "../lib/db.js";
import { generatePdf } from "../lib/simulation/pdf.js";
import { uploadToDrive } from "../lib/drive.js";
import { sendEmail } from "../lib/email.js";
import { sendTelegram } from "../lib/telegram.js";

export const simulationRouter = Router();

// Run full simulation pipeline
simulationRouter.post("/run", async (req, res) => {
  const deliverTo = req.body.deliver_to ?? ["email"];
  try {
    const result = await runPipeline({ deliverTo });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// List / get sessions
simulationRouter.get("/sessions", (req, res) => {
  const id = req.query.id as string | undefined;

  if (id) {
    const session = getSimulationSession(id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    return res.json({
      ...session,
      sitrep: session.sitrep ? JSON.parse(session.sitrep) : null,
      forecasts: session.forecasts ? JSON.parse(session.forecasts) : null,
      summary: session.summary ? JSON.parse(session.summary) : null,
    });
  }

  const sessions = listSimulationSessions().map((s) => ({
    id: s.id,
    created_at: s.created_at,
    step: s.step,
    drive_url: s.drive_url,
  }));
  res.json(sessions);
});

// Delete session
simulationRouter.delete("/sessions", (req, res) => {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: "id required" });
  deleteSimulationSession(id);
  res.json({ ok: true });
});

// Download PDF for a session
simulationRouter.get("/pdf", async (req, res) => {
  const id = req.query.id as string;
  if (!id) return res.status(400).send("id required");

  const session = getSimulationSession(id);
  if (!session) return res.status(404).send("Session not found");

  const { pdf } = await generatePdf({
    sessionId: session.id,
    createdAt: session.created_at,
    groundTruth: session.ground_truth || "No ground truth available.",
    sitrep: session.sitrep ? JSON.parse(session.sitrep) : null,
    forecasts: session.forecasts ? JSON.parse(session.forecasts) : {},
    summary: session.summary ? JSON.parse(session.summary) : null,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="geopol-report-${session.id.slice(0, 8)}.pdf"`
  );
  res.send(pdf);
});

// Deliver a completed report to email or telegram (post-generation)
simulationRouter.post("/deliver", async (req, res) => {
  const { id, target } = req.body;
  if (!id || !target) return res.status(400).json({ error: "id and target required" });

  const session = getSimulationSession(id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.step !== "done") return res.status(400).json({ error: "Session not complete" });

  const summary = session.summary ? JSON.parse(session.summary) : null;

  if (target === "email") {
    const { pdf } = await generatePdf({
      sessionId: session.id,
      createdAt: session.created_at,
      groundTruth: session.ground_truth || "",
      sitrep: session.sitrep ? JSON.parse(session.sitrep) : null,
      forecasts: session.forecasts ? JSON.parse(session.forecasts) : {},
      summary,
    });
    const ts = new Date(session.created_at).toISOString().slice(0, 16).replace("T", " ");
    const result = await sendEmail({
      subject: `Geopolitical Forecast Report — ${ts} UTC`,
      text: formatSummaryText(summary),
      attachments: [
        { filename: `geopol-report-${session.id.slice(0, 8)}.pdf`, content: pdf },
      ],
    });
    return res.json(result);
  }

  if (target === "telegram") {
    const result = await sendTelegram(formatTelegramSummary(summary, session.id));
    return res.json(result);
  }

  return res.status(400).json({ error: `Unknown target: ${target}` });
});

// Upload to Google Drive
simulationRouter.post("/upload", async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });

  const session = getSimulationSession(id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (!session.pdf_path)
    return res.status(400).json({ error: "No PDF generated for this session" });

  const result = await uploadToDrive(session.pdf_path);
  if (!result.ok) return res.status(500).json({ error: result.error });

  upsertSimulationSession({
    id: session.id,
    createdAt: session.created_at,
    step: session.step,
    driveUrl: result.url,
  });

  res.json({ url: result.url, fileId: result.fileId });
});
