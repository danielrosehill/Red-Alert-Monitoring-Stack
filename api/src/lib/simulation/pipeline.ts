/**
 * Full simulation pipeline orchestrator.
 * Runs the 6-stage geopolitical forecasting pipeline headlessly
 * and delivers results via email, Telegram, and/or Google Drive.
 */

import { randomUUID } from "crypto";
import { gatherIntelligence } from "./gather";
import { generateSitrep } from "./sitrep";
import { generateForecasts } from "./forecast";
import { generateSummary } from "./summarize";
import { generatePdf, saveSimulationPdf } from "./pdf";
import { sendEmail } from "../email";
import { sendTelegram } from "../telegram";
import { uploadToDrive } from "../drive";
import { upsertSimulationSession, getSimulationSession } from "../db";
import type { StructuredLensForecast } from "./schemas";

export interface PipelineOptions {
  deliverTo?: ("email" | "telegram" | "drive")[];
}

export interface PipelineResult {
  sessionId: string;
  step: string;
  groundTruth?: string;
  sitrep?: Record<string, string>;
  forecasts?: Record<string, StructuredLensForecast>;
  summary?: unknown;
  pdfPath?: string;
  driveUrl?: string;
  deliveryResults?: Record<string, { ok: boolean; error?: string }>;
  error?: string;
}

async function updateSession(
  sessionId: string,
  createdAt: string,
  step: string,
  data: Partial<{
    groundTruth: string;
    sitrep: Record<string, string>;
    forecasts: Record<string, unknown>;
    summary: unknown;
    pdfPath: string;
    driveUrl: string;
  }>
): Promise<void> {
  await upsertSimulationSession({
    id: sessionId,
    createdAt,
    step,
    groundTruth: data.groundTruth,
    sitrep: data.sitrep ? JSON.stringify(data.sitrep) : undefined,
    forecasts: data.forecasts,
    summary: data.summary,
    pdfPath: data.pdfPath,
    driveUrl: data.driveUrl,
  });
}

export async function runPipeline(
  opts: PipelineOptions = {}
): Promise<PipelineResult> {
  const sessionId = randomUUID();
  const createdAt = new Date().toISOString();
  const deliverTo = opts.deliverTo ?? ["email"];

  try {
    // Stage 1: Intelligence gathering
    await updateSession(sessionId, createdAt, "gathering", {});
    const groundTruth = await gatherIntelligence();
    await updateSession(sessionId, createdAt, "gathering", { groundTruth });

    // Stage 2: SITREP generation
    await updateSession(sessionId, createdAt, "sitrep", {});
    const sitrep = await generateSitrep(groundTruth);
    await updateSession(sessionId, createdAt, "sitrep", { sitrep });

    // Stage 3: 6-lens forecasting
    await updateSession(sessionId, createdAt, "forecasting", {});
    const forecasts = await generateForecasts(groundTruth);
    await updateSession(sessionId, createdAt, "forecasting", { forecasts });

    // Stage 4: Executive summary
    await updateSession(sessionId, createdAt, "summarizing", {});
    const summary = await generateSummary(forecasts);
    await updateSession(sessionId, createdAt, "summarizing", { summary });

    // Stage 5: PDF generation
    await updateSession(sessionId, createdAt, "generating_pdf", {});
    const { pdf } = await generatePdf({
      sessionId,
      createdAt,
      groundTruth,
      sitrep,
      forecasts,
      summary,
    });
    const pdfPath = await saveSimulationPdf(pdf, sessionId, createdAt);
    await updateSession(sessionId, createdAt, "generating_pdf", { pdfPath });

    // Stage 6: Delivery
    await updateSession(sessionId, createdAt, "uploading", {});
    const deliveryResults: Record<string, { ok: boolean; error?: string }> = {};

    if (deliverTo.includes("drive")) {
      const driveResult = await uploadToDrive(pdfPath);
      deliveryResults.drive = driveResult;
      if (driveResult.ok && driveResult.url) {
        await updateSession(sessionId, createdAt, "uploading", { driveUrl: driveResult.url });
      }
    }

    if (deliverTo.includes("email")) {
      const ts = new Date(createdAt).toISOString().slice(0, 16).replace("T", " ");
      const emailResult = await sendEmail({
        subject: `Geopolitical Forecast Report — ${ts} UTC`,
        text: formatSummaryText(summary),
        attachments: [
          { filename: `geopol-report-${sessionId.slice(0, 8)}.pdf`, content: pdf },
        ],
      });
      deliveryResults.email = emailResult;
    }

    if (deliverTo.includes("telegram")) {
      const telegramResult = await sendTelegram(
        formatTelegramSummary(summary, sessionId)
      );
      deliveryResults.telegram = telegramResult;
    }

    await updateSession(sessionId, createdAt, "done", {});

    return {
      sessionId,
      step: "done",
      groundTruth,
      sitrep,
      forecasts,
      summary,
      pdfPath,
      driveUrl: deliveryResults.drive?.ok
        ? (await getSessionDriveUrl(sessionId))
        : undefined,
      deliveryResults,
    };
  } catch (e) {
    const err = (e as Error).message;
    await updateSession(sessionId, createdAt, "error", {});
    return { sessionId, step: "error", error: err };
  }
}

async function getSessionDriveUrl(sessionId: string): Promise<string | undefined> {
  const row = await getSimulationSession(sessionId);
  return row?.drive_url ?? undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatSummaryText(summary: any): string {
  if (!summary) return "Simulation completed but no summary was generated.";
  const lines = ["GEOPOLITICAL FORECAST — EXECUTIVE SUMMARY", ""];
  if (summary.overallAssessment) {
    lines.push(summary.overallAssessment, "");
  }
  if (summary.consensusThemes?.length) {
    lines.push("CONSENSUS THEMES:");
    for (const t of summary.consensusThemes) lines.push(`  - ${t}`);
    lines.push("");
  }
  if (summary.highConfidencePredictions?.length) {
    lines.push("HIGH-CONFIDENCE PREDICTIONS:");
    for (const p of summary.highConfidencePredictions) {
      lines.push(`  - [${p.agreementCount}] ${p.prediction} (${p.confidence})`);
    }
    lines.push("");
  }
  if (summary.actionableInsights?.length) {
    lines.push("ACTIONABLE INSIGHTS:");
    for (const a of summary.actionableInsights) lines.push(`  - ${a}`);
  }
  return lines.join("\n");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatTelegramSummary(summary: any, sessionId: string): string {
  const lines = [
    `🌍 *Geopolitical Forecast Report*`,
    `Session: \`${sessionId.slice(0, 8)}\``,
    `Generated: ${new Date().toUTCString()}`,
    "",
  ];
  if (summary?.overallAssessment) {
    lines.push(summary.overallAssessment, "");
  }
  if (summary?.highConfidencePredictions?.length) {
    lines.push("*Key Predictions:*");
    for (const p of summary.highConfidencePredictions.slice(0, 3)) {
      lines.push(`• ${p.prediction} (${p.confidence})`);
    }
  }
  return lines.join("\n");
}
