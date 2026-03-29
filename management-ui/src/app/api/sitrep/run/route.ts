import { NextResponse } from "next/server";
import { generateSitrepPdf, saveSitrepPdf } from "@/lib/simulation/pdf";
import { uploadToDrive } from "@/lib/drive";
import { sendEmail } from "@/lib/email";

const PROMPT_RUNNER_URL =
  process.env.PROMPT_RUNNER_URL || "http://prompt-runner:8787";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const deliverTo: string[] = body.deliver_to ?? ["telegram"];
  const saveToDrive = body.save_to_drive === true;

  try {
    // Run SITREP via prompt runner
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

    // Generate PDF, save locally, and optionally upload to Drive
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

      // If email was requested but prompt runner didn't handle it, send with PDF
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

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
