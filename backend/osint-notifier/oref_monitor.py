"""Oref Alert Proxy poller — volumetric threshold alerts.

Polls the Oref Alert Proxy for active alerts and fires a callback
when the nationwide active area count crosses configurable thresholds.
"""

import asyncio
import logging

import httpx

log = logging.getLogger("osint-notifier")

# Active threat categories — NOT 13 (all-clear), NOT 15-28 (drills)
ACTIVE_CATEGORIES = {1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14}


def normalize_category(alert: dict) -> int:
    raw = alert.get("category") or alert.get("cat") or 0
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


def count_active_areas(alerts: list[dict]) -> int:
    active_areas: set[str] = set()
    for alert in alerts:
        if alert.get("alert_type") == "test":
            continue
        cat = normalize_category(alert)
        if cat in ACTIVE_CATEGORIES:
            data = alert.get("data", [])
            # data can be a list of area names or a single string
            if isinstance(data, list):
                active_areas.update(a for a in data if a)
            elif data:
                active_areas.add(data)
    return len(active_areas)


def highest_crossed_threshold(count: int, thresholds: list[int]) -> int:
    crossed = 0
    for t in thresholds:
        if count >= t:
            crossed = t
    return crossed


async def oref_poll_loop(
    proxy_url: str,
    poll_interval: int,
    thresholds: list[int],
    on_threshold,
) -> None:
    """Poll Oref proxy and call on_threshold(active_count, threshold) on crossings."""
    last_threshold_notified = 0

    async with httpx.AsyncClient() as client:
        log.info(
            "Oref monitor started — proxy=%s interval=%ds thresholds=%s",
            proxy_url, poll_interval, thresholds,
        )

        while True:
            try:
                resp = await client.get(proxy_url, timeout=10)
                resp.raise_for_status()
                raw = resp.json()
                # Handle both flat list and {"alerts": [...]} wrapper
                if isinstance(raw, dict):
                    alerts: list[dict] = raw.get("alerts", [])
                else:
                    alerts = raw
            except Exception as exc:
                log.warning("Oref proxy fetch failed: %s", exc)
                await asyncio.sleep(poll_interval)
                continue

            active_count = count_active_areas(alerts)
            current_threshold = highest_crossed_threshold(active_count, thresholds)

            if current_threshold > last_threshold_notified:
                await on_threshold(active_count, current_threshold)

            if current_threshold < last_threshold_notified:
                log.info(
                    "Oref threshold reset: %d -> %d (active=%d)",
                    last_threshold_notified, current_threshold, active_count,
                )

            last_threshold_notified = current_threshold
            await asyncio.sleep(poll_interval)
