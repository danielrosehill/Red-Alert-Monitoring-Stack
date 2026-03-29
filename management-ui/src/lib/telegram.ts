/** Telegram delivery — sends messages via the telegram-bot service. */

const TELEGRAM_BOT_URL =
  process.env.TELEGRAM_BOT_URL || "http://telegram-bot:8781";

export async function sendTelegram(
  text: string,
  source = "management-ui"
): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch(`${TELEGRAM_BOT_URL}/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
