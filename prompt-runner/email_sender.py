"""Email delivery via Resend API.

Sends SITREP output as plain-text email through the Resend transactional
email service.  Only requires RESEND_API_KEY, SITREP_EMAIL_FROM, and
SITREP_EMAIL_TO to be set — otherwise silently skips.
"""

import logging
import os

import httpx

log = logging.getLogger("redalert.prompt-runner.email")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SITREP_EMAIL_FROM = os.environ.get("SITREP_EMAIL_FROM", "")
SITREP_EMAIL_TO = os.environ.get("SITREP_EMAIL_TO", "")  # comma-separated

RESEND_URL = "https://api.resend.com/emails"


async def send_email(
    client: httpx.AsyncClient,
    subject: str,
    body: str,
) -> bool:
    """Send a SITREP email via Resend. Returns True on success."""
    if not all([RESEND_API_KEY, SITREP_EMAIL_FROM, SITREP_EMAIL_TO]):
        log.debug("Email delivery skipped — RESEND_API_KEY/FROM/TO not configured")
        return False

    recipients = [addr.strip() for addr in SITREP_EMAIL_TO.split(",") if addr.strip()]
    if not recipients:
        return False

    try:
        resp = await client.post(
            RESEND_URL,
            json={
                "from": SITREP_EMAIL_FROM,
                "to": recipients,
                "subject": subject,
                "text": body,
            },
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )
        if resp.status_code in (200, 201):
            log.info("Email sent to %s via Resend", recipients)
            return True
        log.error("Resend API error %d: %s", resp.status_code, resp.text)
    except Exception as e:
        log.error("Email delivery failed: %s", e)
    return False
