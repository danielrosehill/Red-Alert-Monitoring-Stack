/** PDF generation via Typst. */

import { buildTypstSource } from "./typst-template";
import { execFile } from "node:child_process";
import { writeFile, readFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export async function generatePdf(params: {
  sessionId: string;
  createdAt: string;
  groundTruth: string;
  sitrep: Record<string, string> | null;
  forecasts: Record<string, unknown>;
  summary: unknown;
}): Promise<{ pdf: Buffer; typstSource: string }> {
  const typstSource = buildTypstSource({
    sessionId: params.sessionId,
    createdAt: params.createdAt,
    groundTruth: params.groundTruth,
    sitrep: params.sitrep,
    forecasts: params.forecasts,
    summary: params.summary,
  });

  const dir = join(tmpdir(), "geopol-" + randomUUID());
  await mkdir(dir, { recursive: true });
  const inputPath = join(dir, "report.typ");
  const outputPath = join(dir, "report.pdf");

  await writeFile(inputPath, typstSource, "utf-8");

  const pdf = await new Promise<Buffer>((resolve, reject) => {
    execFile("typst", ["compile", inputPath, outputPath], (error) => {
      if (error) {
        reject(new Error(`Typst compilation failed: ${error.message}`));
        return;
      }
      readFile(outputPath).then(resolve).catch(reject);
    });
  });

  await Promise.all([unlink(inputPath), unlink(outputPath)]).catch(() => {});

  return { pdf, typstSource };
}

export async function savePdf(pdf: Buffer, sessionId: string, createdAt: string): Promise<string> {
  const dataDir = process.env.DB_PATH
    ? join(process.env.DB_PATH, "..", "reports")
    : join(process.cwd(), "data", "reports");
  await mkdir(dataDir, { recursive: true });

  const ts = new Date(createdAt).toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const filename = `geopol-report-${ts}-${sessionId.slice(0, 8)}.pdf`;
  const filepath = join(dataDir, filename);
  await writeFile(filepath, pdf);
  return filepath;
}
