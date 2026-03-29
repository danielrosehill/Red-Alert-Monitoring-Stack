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
    """Send a Pushover notification to one or more users.

    *group_key* may be a single key or comma-separated list of keys.

    Priority levels:
      0 = normal
      1 = high (bypasses quiet hours)
      2 = emergency (repeats until acknowledged)
    """
    user_keys = [k.strip() for k in group_key.split(",") if k.strip()]
    if not user_keys:
        log.warning("No Pushover user keys provided")
        return False

    all_ok = True
    async with httpx.AsyncClient() as client:
        for user_key in user_keys:
            payload = {
                "token": app_token,
                "user": user_key,
                "title": f"Red Alert: {title}",
                "message": body,
                "priority": priority,
                "sound": sound,
                "html": 1,
            }
            if priority == 2:
                payload["retry"] = 30
                payload["expire"] = 600

            try:
                resp = await client.post(PUSHOVER_API, data=payload, timeout=10)
                if resp.status_code == 200:
                    log.info("Pushover sent to %s...: %s (priority=%d)", user_key[:8], title, priority)
                else:
                    log.warning("Pushover error for %s...: %s", user_key[:8], resp.text)
                    all_ok = False
            except Exception as exc:
                log.error("Pushover send failed for %s...: %s", user_key[:8], exc)
                all_ok = False
    return all_ok
