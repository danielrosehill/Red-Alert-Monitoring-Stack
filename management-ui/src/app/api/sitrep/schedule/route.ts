import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";

export async function GET() {
  return NextResponse.json({
    schedule: getSetting("sitrep_schedule") || process.env.SITREP_SCHEDULE || "",
    deliver_to: getSetting("sitrep_deliver_to") || process.env.SITREP_DELIVER_TO || "telegram",
  });
}

export async function PUT(request: Request) {
  const body = await request.json();

  if (body.schedule !== undefined) {
    setSetting("sitrep_schedule", body.schedule);
  }
  if (body.deliver_to !== undefined) {
    setSetting("sitrep_deliver_to", body.deliver_to);
  }

  return NextResponse.json({ ok: true });
}
