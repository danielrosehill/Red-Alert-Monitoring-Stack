import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/simulation/pipeline";

export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const deliverTo = body.deliver_to ?? ["email"];

  try {
    const result = await runPipeline({ deliverTo });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
