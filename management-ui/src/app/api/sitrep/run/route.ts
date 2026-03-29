import { NextResponse } from "next/server";

const PROMPT_RUNNER_URL =
  process.env.PROMPT_RUNNER_URL || "http://prompt-runner:8787";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const deliverTo = body.deliver_to ?? ["telegram"];

  try {
    const resp = await fetch(`${PROMPT_RUNNER_URL}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template: "daily_sitrep",
        deliver_to: deliverTo,
      }),
      signal: AbortSignal.timeout(120_000),
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
