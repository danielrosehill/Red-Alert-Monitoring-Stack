import { NextResponse } from "next/server";
import {
  listSimulationSessions,
  getSimulationSession,
  deleteSimulationSession,
} from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const session = getSimulationSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({
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

  return NextResponse.json(sessions);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  deleteSimulationSession(id);
  return NextResponse.json({ ok: true });
}
