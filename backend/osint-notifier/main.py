#!/usr/bin/env python3
"""Red Alert OSINT Notifier — unified notification and intelligence module.

Monitors multiple sources for missile launch alerts and volumetric
nationwide alert thresholds, delivers Pushover notifications, and
generates AI-powered intelligence reports for local-area events.
All LLM calls go through OpenRouter (single API key).

Sources:
  1. Telegram channels (EN/HE) — journalist missile launch reports
  2. Oref Alert Proxy — volumetric nationwide alert thresholds
  3. OpenRouter intel — immediate intelligence report on local-area events
  4. OpenRouter sitrep — dual-model synthesized situation report on local events

Credit: Emanuel (Mannie) Fabian, Times of Israel military correspondent
        https://www.timesofisrael.com/writers/emanuel-fabian/
"""

import asyncio
import logging
import os
import sys

from classifiers import classify_en, classify_he
from intel import generate_intel_report
from notifier import send_pushover
from oref_monitor import oref_poll_loop
from sitrep import generate_sitrep
from telegram_monitor import ChannelMessage, ChannelPoller

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("osint-notifier")

# ── Configuration (all from env) ────────────────────────────────────────────

PUSHOVER_APP_TOKEN = os.environ.get("PUSHOVER_APP_TOKEN", "")
PUSHOVER_GROUP_KEY = os.environ.get("PUSHOVER_GROUP_KEY", "")

TELEGRAM_CHANNEL_EN = os.environ.get("TELEGRAM_CHANNEL_EN", "manniefabian")
TELEGRAM_CHANNEL_HE = os.environ.get("TELEGRAM_CHANNEL_HE", "news0404il")
TELEGRAM_POLL_INTERVAL = int(os.environ.get("TELEGRAM_POLL_INTERVAL", "15"))

# Location targeting — set to your area
LOCATION_NAME = os.environ.get("LOCATION_NAME", "Jerusalem")
LOCAL_KEYWORDS_EN = [
    kw.strip() for kw in
    os.environ.get("LOCAL_KEYWORDS_EN", "jerusalem,central israel").split(",")
    if kw.strip()
]
LOCAL_KEYWORDS_HE = [
    kw.strip() for kw in
    os.environ.get("LOCAL_KEYWORDS_HE", "ירושלים,מרכז הארץ").split(",")
    if kw.strip()
]

OREF_ENABLED = os.environ.get("OREF_ENABLED", "true").lower() in ("true", "1", "yes")
OREF_PROXY_URL = os.environ.get("OREF_PROXY_URL", "http://host.docker.internal:8764/api/alerts")
OREF_POLL_INTERVAL = int(os.environ.get("OREF_POLL_INTERVAL", "3"))
OREF_AREA_THRESHOLDS = sorted(
    int(t) for t in os.environ.get(
        "OREF_AREA_THRESHOLDS", "50,100,200,300,400,500,600,700,800,900,1000"
    ).split(",") if t.strip()
)

# Single API key for all LLM calls (intel + sitrep) via OpenRouter
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")


# ── Notification helpers ────────────────────────────────────────────────────

async def notify_missile(source: str, text: str, local_targeted: bool):
    """Send missile launch Pushover alert + optional intel report.

    Priority levels:
      - Local area targeted: high (P1) — bypasses quiet hours
      - Other launches: normal (P0) — informational
    """
    if local_targeted:
        title = f"MISSILE ALERT — {LOCATION_NAME.upper()}"
        priority = 1  # high — bypasses quiet hours but no repeat
        sound = "alien"
    else:
        title = "Missile Launch Reported"
        priority = 0
        sound = "pushover"

    body = f"<b>Source: {source}</b>\n\n{text}"
    await send_pushover(PUSHOVER_APP_TOKEN, PUSHOVER_GROUP_KEY, title, body, priority, sound)

    # Trigger intel + sitrep for local-area events only
    if local_targeted and OPENROUTER_API_KEY:
        # Fast intel report (~5s)
        report = await generate_intel_report(
            text, source, LOCATION_NAME, OPENROUTER_API_KEY,
        )
        if report:
            await send_pushover(
                PUSHOVER_APP_TOKEN, PUSHOVER_GROUP_KEY,
                f"INTEL REPORT — {LOCATION_NAME} Missile Event",
                report,
                priority=0,
                sound="pushover",
            )

        # Dual-model sitrep (~15-30s)
        sitrep = await generate_sitrep(
            text, source, LOCATION_NAME, OPENROUTER_API_KEY,
        )
        if sitrep:
            await send_pushover(
                PUSHOVER_APP_TOKEN, PUSHOVER_GROUP_KEY,
                f"SITREP — {LOCATION_NAME}",
                sitrep,
                priority=0,
                sound="pushover",
            )


