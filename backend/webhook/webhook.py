"""Red Alert Webhook — HTTP POST notifications for alert events.

Polls the Oref Alert Proxy for alert data and fires HTTP POST webhooks
on all alert conditions:
  - Localized: active (categories 1-12), warning (14), clear (13)
  - Nationwide: threshold crossings at 50, 100, 200 ... 1000 areas

Environment variables: see .env.example
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
log = logging.getLogger("redalert.webhook")


def _log_task_exception(task: asyncio.Task):
    if not task.cancelled() and task.exception():
        log.error("Background task failed: %s", task.exception())


# ── Configuration ────────────────────────────────────────────────────────────

OREF_PROXY_URL = os.environ.get("OREF_PROXY_URL", "http://localhost:8764")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "3"))
LOCAL_AREA = os.environ.get("ALERT_AREA", "")
HTTP_PORT = int(os.environ.get("PORT", "8784"))
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

# Webhook destinations (comma-separated URLs)
WEBHOOK_URLS = [u.strip() for u in os.environ.get("WEBHOOK_URLS", "").split(",") if u.strip()]

# Optional HMAC-SHA256 signing
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")

# Delivery timeout
WEBHOOK_TIMEOUT = int(os.environ.get("WEBHOOK_TIMEOUT", "10"))

# Module enable check
API_URL = os.environ.get("API_URL", "http://red-alert-api:8890")

# ── Module Enable Check ─────────────────────────────────────────────────────

_enabled_cache: bool = True
_enabled_last_check: float = 0
_ENABLE_CHECK_INTERVAL = 30  # seconds


async def _check_enabled(http_client: httpx.AsyncClient) -> bool:
    """Check if this module is enabled via the API. Cached for 30s, fail-open."""
    global _enabled_cache, _enabled_last_check
    now = time.time()
    if now - _enabled_last_check < _ENABLE_CHECK_INTERVAL:
        return _enabled_cache
    _enabled_last_check = now
    try:
        resp = await http_client.get(
            f"{API_URL}/api/modules/webhook", timeout=3
        )
        data = resp.json()
        was_enabled = _enabled_cache
        _enabled_cache = data.get("enabled", True)
        if was_enabled and not _enabled_cache:
            log.info("Module disabled via management UI — going dormant")
        elif not was_enabled and _enabled_cache:
            log.info("Module re-enabled via management UI — resuming")
    except Exception:
        pass  # fail-open: assume enabled if API unreachable
    return _enabled_cache


# ── Webhook Delivery ─────────────────────────────────────────────────────────


def _sign_payload(payload_bytes: bytes) -> str:
    """Compute HMAC-SHA256 signature for webhook payload."""
    return hmac.new(
        WEBHOOK_SECRET.encode(), payload_bytes, hashlib.sha256
    ).hexdigest()


async def _deliver_webhook(
    http_client: httpx.AsyncClient, payload: dict
) -> tuple[int, int]:
    """Send payload to all webhook URLs. Returns (successes, failures)."""
    if not WEBHOOK_URLS:
        return 0, 0

    payload_bytes = json.dumps(payload, ensure_ascii=False).encode()
    headers = {"Content-Type": "application/json"}
    if WEBHOOK_SECRET:
        headers["X-Webhook-Signature"] = _sign_payload(payload_bytes)

    successes = 0
    failures = 0

    for url in WEBHOOK_URLS:
        for attempt in range(2):  # 1 retry
            try:
                resp = await http_client.post(
                    url,
                    content=payload_bytes,
                    headers=headers,
                    timeout=WEBHOOK_TIMEOUT,
                )
                if resp.status_code < 400:
                    log.info("Webhook delivered to %s (HTTP %d)", url, resp.status_code)
                    successes += 1
                    break
                else:
                    log.warning("Webhook %s returned HTTP %d", url, resp.status_code)
                    if attempt == 1:
                        failures += 1
            except Exception as e:
                if attempt == 0:
                    log.debug("Webhook %s failed, retrying in 2s: %s", url, e)
                    await asyncio.sleep(2)
                else:
                    log.warning("Webhook delivery failed to %s: %s", url, e)
                    failures += 1

    return successes, failures


# ── Alert Monitor ────────────────────────────────────────────────────────────

_delivery_stats = {"total": 0, "failed": 0, "last_delivery": None}


class AlertMonitor:
    def __init__(self, http_client: httpx.AsyncClient):
        self.http_client = http_client
        self.prev_local_state: str = ""
        self.prev_threshold: int = 0
        self.prev_alert_ids: set[str] = set()
        self.last_active_time: float = 0

    async def poll(self):
        """Fetch alerts from proxy and fire webhooks on state changes."""
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

        # Classify all alerts for threshold checks
        active = [a for a in alerts if a.get("category", 0) in ACTIVE_CATEGORIES]
        active_areas = {a.get("data", "") for a in active}
        active_count = len(active_areas)

        # Thresholds checked every poll
        await self._process_general_alerts(active_count)

        # Localized alerts only fire on actual changes
        current_ids = {f"{a.get('data', '')}:{a.get('category', 0)}" for a in alerts}
        if current_ids == self.prev_alert_ids:
            return
        self.prev_alert_ids = current_ids

        await self._process_localized_alerts(alerts)

    async def _process_localized_alerts(self, alerts: list[dict]):
        """Handle alerts for the user's ALERT_AREA."""
        local_state = ""
        local_category = 0
        for a in alerts:
            if a.get("data", "") == LOCAL_AREA:
                cat = normalize_category(a)
                if cat in RED_CATEGORIES:
                    local_state = "active"
                    local_category = cat
                    break
                elif cat == 14:
                    local_state = "warning"
                    local_category = 14
                elif cat == 13:
                    local_state = "clear"
                    local_category = 13

        if local_state == self.prev_local_state:
            return

        # Area dropped from alerts entirely
        if local_state == "" and self.prev_local_state in ("active", "warning"):
            local_state = "clear"
            local_category = 13

        if local_state in ("active", "warning", "clear"):
            payload = {
                "event": "localized_alert",
                "state": local_state,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "area": LOCAL_AREA,
                "category": local_category,
                "category_name": CATEGORY_NAMES.get(local_category, "Unknown"),
                "source": "red-alert-stack",
            }
            task = asyncio.create_task(self._fire(payload))
            task.add_done_callback(_log_task_exception)

        self.prev_local_state = local_state

    async def _process_general_alerts(self, active_count: int):
        """Handle nationwide threshold crossings."""
        current_threshold = 0
        for t in THRESHOLD_LEVELS:
            if active_count >= t:
                current_threshold = t
                break

        if current_threshold > self.prev_threshold:
            payload = {
                "event": "threshold_crossed",
                "state": f"threshold_{current_threshold}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "threshold": current_threshold,
                "active_areas": active_count,
                "source": "red-alert-stack",
            }
            task = asyncio.create_task(self._fire(payload))
            task.add_done_callback(_log_task_exception)

        self.prev_threshold = current_threshold

    async def _fire(self, payload: dict):
        """Deliver webhook payload to all configured URLs."""
        successes, failures = await _deliver_webhook(self.http_client, payload)
        _delivery_stats["total"] += successes + failures
        _delivery_stats["failed"] += failures
        if successes > 0:
            _delivery_stats["last_delivery"] = datetime.now(timezone.utc).isoformat()


