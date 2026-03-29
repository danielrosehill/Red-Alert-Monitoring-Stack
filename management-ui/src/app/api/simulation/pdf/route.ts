import { getSimulationSession } from "@/lib/db";
import { generatePdf } from "@/lib/simulation/pdf";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return new Response("id required", { status: 400 });
  }

  const session = getSimulationSession(id);
  if (!session) {
    return new Response("Session not found", { status: 404 });
  }

  const { pdf } = await generatePdf({
    sessionId: session.id,
    createdAt: session.created_at,
    groundTruth: session.ground_truth || "No ground truth available.",
    sitrep: session.sitrep ? JSON.parse(session.sitrep) : null,
    forecasts: session.forecasts ? JSON.parse(session.forecasts) : {},
    summary: session.summary ? JSON.parse(session.summary) : null,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="geopol-report-${session.id.slice(0, 8)}.pdf"`,
    },
  });
}
