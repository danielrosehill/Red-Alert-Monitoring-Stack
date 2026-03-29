"""Immediate intelligence report for local missile events via OpenRouter.

When a missile launch targeting the user's configured location is detected,
queries a fast model via OpenRouter for latest reports on origin, number
of missiles, and source of fire. The LLM has tool access to the Red Alert
MCP server — it can pull current alerts, news headlines, and alert history
to inform its analysis.

Rate-limited to one report per configurable cooldown (default 10 min).
"""

import json
import logging
import os
import time

import httpx

log = logging.getLogger("osint-notifier")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
INTEL_COOLDOWN = int(os.environ.get("INTEL_COOLDOWN", "600"))
INTEL_MODEL = os.environ.get("INTEL_MODEL", "meta-llama/llama-4-scout")
MCP_SERVER_URL = os.environ.get("MCP_SERVER_URL", "http://mcp-server:8786")

_last_intel_time: float = 0

# Tools the LLM can call — backed by the MCP server's HTTP endpoints
INTEL_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_current_alerts",
            "description": "Get all currently active Pikud HaOref alerts across Israel, including area names, categories, and timestamps.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_news",
            "description": "Get cached recent news articles related to Israeli security from RSS feeds.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max articles to return (default 10, max 50)"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_alert_history",
            "description": "Get recent alert history including resolved alerts from the past few hours.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

# Map tool names to MCP server endpoints
TOOL_ENDPOINTS = {
    "get_current_alerts": "/api/alerts",
    "get_news": "/api/news",
    "get_alert_history": "/api/history",
}


async def _execute_tool(client: httpx.AsyncClient, name: str, args: dict) -> str:
    """Execute a tool call by hitting the corresponding service endpoint."""
    # OREF_PROXY_BASE_URL is the base (no path); OREF_PROXY_URL may include /api/alerts
    proxy_url = os.environ.get("OREF_PROXY_BASE_URL", "http://oref-proxy:8764")
    rss_url = os.environ.get("RSS_CACHE_URL", "http://rss-cache:8785")

    try:
        if name == "get_current_alerts":
            resp = await client.get(f"{proxy_url}/api/alerts", timeout=5)
            return json.dumps(resp.json(), ensure_ascii=False)
        elif name == "get_news":
            limit = args.get("limit", 15)
            resp = await client.get(f"{rss_url}/api/news", params={"limit": limit}, timeout=5)
            return json.dumps(resp.json(), ensure_ascii=False)
        elif name == "get_alert_history":
            resp = await client.get(f"{proxy_url}/api/history", timeout=10)
            return json.dumps(resp.json(), ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})
    return json.dumps({"error": f"Unknown tool: {name}"})


def can_run_intel() -> bool:
    return (time.time() - _last_intel_time) >= INTEL_COOLDOWN


async def generate_intel_report(
    trigger_message: str,
    source: str,
    location_name: str,
    openrouter_api_key: str,
) -> str | None:
    """Query OpenRouter for an immediate intelligence summary with tool access.

    The LLM can call get_current_alerts, get_news, and get_alert_history
    to gather its own context before generating the report.

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

    system_prompt = (
        f"You are a concise military intelligence analyst providing immediate "
        f"situational awareness after a missile alert targeting {location_name}, Israel. "
        f"You have access to tools that can fetch real-time alert data and news headlines. "
        f"Use them to gather context before writing your report. "
        f"Your output will be sent as a push notification, so keep it under "
        f"250 words. Use plain text. Be factual. "
        f"Structure: ORIGIN, MUNITIONS, SCALE, ASSESSMENT."
    )

    user_prompt = (
        f"A missile launch targeting {location_name} has just been reported by {source}.\n\n"
        f"Original report:\n{trigger_message}\n\n"
        "Use your tools to check current alerts and recent news, then provide:\n"
        "- Origin / source of fire (which country or group launched)\n"
        "- Number and type of missiles (ballistic, cruise, etc.)\n"
        "- Scale of the attack (how many areas affected)\n"
        "- Brief assessment of the situation\n\n"
        "If specific details are not yet available, state what is known "
        "and what is still uncertain."
    )

    headers = {
        "Authorization": f"Bearer {openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/danielrosehill/Red-Alert-OSINT-Notifier",
        "X-Title": "Red Alert OSINT Notifier",
    }

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    async with httpx.AsyncClient() as client:
        try:
            # Initial request with tools
            resp = await client.post(
                OPENROUTER_URL,
                json={
                    "model": INTEL_MODEL,
                    "messages": messages,
                    "tools": INTEL_TOOLS,
                },
                headers=headers,
                timeout=30,
            )
            data = resp.json()
            choice = (data.get("choices") or [{}])[0]
            message = choice.get("message", {})

            # Handle tool calls (single round — keep it fast)
            tool_calls = message.get("tool_calls", [])
            if tool_calls:
                messages.append(message)
                for tc in tool_calls:
                    fn = tc.get("function", {})
                    name = fn.get("name", "")
                    args = json.loads(fn.get("arguments", "{}"))
                    log.info("Intel tool call: %s(%s)", name, args)
                    try:
                        result = await _execute_tool(client, name, args)
                    except Exception as e:
                        result = json.dumps({"error": str(e)})
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": result,
                    })

                # Second request with tool results
                resp = await client.post(
                    OPENROUTER_URL,
                    json={
                        "model": INTEL_MODEL,
                        "messages": messages,
                    },
                    headers=headers,
                    timeout=30,
                )
                data = resp.json()
                choice = (data.get("choices") or [{}])[0]
                message = choice.get("message", {})

            report = message.get("content")
            if report:
                log.info("Intel report generated (%d chars, %d tool calls)", len(report), len(tool_calls))
                return report
            log.warning("OpenRouter empty response: %s", data.get("error", data))
        except Exception as exc:
            log.error("Intel report failed: %s", exc)

    return None