# ── Shared state ─────────────────────────────────────────────────────────────

_monitor: AlertMonitor | None = None
_http_client: httpx.AsyncClient | None = None


# ── FastAPI app ──────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _monitor, _http_client

    _http_client = httpx.AsyncClient()
    _monitor = AlertMonitor(_http_client)

    log.info("Red Alert Webhook starting...")
    log.info("Proxy: %s", OREF_PROXY_URL)
    log.info("Local area: %s", LOCAL_AREA or "(not configured)")
    log.info("Webhook URLs: %d configured", len(WEBHOOK_URLS))
    if WEBHOOK_SECRET:
        log.info("HMAC-SHA256 signing: enabled")

    poll_task = asyncio.create_task(_poll_loop())

    yield

    poll_task.cancel()
    try:
        await poll_task
    except asyncio.CancelledError:
        pass
    await _http_client.aclose()
    log.info("Webhook service stopped")


async def _poll_loop():
    while True:
        await _monitor.poll()
        await asyncio.sleep(POLL_INTERVAL)


app = FastAPI(title="Red Alert Webhook", lifespan=lifespan)

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
        "service": "webhook",
        "local_area": LOCAL_AREA or None,
        "webhook_urls": len(WEBHOOK_URLS),
        "signing": bool(WEBHOOK_SECRET),
        "current_state": _monitor.prev_local_state if _monitor else "unknown",
        "deliveries_total": _delivery_stats["total"],
        "deliveries_failed": _delivery_stats["failed"],
        "last_delivery": _delivery_stats["last_delivery"],
    }


@app.post("/api/test-webhook")
async def test_webhook():
    """Send a test payload to all configured webhook URLs."""
    if not WEBHOOK_URLS:
        return {"error": "No WEBHOOK_URLS configured"}

    payload = {
        "event": "test",
        "state": "test",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "area": LOCAL_AREA or "test-area",
        "category": 0,
        "category_name": "Test",
        "source": "red-alert-stack",
    }
    successes, failures = await _deliver_webhook(_http_client, payload)
    return {
        "status": "ok",
        "urls": len(WEBHOOK_URLS),
        "successes": successes,
        "failures": failures,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=HTTP_PORT)
