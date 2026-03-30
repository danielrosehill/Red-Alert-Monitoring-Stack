"""Red Alert SMS Relay — Twilio SMS + Voice notifications for alert events.

Polls the Oref Alert Proxy and sends SMS notifications on state transitions
(alert, warning, clear) and nationwide escalation thresholds. Optionally
places automated voice calls on all-clear so sheltering users know the
event is over without checking their phone.

Environment variables: see .env.example
"""

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from twilio.rest import Client as TwilioClient

from alert_constants import (
    ACTIVE_CATEGORIES,
    CATEGORY_NAMES,
    RED_CATEGORIES,
    THRESHOLD_LEVELS,
    normalize_category,
)

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("redalert.sms-relay")


def _log_task_exception(task: asyncio.Task):
    if not task.cancelled() and task.exception():
        log.error("Background task failed: %s", task.exception())


# ── Configuration ────────────────────────────────────────────────────────────

OREF_PROXY_URL = os.environ.get("OREF_PROXY_URL", "http://localhost:8764")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "3"))
LOCAL_AREA = os.environ.get("ALERT_AREA", "")
HTTP_PORT = int(os.environ.get("PORT", "8792"))
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

# Twilio credentials
TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM = os.environ.get("TWILIO_FROM_NUMBER", "")
SMS_RECIPIENTS = [r.strip() for r in os.environ.get("SMS_RECIPIENTS", "").split(",") if r.strip()]

# Voice call on all-clear (the fun part)
VOICE_ON_CLEAR = os.environ.get("TWILIO_VOICE_ON_CLEAR", "true").lower() == "true"
VOICE_MESSAGE = os.environ.get(
    "TWILIO_VOICE_MESSAGE",
    "Hi, this is your Red Alert system calling. Good news. The alert for your "
    "area is over. You are all clear to leave the protected space. Stay safe!",
)

# Nationwide escalation thresholds
ESCALATION_ENABLED = os.environ.get("ESCALATION_ENABLED", "false").lower() == "true"
ESCALATION_THRESHOLDS = [50, 100, 200, 300, 400, 500, 1000]

# Module enable check
API_URL = os.environ.get("API_URL", "http://red-alert-api:8890")

# ── Twilio Client ────────────────────────────────────────────────────────────

_twilio: TwilioClient | None = None

if TWILIO_SID and TWILIO_TOKEN:
    _twilio = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
    log.info("Twilio client initialized (SID: %s...)", TWILIO_SID[:8])
else:
    log.warning("TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set — SMS/voice disabled")


# ── Module Enable Check ─────────────────────────────────────────────────────

_enabled_cache: bool = True
_enabled_last_check: float = 0
_ENABLE_CHECK_INTERVAL = 30


async def _check_enabled(http_client: httpx.AsyncClient) -> bool:
    global _enabled_cache, _enabled_last_check
    now = time.time()
    if now - _enabled_last_check < _ENABLE_CHECK_INTERVAL:
        return _enabled_cache
    _enabled_last_check = now
    try:
        resp = await http_client.get(f"{API_URL}/api/modules/notifications", timeout=3)
        data = resp.json()
        was_enabled = _enabled_cache
        _enabled_cache = data.get("enabled", True)
        if was_enabled and not _enabled_cache:
            log.info("Module disabled via management UI — going dormant")
        elif not was_enabled and _enabled_cache:
            log.info("Module re-enabled via management UI — resuming")
    except Exception:
        pass
    return _enabled_cache


# ── SMS & Voice Helpers ──────────────────────────────────────────────────────


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M UTC %d/%m/%Y")


def _send_sms(body: str) -> int:
    """Send SMS to all recipients. Returns number sent."""
    if not _twilio or not SMS_RECIPIENTS:
        return 0
    sent = 0
    for number in SMS_RECIPIENTS:
        try:
            msg = _twilio.messages.create(body=body, from_=TWILIO_FROM, to=number)
            log.info("SMS sent to %s  sid=%s", number, msg.sid)
            sent += 1
        except Exception:
            log.exception("Failed to send SMS to %s", number)
    return sent


def _place_voice_call() -> int:
    """Place voice call to all recipients with the all-clear message."""
    if not _twilio or not SMS_RECIPIENTS or not VOICE_ON_CLEAR:
        return 0
    twiml = f'<Response><Say voice="alice" language="en-US">{VOICE_MESSAGE}</Say></Response>'
    placed = 0
    for number in SMS_RECIPIENTS:
        try:
            call = _twilio.calls.create(
                to=number,
                from_=TWILIO_FROM,
                twiml=twiml,
            )
            log.info("Voice call placed to %s  sid=%s", number, call.sid)
            placed += 1
        except Exception:
            log.exception("Failed to place voice call to %s", number)
    return placed