async def notify_volumetric(active_count: int, threshold: int):
    """Send Oref volumetric threshold Pushover alert (informational)."""
    await send_pushover(
        PUSHOVER_APP_TOKEN, PUSHOVER_GROUP_KEY,
        f"Red Alert: {active_count} Areas Active",
        f"Nationwide alert count has crossed {threshold} areas across Israel.",
        priority=-1,
        sound="none",
    )


# ── Telegram channel handlers ──────────────────────────────────────────────

async def handle_en(msg: ChannelMessage):
    if len(msg.text.strip()) < 10:
        return
    log.info("EN [%s]: %s", msg.msg_id, msg.text[:120])
    result = classify_en(msg.text, LOCAL_KEYWORDS_EN)
    log.info("EN classification: %s", result)
    if result["missile_launch"]:
        await notify_missile(
            f"Mannie Fabian (@{TELEGRAM_CHANNEL_EN})", msg.text, result["local_targeted"],
        )


async def handle_he(msg: ChannelMessage):
    if len(msg.text.strip()) < 10:
        return
    log.info("HE [%s]: %s", msg.msg_id, msg.text[:120])
    result = classify_he(msg.text, LOCAL_KEYWORDS_HE)
    log.info("HE classification: %s", result)
    if result["missile_launch"]:
        await notify_missile(
            f"חדשות 0404 (@{TELEGRAM_CHANNEL_HE})", msg.text, result["local_targeted"],
        )


# ── Poll loops ──────────────────────────────────────────────────────────────

async def telegram_poll_loop(poller: ChannelPoller, handler):
    poller.seed()
    log.info("Polling @%s every %ds", poller.channel, TELEGRAM_POLL_INTERVAL)
    while True:
        for msg in poller.poll_once():
            try:
                await handler(msg)
            except Exception:
                log.exception("Handler failed for %s", msg.msg_id)
        await asyncio.sleep(TELEGRAM_POLL_INTERVAL)


# ── Main ────────────────────────────────────────────────────────────────────

async def run():
    log.info("Starting Red Alert OSINT Notifier")
    log.info("Location: %s (EN: %s, HE: %s)", LOCATION_NAME, LOCAL_KEYWORDS_EN, LOCAL_KEYWORDS_HE)

    if not PUSHOVER_APP_TOKEN or not PUSHOVER_GROUP_KEY:
        log.error("PUSHOVER_APP_TOKEN and PUSHOVER_GROUP_KEY are required. Exiting.")
        sys.exit(1)

    tasks = []

    if TELEGRAM_CHANNEL_EN:
        log.info("EN channel: @%s", TELEGRAM_CHANNEL_EN)
        poller_en = ChannelPoller(TELEGRAM_CHANNEL_EN)
        tasks.append(telegram_poll_loop(poller_en, handle_en))

    if TELEGRAM_CHANNEL_HE:
        log.info("HE channel: @%s", TELEGRAM_CHANNEL_HE)
        poller_he = ChannelPoller(TELEGRAM_CHANNEL_HE)
        tasks.append(telegram_poll_loop(poller_he, handle_he))

    if OREF_ENABLED:
        log.info("Oref volumetric: %s", OREF_PROXY_URL)
        tasks.append(oref_poll_loop(
            OREF_PROXY_URL, OREF_POLL_INTERVAL, OREF_AREA_THRESHOLDS, notify_volumetric,
        ))

    if OPENROUTER_API_KEY:
        log.info("OpenRouter AI (intel + sitrep): enabled")
    else:
        log.info("OpenRouter AI (intel + sitrep): disabled (no OPENROUTER_API_KEY)")

    if not tasks:
        log.error("No alert sources enabled. Exiting.")
        sys.exit(1)

    await asyncio.gather(*tasks)


def main():
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        log.info("Shutting down.")


if __name__ == "__main__":
    main()
