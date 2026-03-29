import { GoogleGenAI } from "@google/genai";

export async function geminiSearchGrounded(prompt: string, systemPrompt?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const genai = new GoogleGenAI({ apiKey });

  const response = await genai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: [
      ...(systemPrompt
        ? [
            { role: "user" as const, parts: [{ text: systemPrompt }] },
            { role: "model" as const, parts: [{ text: "Understood. I will follow these instructions." }] },
          ]
        : []),
      { role: "user" as const, parts: [{ text: prompt }] },
    ],
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  return response.text ?? "";
}
