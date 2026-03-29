"""Immediate intelligence report for local missile events via OpenRouter.

When a missile launch targeting the user's configured location is detected,
queries a fast model via OpenRouter for latest reports on origin, number
of missiles, and source of fire. Rate-limited to one report per configurable
cooldown (default 10 min).
"""

import logging
import os
import time

import httpx

from news_context import fetch_headlines

log = logging.getLogger("osint-notifier")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
INTEL_COOLDOWN = int(os.environ.get("INTEL_COOLDOWN", "600"))
INTEL_MODEL = os.environ.get("INTEL_MODEL", "meta-llama/llama-4-scout")

_last_intel_time: float = 0


def can_run_intel() -> bool:
    return (time.time() - _last_intel_time) >= INTEL_COOLDOWN


async def generate_intel_report(
    trigger_message: str,
    source: str,
    location_name: str,
    openrouter_api_key: str,
) -> str | None:
    """Query OpenRouter for an immediate intelligence summary.

    Returns the report text, or None if cooldown active / API unavailable.
    """
    global _last_intel_time

    if not openrouter_api_key:
        log.debug("Intel skipped: no OPENROUTER_API_KEY")
        return None

    if not can_run_intel():
        remaining = INTEL_COOLDOWN - (time.time() - _last_intel_time)
        log.info("Intel skipped: cooldown (%.0fs remaining)", remaining)
        return None

    _last_intel_time = time.time()

    # Fetch live news headlines for context
    news = await fetch_headlines()

    system_prompt = (
        f"You are a concise military intelligence analyst providing immediate "
        f"situational awareness after a missile alert targeting {location_name}, Israel. "
        f"Your output will be sent as a push notification, so keep it under "
        f"250 words. Use plain text. Be factual. "
        f"Structure: ORIGIN, MUNITIONS, SCALE, ASSESSMENT."
    )

    user_prompt = (
        f"A missile launch targeting {location_name} has just been reported by {source}.\n\n"
        f"Original report:\n{trigger_message}\n\n"
    )
    if news:
        user_prompt += f"Recent news headlines for context:\n{news}\n\n"
    user_prompt += (
        "Based on the latest available information, provide:\n"
        "- Origin / source of fire (which country or group launched)\n"
        "- Number and type of missiles (ballistic, cruise, etc.)\n"
        "- Scale of the attack (how many areas affected)\n"
        "- Brief assessment of the situation\n\n"
        "If specific details are not yet available, state what is known "
        "and what is still uncertain."
    )

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                OPENROUTER_URL,
                json={
                    "model": INTEL_MODEL,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                },
                headers={
                    "Authorization": f"Bearer {openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://github.com/danielrosehill/Red-Alert-OSINT-Notifier",
                    "X-Title": "Red Alert OSINT Notifier",
                },
                timeout=30,
            )
            data = resp.json()
            choices = data.get("choices", [])
            if choices:
                report = choices[0].get("message", {}).get("content")
                if report:
                    log.info("Intel report generated (%d chars)", len(report))
                    return report
            log.warning("OpenRouter empty response: %s", data.get("error", data))
        except Exception as exc:
            log.error("Intel report failed: %s", exc)

    return None
