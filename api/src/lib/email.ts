/** Email delivery via Resend — shared by SITREP and simulation delivery. */

import { Resend } from "resend";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendEmail(opts: {
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: "RESEND_API_KEY not configured" };

  const from = process.env.SITREP_EMAIL_FROM;
  const to = process.env.SITREP_EMAIL_TO?.split(",").map((s) => s.trim());

  if (!from || !to?.length) {
    return { ok: false, error: "SITREP_EMAIL_FROM / SITREP_EMAIL_TO not configured" };
  }

  try {
    const emailOpts: Parameters<typeof resend.emails.send>[0] = {
      from,
      to,
      subject: opts.subject,
      html: opts.html || opts.text || "",
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    };
    if (opts.text && !opts.html) {
      (emailOpts as unknown as Record<string, unknown>).text = opts.text;
    }
    await resend.emails.send(emailOpts);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
