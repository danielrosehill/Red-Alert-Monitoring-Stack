import { NextResponse } from "next/server";
import { getAllStatuses, SERVICES } from "@/lib/services";

export async function GET() {
  const statuses = await getAllStatuses();
  return NextResponse.json({
    services: SERVICES,
    statuses,
    checkedAt: new Date().toISOString(),
  });
}
