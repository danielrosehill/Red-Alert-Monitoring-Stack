import { Router } from "express";
import { getSetting, setSetting } from "../lib/db.js";
import { generateSitrepPdf, saveSitrepPdf } from "../lib/simulation/pdf.js";
import { uploadToDrive } from "../lib/drive.js";
import { sendEmail } from "../lib/email.js";

const PROMPT_RUNNER_URL =
  process.env.PROMPT_RUNNER_URL || "http://prompt-runner:8787";

export const sitrepRouter = Router();

// Run a SITREP via prompt runner
sitrepRouter.post("/run", async (req, res) => {
  const deliverTo: string[] = req.body.deliver_to ?? ["telegram"];
  const saveToDrive = req.body.save_to_drive === true;

  try {
    const resp = await fetch(`${PROMPT_RUNNER_URL}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template: "daily_sitrep",
        deliver_to: deliverTo.filter((t) => t !== "drive"),
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const data = await resp.json();
    const result: Record<string, unknown> = { ...data };

    const sitrepText = data.output || data.result || "";
    if (sitrepText) {
      const now = new Date().toISOString();
      const pdf = await generateSitrepPdf({ content: sitrepText, generatedAt: now });
      const pdfPath = await saveSitrepPdf(pdf, now);
      result.pdf_path = pdfPath;

      if (saveToDrive || deliverTo.includes("drive")) {
        const driveResult = await uploadToDrive(pdfPath);
        result.drive = driveResult;
      }

      if (deliverTo.includes("email") && !data.email_sent) {
        const ts = new Date(now).toISOString().slice(0, 16).replace("T", " ");
        const emailResult = await sendEmail({
          subject: `SITREP — ${ts} UTC`,
          text: sitrepText,
          attachments: [{ filename: `sitrep-${now.slice(0, 10)}.pdf`, content: pdf }],
        });
        result.email = emailResult;
      }
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Get/set SITREP schedule
sitrepRouter.get("/schedule", async (_req, res) => {
  res.json({
    schedule: (await getSetting("sitrep_schedule")) || process.env.SITREP_SCHEDULE || "",
    deliver_to:
      (await getSetting("sitrep_deliver_to")) || process.env.SITREP_DELIVER_TO || "telegram",
  });
});

sitrepRouter.put("/schedule", async (req, res) => {
  if (req.body.schedule !== undefined) await setSetting("sitrep_schedule", req.body.schedule);
  if (req.body.deliver_to !== undefined) await setSetting("sitrep_deliver_to", req.body.deliver_to);
  res.json({ ok: true });
});
