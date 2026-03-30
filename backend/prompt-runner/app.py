"""Red Alert Prompt Runner — Templated AI prompt execution service.

Runs templated prompts via OpenRouter (supporting Groq, Gemini, etc.)
and pipes output to the Telegram bot, email (via Resend), or both.

Templates are stored as JSON in templates/ and use Jinja2 for variable
substitution. The service can be triggered:
  - On-demand via POST /api/run
  - Automatically by the actuator on local area alerts
  - On a schedule via SITREP_SCHEDULE (built-in scheduler)

Environment variables:
  OPENROUTER_API_KEY  — Required. API key for OpenRouter
  GROQ_API_KEY        — Optional. Direct Groq API key (faster for immediate intel)
  TELEGRAM_BOT_URL    — Telegram bot internal URL for sending outputs
  RSS_CACHE_URL       — RSS cache for news context
  OREF_PROXY_URL      — Alert proxy for current situation data
  PORT                — Listen port (default: 8787)
  RESEND_API_KEY      — Optional. Resend API key for email delivery
  SITREP_EMAIL_FROM   — Sender address for email SITREPs
  SITREP_EMAIL_TO     — Comma-separated recipient addresses
  SITREP_SCHEDULE     — UTC hours to auto-send SITREPs, e.g. "0,6,18" or "every:6"
  SITREP_DELIVER_TO   — Delivery targets for scheduled SITREPs: "telegram,email"
"""

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from jinja2 import Template
from pydantic import BaseModel

from email_sender import RESEND_API_KEY, send_email
from scheduler import scheduler_loop, parse_schedule, SITREP_SCHEDULE, SITREP_DELIVER_TO

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("redalert.prompt-runner")

# ── Configuration ────────────────────────────────────────────────────────────

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
TELEGRAM_BOT_URL = os.environ.get("TELEGRAM_BOT_URL", "http://telegram-bot:8781")
RSS_CACHE_URL = os.environ.get("RSS_CACHE_URL", "http://rss-cache:8785")
OREF_PROXY_URL = os.environ.get("OREF_PROXY_URL", "http://oref-proxy:8764")
ALERT_AREA = os.environ.get("ALERT_AREA", "")

CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# Models
IMMEDIATE_INTEL_MODEL = os.environ.get("IMMEDIATE_INTEL_MODEL", "llama-3.3-70b-versatile")
SITREP_MODEL = os.environ.get("SITREP_MODEL", "google/gemini-2.0-flash-001")

TEMPLATES_DIR = Path(__file__).parent / "templates"

# Debounce / cooldown for immediate_intel to prevent duplicate flash reports.
# Only one immediate_intel report per INTEL_COOLDOWN seconds (default 10 min).
INTEL_COOLDOWN = int(os.environ.get("INTEL_COOLDOWN", "600"))
_last_intel_time: float = 0

# ── Template Storage ────────────────────────────────────────────────────────


def load_templates() -> dict[str, dict]:
    """Load all prompt templates from the templates/ directory."""
    templates = {}
    for path in TEMPLATES_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text())
            templates[data.get("id", path.stem)] = data
        except (json.JSONDecodeError, OSError) as e:
            log.warning("Failed to load template %s: %s", path.name, e)
    return templates


# ── LLM Clients ─────────────────────────────────────────────────────────────


async def call_groq(
    client: httpx.AsyncClient, model: str, system: str, user: str
) -> str | None:
    """Call Groq API directly (faster for immediate intel)."""
    if not GROQ_API_KEY:
        return None
    try:
        resp = await client.post(
            GROQ_URL,
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        data = resp.json()
        choices = data.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content")
    except Exception as e:
        log.error("Groq call failed: %s", e)
    return None


async def call_openrouter(
    client: httpx.AsyncClient, model: str, system: str, user: str
) -> str | None:
    """Call OpenRouter API."""
    if not OPENROUTER_API_KEY:
        return None
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
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/danielrosehill/Red-Alert-Monitoring-Stack-Public",
                "X-Title": "Red Alert Prompt Runner",
            },
            timeout=60,
        )
        data = resp.json()
        choices = data.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content")
    except Exception as e:
        log.error("OpenRouter call failed: %s", e)
    return None


