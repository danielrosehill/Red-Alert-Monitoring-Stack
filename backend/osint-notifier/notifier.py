"""Pushover notification sender — shared by all alert sources."""

import logging

import httpx

log = logging.getLogger("osint-notifier")

PUSHOVER_API = "https://api.pushover.net/1/messages.json"


async def send_pushover(
    app_token: str,
    group_key: str,
    title: str,
    body: str,
    priority: int = 1,
    sound: str = "siren",
) -> bool:
    """Send a Pushover notification.

    Priority levels:
      0 = normal
      1 = high (bypasses quiet hours)
      2 = emergency (repeats until acknowledged)
    """
    payload = {
        "token": app_token,
        "user": group_key,
        "title": f"Red Alert: {title}",
        "message": body,
        "priority": priority,
        "sound": sound,
        "html": 1,
    }
    if priority == 2:
        payload["retry"] = 30
        payload["expire"] = 600

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(PUSHOVER_API, data=payload, timeout=10)
            if resp.status_code == 200:
                log.info("Pushover sent: %s (priority=%d)", title, priority)
                return True
            log.warning("Pushover error: %s", resp.text)
            return False
        except Exception as exc:
            log.error("Pushover send failed: %s", exc)
            return False
