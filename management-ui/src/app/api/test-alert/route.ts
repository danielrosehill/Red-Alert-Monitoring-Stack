import { NextResponse } from "next/server";

const ACTUATOR_URL = process.env.ACTUATOR_URL || "http://actuator:8782";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  try {
    const resp = await fetch(`${ACTUATOR_URL}/api/test-alert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alert_type: body.alert_type ?? "red_alert",
        area: body.area ?? "",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