# ── Context Gathering ───────────────────────────────────────────────────────


async def gather_context(client: httpx.AsyncClient) -> dict:
    """Gather current alerts and news for prompt context."""
    context = {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "alert_area": ALERT_AREA,
        "alerts": [],
        "history": [],
        "news": [],
    }

    try:
        resp = await client.get(f"{OREF_PROXY_URL}/api/alerts", timeout=5)
        data = resp.json()
        context["alerts"] = data.get("alerts", [])
    except Exception as e:
        log.debug("Could not fetch alerts: %s", e)

    try:
        resp = await client.get(f"{OREF_PROXY_URL}/api/history", timeout=10)
        data = resp.json()
        context["history"] = data.get("history", [])
    except Exception as e:
        log.debug("Could not fetch history: %s", e)

    try:
        resp = await client.get(f"{RSS_CACHE_URL}/api/news", params={"limit": 20}, timeout=5)
        context["news"] = resp.json()
    except Exception as e:
        log.debug("Could not fetch news: %s", e)

    return context


# ── Output Delivery ─────────────────────────────────────────────────────────


async def send_to_telegram(client: httpx.AsyncClient, text: str) -> bool:
    """Send output to the Telegram bot's broadcast endpoint."""
    try:
        resp = await client.post(
            f"{TELEGRAM_BOT_URL}/api/broadcast",
            json={"text": text, "source": "prompt-runner"},
            timeout=10,
        )
        return resp.status_code == 200
    except Exception as e:
        log.debug("Telegram delivery failed: %s", e)
        return False


async def send_to_email(client: httpx.AsyncClient, text: str) -> bool:
    """Send SITREP output via Resend email."""
    subject = f"Red Alert SITREP — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
    return await send_email(client, subject, text)


# ── Scheduled SITREP Runner ────────────────────────────────────────────────


async def run_scheduled_sitrep(deliver_to: list[str]):
    """Execute the daily_sitrep template and deliver to specified targets."""
    templates = load_templates()
    template_data = templates.get("daily_sitrep")
    if not template_data:
        log.error("Scheduler: daily_sitrep template not found")
        return

    async with httpx.AsyncClient() as client:
        context = await gather_context(client)

        variables = {**template_data.get("variables", {})}
        variables["alert_area"] = variables.get("alert_area") or ALERT_AREA
        variables["context"] = context
        variables["alerts_json"] = json.dumps(context["alerts"], ensure_ascii=False, indent=2)
        variables["history_json"] = json.dumps(context["history"][:50], ensure_ascii=False, indent=2)
        variables["news_summary"] = "\n".join(
            f"- {a.get('title', '')} ({a.get('feed_name', '')})"
            for a in context.get("news", [])[:15]
        )

        system_tmpl = Template(template_data.get("system_prompt", ""))
        user_tmpl = Template(template_data.get("user_prompt", ""))
        system_prompt = system_tmpl.render(**variables)
        user_prompt = user_tmpl.render(**variables)

        model = template_data.get("model", SITREP_MODEL)
        output = await call_openrouter(client, model, system_prompt, user_prompt)

        if not output:
            log.error("Scheduler: LLM returned empty response for daily_sitrep")
            return

        delivered = []
        if "telegram" in deliver_to:
            if await send_to_telegram(client, output):
                delivered.append("telegram")
        if "email" in deliver_to:
            if await send_to_email(client, output):
                delivered.append("email")

        log.info("Scheduled SITREP delivered to: %s (%d chars)", delivered, len(output))


# ── App Lifespan ────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(scheduler_loop(run_scheduled_sitrep))
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


# ── Request Models ──────────────────────────────────────────────────────────


class RunRequest(BaseModel):
    template: str  # template ID
    variables: dict = {}  # override template variables
    deliver_to: list[str] = ["telegram"]  # delivery targets


class RunResponse(BaseModel):
    status: str
    template: str
    output: str = ""
    delivered_to: list[str] = []
    error: str = ""