# ── Message Builders ─────────────────────────────────────────────────────────


def build_alert_message(alerts: list[dict]) -> str:
    areas = ", ".join(a.get("data", "?") for a in alerts[:5])
    title = alerts[0].get("title", "Alert") if alerts else "Alert"
    ts = _timestamp()
    return f"\U0001f6a8 ALERT: {title}\n{areas}\nGet to a protected space now!\n[Pikud HaOref \u2014 {ts}]"


def build_warning_message(alerts: list[dict]) -> str:
    areas = ", ".join(a.get("data", "?") for a in alerts[:5])
    ts = _timestamp()
    return f"\u26a0\ufe0f EARLY WARNING\n{areas}\n[Pikud HaOref \u2014 {ts}]"


def build_clear_message() -> str:
    ts = _timestamp()
    return f"\u2705 ALL CLEAR \u2014 You may leave the protected space.\n[Pikud HaOref \u2014 {ts}]"


def build_escalation_message(count: int, threshold: int) -> str:
    ts = _timestamp()
    if threshold >= 1000:
        return (
            f"\U0001f534 MASSIVE ATTACK \u2014 {count} alerts across Israel.\n"
            f"Stay in protected space. Do not leave until all-clear.\n"
            f"[Pikud HaOref \u2014 {ts}]"
        )
    elif threshold >= 500:
        return (
            f"\U0001f534 MAJOR ESCALATION \u2014 {count} simultaneous alerts across Israel.\n"
            f"Large-scale attack in progress. Stay sheltered.\n"
            f"[Pikud HaOref \u2014 {ts}]"
        )
    elif threshold >= 200:
        return (
            f"\U0001f7e0 SIGNIFICANT ESCALATION \u2014 {count} alerts nationwide.\n"
            f"Multi-region attack in progress.\n"
            f"[Pikud HaOref \u2014 {ts}]"
        )
    elif threshold >= 100:
        return (
            f"\U0001f7e1 ESCALATION \u2014 {count} alerts across Israel.\n"
            f"Large attack wave detected.\n"
            f"[Pikud HaOref \u2014 {ts}]"
        )
    else:
        return (
            f"\U0001f7e1 NATIONWIDE ALERT \u2014 {count} alerts detected across Israel.\n"
            f"Elevated threat level.\n"
            f"[Pikud HaOref \u2014 {ts}]"
        )


# ── Alert Monitor ────────────────────────────────────────────────────────────

_stats = {"sms_sent": 0, "calls_placed": 0, "escalations": 0}


class AlertMonitor:
    def __init__(self, http_client: httpx.AsyncClient):
        self.http_client = http_client
        self.prev_local_state: str = ""
        self.prev_threshold: int = 0
        self.prev_alert_ids: set[str] = set()

    async def poll(self):
        if not await _check_enabled(self.http_client):
            return

        try:
            resp = await self.http_client.get(
                f"{OREF_PROXY_URL}/api/alerts", timeout=10
            )
            data = resp.json()
            alerts = data.get("alerts", [])
        except Exception as e:
            log.error("Proxy poll error: %s", e)
            return

        # Normalize category field
        for a in alerts:
            if "cat" in a and "category" not in a:
                a["category"] = a["cat"]

        # Threshold checks every poll
        if ESCALATION_ENABLED:
            active = [a for a in alerts if normalize_category(a) in ACTIVE_CATEGORIES]
            active_areas = {a.get("data", "") for a in active}
            await self._process_thresholds(len(active_areas))

        # Localized alerts only on change
        current_ids = {f"{a.get('data', '')}:{normalize_category(a)}" for a in alerts}
        if current_ids == self.prev_alert_ids:
            return
        self.prev_alert_ids = current_ids

        await self._process_localized(alerts)

    async def _process_localized(self, alerts: list[dict]):
        local_state = ""
        local_alerts: list[dict] = []
        for a in alerts:
            if a.get("data", "") == LOCAL_AREA:
                cat = normalize_category(a)
                if cat in RED_CATEGORIES:
                    local_state = "active"
                    local_alerts.append(a)
                    break
                elif cat == 14:
                    local_state = "warning"
                    local_alerts.append(a)
                elif cat == 13:
                    local_state = "clear"

        if local_state == self.prev_local_state:
            return

        # Area dropped from alerts — implicit clear
        if local_state == "" and self.prev_local_state in ("active", "warning"):
            local_state = "clear"

        if local_state == "active":
            sent = _send_sms(build_alert_message(local_alerts))
            _stats["sms_sent"] += sent
        elif local_state == "warning":
            sent = _send_sms(build_warning_message(local_alerts))
            _stats["sms_sent"] += sent
        elif local_state == "clear" and self.prev_local_state in ("active", "warning"):
            sent = _send_sms(build_clear_message())
            _stats["sms_sent"] += sent
            # The fun part — ring them to say it's over
            placed = _place_voice_call()
            _stats["calls_placed"] += placed

        self.prev_local_state = local_state

    async def _process_thresholds(self, active_count: int):
        current = 0
        for t in ESCALATION_THRESHOLDS:
            if active_count >= t:
                current = t

        if current > self.prev_threshold:
            sent = _send_sms(build_escalation_message(active_count, current))
            _stats["sms_sent"] += sent
            _stats["escalations"] += 1

        if active_count < ESCALATION_THRESHOLDS[0] and self.prev_threshold > 0:
            log.info("Alert count dropped below %d, resetting escalation state", ESCALATION_THRESHOLDS[0])

        self.prev_threshold = current


