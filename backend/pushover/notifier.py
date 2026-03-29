"""Standalone Pushover notifier for Oref Alert Proxy.

Polls the Oref Alert Proxy for active alerts and sends Pushover
notifications when the nationwide active area count crosses configurable
thresholds (default: 50, 100, 200, ... 1000).

All configuration via environment variables — see .env.example.
"""

import asyncio
import logging
import os
import sys

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("pushover-notifier")

# ---------------------------------------------------------------------------
# Configuration (all from env)
# ---------------------------------------------------------------------------

OREF_PROXY_URL = os.environ.get("OREF_PROXY_URL", "http://localhost:8764/api/alerts")
PUSHOVER_API_TOKEN = os.environ.get("PUSHOVER_API_TOKEN", "")
PUSHOVER_USER_KEYS_RAW = os.environ.get("PUSHOVER_USER_KEY", "")
PUSHOVER_USER_KEYS = [k.strip() for k in PUSHOVER_USER_KEYS_RAW.split(",") if k.strip()]
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "3"))
AREA_THRESHOLDS = sorted(
    int(t) for t in os.environ.get(
        "AREA_THRESHOLDS", "50,100,200,300,400,500,600,700,800,900,1000"
    ).split(",") if t.strip()
)

PUSHOVER_API_URL = "https://api.pushover.net/1/messages.json"

# Active threat categories — NOT 13 (all-clear), NOT 15-28 (drills)
ACTIVE_CATEGORIES = {1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def normalize_category(alert: dict) -> int:
    """Return the integer category from an alert dict.

    The raw Oref data uses the field name ``cat``; the geodash backend
    normalises it to ``category``.  Accept either.
    """
    raw = alert.get("category") or alert.get("cat") or 0
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


def count_active_areas(alerts: list[dict]) -> int:
    """Count unique area names under active threat categories."""
    active_areas: set[str] = set()
    for alert in alerts:
        if alert.get("alert_type") == "test":
            continue
        cat = normalize_category(alert)
        if cat in ACTIVE_CATEGORIES:
            area = alert.get("data", "")
            if area:
                active_areas.add(area)
    return len(active_areas)


def highest_crossed_threshold(count: int) -> int:
    """Return the highest threshold that *count* meets or exceeds (0 if none)."""
    crossed = 0
    for t in AREA_THRESHOLDS:
        if count >= t:
            crossed = t
    return crossed


# ---------------------------------------------------------------------------
# Pushover sender
# ---------------------------------------------------------------------------


async def send_pushover(
    client: httpx.AsyncClient,
    title: str,
    message: str,
    priority: int = 0,
    sound: str = "pushover",
) -> bool:
    """Send Pushover notification to all configured user keys.  Returns True if all succeed."""
    all_ok = True
    for user_key in PUSHOVER_USER_KEYS:
        payload: dict = {
            "token": PUSHOVER_API_TOKEN,
            "user": user_key,
            "title": title,
            "message": message,
            "priority": priority,
            "html": 1,
        }
        if sound:
            payload["sound"] = sound
        if priority == 2:
            payload["retry"] = 60
            payload["expire"] = 600

        try:
            resp = await client.post(PUSHOVER_API_URL, data=payload, timeout=10)
            data = resp.json()
            if data.get("status") == 1:
                log.info("Pushover sent to %s...: %s (priority=%d)", user_key[:8], title, priority)
            else:
                log.warning("Pushover API error for %s...: %s", user_key[:8], data.get("errors", data))
                all_ok = False
        except Exception as exc:
            log.error("Pushover send failed for %s...: %s", user_key[:8], exc)
            all_ok = False
    return all_ok


# ---------------------------------------------------------------------------
# Main poll loop
# ---------------------------------------------------------------------------


async def poll_loop() -> None:
    last_threshold_notified: int = 0

    async with httpx.AsyncClient() as client:
        log.info(
            "Starting notifier — proxy=%s  interval=%ds  thresholds=%s",
            OREF_PROXY_URL,
            POLL_INTERVAL,
            AREA_THRESHOLDS,
        )

        while True:
            try:
                resp = await client.get(OREF_PROXY_URL, timeout=10)
                resp.raise_for_status()
                data = resp.json()
                # Support both {"alerts": [...]} and raw [...] response formats
                alerts: list[dict] = data.get("alerts", data) if isinstance(data, dict) else data
            except Exception as exc:
                log.warning("Proxy fetch failed: %s", exc)
                await asyncio.sleep(POLL_INTERVAL)
                continue

            active_count = count_active_areas(alerts)
            current_threshold = highest_crossed_threshold(active_count)

            # Notify when crossing upward
            if current_threshold > last_threshold_notified:
                await send_pushover(
                    client,
                    title=f"Red Alert: {active_count} Areas Active",
                    message=(
                        f"Nationwide alert count has crossed "
                        f"{current_threshold} areas across Israel."
                    ),
                )

            # Reset when count drops below previously notified threshold
            if current_threshold < last_threshold_notified:
                log.info(
                    "Threshold reset: %d -> %d (active=%d)",
                    last_threshold_notified,
                    current_threshold,
                    active_count,
                )

            last_threshold_notified = current_threshold

            await asyncio.sleep(POLL_INTERVAL)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    if not PUSHOVER_API_TOKEN or not PUSHOVER_USER_KEYS:
        log.error(
            "PUSHOVER_API_TOKEN and PUSHOVER_USER_KEY must be set. Exiting."
        )
        sys.exit(1)

    try:
        asyncio.run(poll_loop())
    except KeyboardInterrupt:
        log.info("Shutting down.")


if __name__ == "__main__":
    main()
