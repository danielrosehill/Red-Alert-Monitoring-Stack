"""Dual-model situation report generator via OpenRouter.

Queries two LLMs in parallel, then synthesizes both responses into a
single authoritative sitrep. Triggered on local-area missile events
as a follow-up to the immediate Groq intel report.

Shares the same cooldown as intel.py to avoid notification spam.
"""

import asyncio
import logging
import os

import httpx

from news_context import fetch_headlines

log = logging.getLogger("osint-notifier")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

SITREP_MODEL_A = os.environ.get("SITREP_MODEL_A", "google/gemini-3-flash-preview")
SITREP_MODEL_B = os.environ.get("SITREP_MODEL_B", "x-ai/grok-4.1-fast")
SITREP_SYNTHESIS_MODEL = os.environ.get("SITREP_SYNTHESIS_MODEL", "google/gemini-3-flash-preview")


async def _query_openrouter(
    client: httpx.AsyncClient,
    api_key: str,
    model: str,
    system: str,
    user: str,
) -> str | None:
    try:
        resp = await client.post(
            OPENROUTER_URL,
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/danielrosehill/Red-Alert-OSINT-Notifier",
                "X-Title": "Red Alert OSINT Notifier",
            },
            timeout=30,
        )
        data = resp.json()
        choices = data.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content")
        log.warning("OpenRouter empty (%s): %s", model, data.get("error", data))
    except Exception as e:
        log.error("OpenRouter error (%s): %s", model, e)
    return None


async def generate_sitrep(
    trigger_message: str,
    source: str,
    location_name: str,
    openrouter_api_key: str,
) -> str | None:
    """Generate a dual-model synthesized situation report.

    Returns the sitrep text, or None if API unavailable.
    """
    if not openrouter_api_key:
        log.debug("Sitrep skipped: no OPENROUTER_API_KEY")
        return None

    # Fetch live news headlines for context
    news = await fetch_headlines()

    system_prompt = (
        "You are a military-style situation report (sitrep) generator for Israel's "
        "Home Front Command alert system. Generate a concise, professional sitrep "
        f"focused on the current missile event targeting {location_name}. "
        "Use clear, direct language. Structure: SITUATION, KEY DEVELOPMENTS, ASSESSMENT. "
        "Keep it under 200 words. Plain text only, no markdown."
    )

    user_prompt = (
        f"A missile launch targeting {location_name} has been reported by {source}.\n\n"
        f"Report:\n{trigger_message}\n\n"
    )
    if news:
        user_prompt += f"Recent news headlines for context:\n{news}\n\n"
    user_prompt += (
        "Generate a situation report covering the current threat, "
        "likely origin, scale, and recommended posture."
    )

    async with httpx.AsyncClient() as client:
        # Query two models in parallel
        report_a, report_b = await asyncio.gather(
            _query_openrouter(client, openrouter_api_key, SITREP_MODEL_A, system_prompt, user_prompt),
            _query_openrouter(client, openrouter_api_key, SITREP_MODEL_B, system_prompt, user_prompt),
        )

        if not report_a and not report_b:
            log.warning("Sitrep: both models returned empty")
            return None

        # If only one responded, use it directly
        if not report_a or not report_b:
            sitrep = report_a or report_b
            log.info("Sitrep generated (single model, %d chars)", len(sitrep))
            return sitrep

        # Synthesize both into one authoritative report
        synthesis_system = (
            "You are an intelligence analyst. You will receive two independent "
            "situation reports about the same missile event from different AI models. "
            "Synthesize them into a single authoritative sitrep that draws the "
            "best analysis from each source. Resolve contradictions by "
            "favoring the more specific claim. "
            "Structure: SITUATION, KEY DEVELOPMENTS, ASSESSMENT. "
            "Keep it under 200 words. Plain text only, no markdown."
        )
        synthesis_prompt = (
            f"Report A ({SITREP_MODEL_A}):\n{report_a}\n\n"
            f"Report B ({SITREP_MODEL_B}):\n{report_b}\n\n"
            "Synthesize into one authoritative sitrep."
        )

        final = await _query_openrouter(
            client, openrouter_api_key, SITREP_SYNTHESIS_MODEL,
            synthesis_system, synthesis_prompt,
        )
        if final:
            log.info("Sitrep synthesized (%d chars)", len(final))
            return final

        # Fallback to model A if synthesis fails
        log.info("Sitrep synthesis failed, using model A (%d chars)", len(report_a))
        return report_a