# ── FastAPI App ─────────────────────────────────────────────────────────────

app = FastAPI(title="Red Alert Prompt Runner", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    templates = load_templates()
    schedule = parse_schedule(SITREP_SCHEDULE)
    return {
        "status": "ok",
        "service": "prompt-runner",
        "templates": list(templates.keys()),
        "openrouter": bool(OPENROUTER_API_KEY),
        "groq": bool(GROQ_API_KEY),
        "resend": bool(RESEND_API_KEY),
        "scheduler": {
            "enabled": schedule is not None,
            "schedule": SITREP_SCHEDULE or "disabled",
            "deliver_to": SITREP_DELIVER_TO,
        },
    }


@app.get("/api/templates")
async def list_templates():
    """List all available prompt templates."""
    templates = load_templates()
    return {
        "templates": [
            {
                "id": t["id"],
                "name": t.get("name", t["id"]),
                "description": t.get("description", ""),
                "variables": list(t.get("variables", {}).keys()),
                "api": t.get("api", "openrouter"),
            }
            for t in templates.values()
        ]
    }


@app.post("/api/run", response_model=RunResponse)
async def run_template(req: RunRequest):
    """Execute a prompt template and optionally deliver the output."""
    global _last_intel_time

    templates = load_templates()
    template_data = templates.get(req.template)

    if not template_data:
        return RunResponse(
            status="error", template=req.template,
            error=f"Template '{req.template}' not found. Available: {list(templates.keys())}"
        )

    # Debounce immediate_intel — skip if within cooldown window
    if req.template == "immediate_intel" and INTEL_COOLDOWN > 0:
        elapsed = time.time() - _last_intel_time
        if elapsed < INTEL_COOLDOWN:
            remaining = INTEL_COOLDOWN - elapsed
            log.info("Immediate intel skipped: cooldown (%.0fs remaining)", remaining)
            return RunResponse(
                status="skipped", template=req.template,
                error=f"Cooldown active ({remaining:.0f}s remaining of {INTEL_COOLDOWN}s)"
            )

    async with httpx.AsyncClient() as client:
        # Gather context
        context = await gather_context(client)

        # Merge template defaults with request overrides
        variables = {**template_data.get("variables", {}), **req.variables}
        variables["alert_area"] = variables.get("alert_area", ALERT_AREA)

        # Add context to variables
        variables["context"] = context
        variables["alerts_json"] = json.dumps(context["alerts"], ensure_ascii=False, indent=2)
        variables["history_json"] = json.dumps(context["history"][:50], ensure_ascii=False, indent=2)
        variables["news_summary"] = "\n".join(
            f"- {a.get('title', '')} ({a.get('feed_name', '')})"
            for a in context.get("news", [])[:15]
        )

        # Render the prompt template
        system_tmpl = Template(template_data.get("system_prompt", ""))
        user_tmpl = Template(template_data.get("user_prompt", ""))
        system_prompt = system_tmpl.render(**variables)
        user_prompt = user_tmpl.render(**variables)

        # Choose API
        api = template_data.get("api", "openrouter")
        model = template_data.get("model", SITREP_MODEL)

        if api == "groq" and GROQ_API_KEY:
            output = await call_groq(client, model, system_prompt, user_prompt)
        else:
            output = await call_openrouter(client, model, system_prompt, user_prompt)

        if not output:
            return RunResponse(
                status="error", template=req.template,
                error="LLM returned empty response"
            )

        # Deliver output
        delivered = []
        if "telegram" in req.deliver_to:
            if await send_to_telegram(client, output):
                delivered.append("telegram")
        if "email" in req.deliver_to:
            if await send_to_email(client, output):
                delivered.append("email")

        # Update cooldown timestamp for immediate_intel
        if req.template == "immediate_intel":
            _last_intel_time = time.time()

        log.info(
            "Template '%s' executed (%d chars), delivered to: %s",
            req.template, len(output), delivered or "none"
        )

        return RunResponse(
            status="ok", template=req.template,
            output=output, delivered_to=delivered
        )
