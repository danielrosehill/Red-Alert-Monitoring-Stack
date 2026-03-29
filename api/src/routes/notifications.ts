import { Router } from "express";
import { sendEmail } from "../lib/email.js";
import { sendTelegram } from "../lib/telegram.js";

export const notificationsRouter = Router();

// Test Pushover notification
notificationsRouter.post("/test-pushover", async (req, res) => {
  const token = process.env.PUSHOVER_API_TOKEN;
  const user = process.env.PUSHOVER_USER_KEY;

  if (!token || !user) {
    return res.status(400).json({
      error: "PUSHOVER_API_TOKEN and PUSHOVER_USER_KEY must be configured",
    });
  }

  const title = req.body.title ?? "Red Alert: Test Notification";
  const message = req.body.message ?? "This is a test notification from the Red Alert Management Console.";
  const priority = req.body.priority ?? 0;

  const userKeys = user.split(",").map((k: string) => k.trim()).filter(Boolean);

  try {
    const results = await Promise.all(
      userKeys.map(async (userKey: string) => {
        const resp = await fetch("https://api.pushover.net/1/messages.json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            user: userKey,
            title,
            message,
            priority,
            sound: "pushover",
            html: 1,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        return { ok: resp.ok, ...(await resp.json()) };
      })
    );
    const allOk = results.every((r) => r.ok);
    res.json({ ok: allOk, recipients: results.length, results });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Test email
notificationsRouter.post("/test-email", async (req, res) => {
  const result = await sendEmail({
    subject: req.body.subject ?? "Red Alert: Test Email",
    text: req.body.message ?? "This is a test email from the Red Alert Management Console.",
  });
  res.json(result);
});

// Test Telegram
notificationsRouter.post("/test-telegram", async (req, res) => {
  const result = await sendTelegram(
    req.body.message ?? "This is a test message from the Red Alert Management Console."
  );
  res.json(result);
});
