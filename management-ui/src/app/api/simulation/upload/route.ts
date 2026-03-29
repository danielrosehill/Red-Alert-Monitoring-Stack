import { NextResponse } from "next/server";
import { getSimulationSession, upsertSimulationSession } from "@/lib/db";
import { uploadToDrive } from "@/lib/drive";

export async function POST(request: Request) {
  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const session = getSimulationSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (!session.pdf_path) {
    return NextResponse.json({ error: "No PDF generated for this session" }, { status: 400 });
  }

  const result = await uploadToDrive(session.pdf_path);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  upsertSimulationSession({
    id: session.id,
    createdAt: session.created_at,
    step: session.step,
    driveUrl: result.url,
  });

  return NextResponse.json({ url: result.url, fileId: result.fileId });
}