# ── Shared state ─────────────────────────────────────────────────────────────

_monitor: AlertMonitor | None = None
_http_client: httpx.AsyncClient | None = None


# ── FastAPI app ──────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _monitor, _http_client

    _http_client = httpx.AsyncClient()
    _monitor = AlertMonitor(_http_client)

    log.info("SMS Relay starting...")
    log.info("Proxy: %s", OREF_PROXY_URL)
    log.info("Local area: %s", LOCAL_AREA or "(not configured)")
    log.info("Recipients: %s", ", ".join(SMS_RECIPIENTS) if SMS_RECIPIENTS else "(none)")
    log.info("Voice calls on clear: %s", "enabled" if VOICE_ON_CLEAR else "disabled")
    log.info("Escalation alerts: %s", "enabled" if ESCALATION_ENABLED else "disabled")

    poll_task = asyncio.create_task(_poll_loop())

    yield

    poll_task.cancel()
    try:
        await poll_task
    except asyncio.CancelledError:
        pass
    await _http_client.aclose()
    log.info("SMS Relay stopped")


async def _poll_loop():
    while True:
        await _monitor.poll()
        await asyncio.sleep(POLL_INTERVAL)


app = FastAPI(title="Red Alert SMS Relay", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "sms-relay",
        "local_area": LOCAL_AREA or None,
        "twilio_enabled": _twilio is not None,
        "recipients": len(SMS_RECIPIENTS),
        "voice_on_clear": VOICE_ON_CLEAR,
        "escalation_enabled": ESCALATION_ENABLED,
        "current_state": _monitor.prev_local_state if _monitor else "unknown",
        "sms_sent": _stats["sms_sent"],
        "calls_placed": _stats["calls_placed"],
    }


@app.post("/api/test/{msg_type}")
async def test_message(msg_type: str):
    """Send a test SMS/call. Types: alert, warning, clear, voice, escalation-50 ... escalation-1000"""
    sample_alerts = [{"title": "\u05d9\u05e8\u05d9 \u05e8\u05e7\u05d8\u05d5\u05ea \u05d5\u05d8\u05d9\u05dc\u05d9\u05dd", "data": LOCAL_AREA or "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05de\u05e8\u05db\u05d6", "category": 1}]

    if msg_type == "alert":
        body = build_alert_message(sample_alerts)
    elif msg_type == "warning":
        body = build_warning_message(sample_alerts)
    elif msg_type == "clear":
        body = build_clear_message()
    elif msg_type == "voice":
        placed = _place_voice_call()
        return {"status": "ok", "type": "voice", "calls_placed": placed}
    elif msg_type.startswith("escalation-"):
        try:
            threshold = int(msg_type.split("-")[1])
        except (IndexError, ValueError):
            return {"error": f"Invalid escalation threshold: {msg_type}"}
        body = build_escalation_message(threshold, threshold)
    else:
        return {
            "error": f"Unknown type: {msg_type}",
            "available": ["alert", "warning", "clear", "voice",
                          "escalation-50", "escalation-100", "escalation-200",
                          "escalation-500", "escalation-1000"],
        }

    sent = _send_sms(body)
    return {"status": "ok", "type": msg_type, "sms_sent": sent, "message": body}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=HTTP_PORT)
