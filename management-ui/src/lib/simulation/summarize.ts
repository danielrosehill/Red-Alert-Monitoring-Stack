/** Stage 4: Executive summary synthesis. */

import { generateText, Output } from "ai";
import { openrouter, MODELS } from "./openrouter";
import { LENSES } from "./types";
import { SummarySchema, type StructuredSummary, type StructuredLensForecast } from "./schemas";

export async function generateSummary(
  forecasts: Record<string, StructuredLensForecast>
): Promise<StructuredSummary> {
  const forecastText = LENSES.map((lens) => {
    const f = forecasts[lens.id];
    if (!f) return `=== ${lens.name.toUpperCase()} LENS ===\nNo forecast available.`;

    if (typeof f === "object" && "lensAssessment" in f) {
      const lines = [`=== ${lens.name.toUpperCase()} LENS ===`, f.lensAssessment, ""];
      for (const [tfId, tf] of Object.entries(f.timeframes)) {
        lines.push(`--- ${tfId} ---`, tf.overview);
        for (const p of tf.predictions) {
          lines.push(`- ${p.prediction} (${p.probability}, ${p.confidence} confidence): ${p.reasoning}`);
        }
        lines.push(`Risks: ${tf.keyRisks.join("; ")}`, "");
      }
      return lines.join("\n");
    }

    return `=== ${lens.name.toUpperCase()} LENS ===\nN/A`;
  }).join("\n\n");

  const result = await generateText({
    model: openrouter(MODELS.grok),
    output: Output.object({ schema: SummarySchema }),
    system: `You are a senior geopolitical analyst. You will receive six different forecast analyses of the Iran-Israel-US conflict, each from a different analytical lens (Neutral, Pessimistic, Optimistic, Blindsides, Probabilistic, Historical).

Produce a structured executive summary that:
- Provides an overall assessment synthesizing all perspectives
- Identifies consensus themes (where most lenses agree)
- Lists high-confidence predictions with lens agreement counts
- Highlights key divergences between lenses
- Flags critical uncertainties
- Provides actionable insights for decision-makers

Be precise and analytical. Reference specific lenses by name when noting agreement or divergence.`,
    prompt: forecastText,
  });

  return result.output as StructuredSummary;
}
