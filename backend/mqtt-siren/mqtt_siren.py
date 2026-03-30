"""Red Alert MQTT Siren — Direct Zigbee siren control via MQTT.

Polls the Oref Alert Proxy for alert data and publishes MQTT payloads
to Zigbee2MQTT siren topics on alert state changes:
  - Localized: active (categories 1-12), warning (14), clear (13)
  - Nationwide: threshold crossings at 50, 100, 200 ... 1000 areas

Supports the Tuya TS0601 (NEO NAS-AB02B2) and compatible Zigbee sirens.
User configures separate topics per alert state (warning, active, all-clear)
so different sirens or different alarm modes can be used per state.

Environment variables: see .env.example
"""

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
import paho.mqtt.client as mqtt
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
log = logging.getLogger("redalert.mqtt-siren")


def _log_task_exception(task: asyncio.Task):
    if not task.cancelled() and task.exception():
        log.error("Background task failed: %s", task.exception())


# ── Configuration ────────────────────────────────────────────────────────────

OREF_PROXY_URL = os.environ.get("OREF_PROXY_URL", "http://localhost:8764")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "3"))
LOCAL_AREA = os.environ.get("ALERT_AREA", "")
HTTP_PORT = int(os.environ.get("PORT", "8789"))
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

# MQTT broker connection
MQTT_BROKER = os.environ.get("MQTT_BROKER", "")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USERNAME = os.environ.get("MQTT_USERNAME", "")
MQTT_PASSWORD = os.environ.get("MQTT_PASSWORD", "")

# Per-state siren topic lists (comma-separated Zigbee2MQTT set topics).
# Each state can target different sirens or the same ones.
# Example: zigbee2mqtt/office_siren/set,zigbee2mqtt/bedroom_siren/set
SIREN_TOPICS_WARNING = [
    t.strip()
    for t in os.environ.get("MQTT_SIREN_TOPICS_WARNING", "").split(",")
    if t.strip()
]
SIREN_TOPICS_ACTIVE = [
    t.strip()
    for t in os.environ.get("MQTT_SIREN_TOPICS_ACTIVE", "").split(",")
    if t.strip()
]
SIREN_TOPICS_CLEAR = [
    t.strip()
    for t in os.environ.get("MQTT_SIREN_TOPICS_CLEAR", "").split(",")
    if t.strip()
]

# Payloads — JSON strings the user can override entirely, or use defaults.
# These are published as-is to the corresponding topics.
# Default payloads are designed for TS0601 / NEO NAS-AB02B2 sirens.
DEFAULT_WARNING_PAYLOAD = json.dumps(
    {"warning": {"mode": "emergency", "level": "medium", "strobe": True, "duration": 60}}
)
DEFAULT_ACTIVE_PAYLOAD = json.dumps(
    {"warning": {"mode": "emergency", "level": "high", "strobe": True, "duration": 120}}
)
DEFAULT_CLEAR_PAYLOAD = json.dumps(
    {"warning": {"mode": "stop"}}
)

SIREN_PAYLOAD_WARNING = os.environ.get("MQTT_SIREN_PAYLOAD_WARNING", DEFAULT_WARNING_PAYLOAD)
SIREN_PAYLOAD_ACTIVE = os.environ.get("MQTT_SIREN_PAYLOAD_ACTIVE", DEFAULT_ACTIVE_PAYLOAD)
SIREN_PAYLOAD_CLEAR = os.environ.get("MQTT_SIREN_PAYLOAD_CLEAR", DEFAULT_CLEAR_PAYLOAD)

# Whether to activate sirens on nationwide threshold crossings
SIREN_ON_THRESHOLD = os.environ.get("MQTT_SIREN_ON_THRESHOLD", "false").lower() in ("true", "1", "yes")

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
            f"{API_URL}/api/modules/mqtt-siren", timeout=3
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


# ── MQTT Client ──────────────────────────────────────────────────────────────

_mqtt_client: mqtt.Client | None = None
_mqtt_connected: bool = False


def _connect_mqtt() -> mqtt.Client | None:
    """Connect to the MQTT broker with retry. Returns client or None."""
    if not MQTT_BROKER:
        log.warning("MQTT_BROKER not configured — siren control disabled")
        return None

    all_topics = SIREN_TOPICS_WARNING + SIREN_TOPICS_ACTIVE + SIREN_TOPICS_CLEAR
    if not all_topics:
        log.warning("No siren topics configured — siren control disabled")
        return None

    for attempt in range(1, 4):
        try:
            client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
            if MQTT_USERNAME:
                client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
            client.connect(MQTT_BROKER, MQTT_PORT, 60)
            client.loop_start()
            log.info(
                "MQTT connected to %s:%d (warning: %d, active: %d, clear: %d topics)",
                MQTT_BROKER,
                MQTT_PORT,
                len(SIREN_TOPICS_WARNING),
                len(SIREN_TOPICS_ACTIVE),
                len(SIREN_TOPICS_CLEAR),
            )
            return client
        except Exception as e:
            log.warning("MQTT connection attempt %d/3 failed: %s", attempt, e)
            if attempt < 3:
                time.sleep(2 * attempt)

    log.error("MQTT connection failed after 3 attempts — siren control disabled")
    return None


def _publish(topics: list[str], payload: str):
    """Publish a payload to a list of MQTT topics."""
    if not _mqtt_client or not topics:
        return
    for topic in topics:
        try:
            _mqtt_client.publish(topic, payload)
            log.debug("Published to %s: %s", topic, payload)
        except Exception as e:
            log.error("MQTT publish error for %s: %s", topic, e)


# ── Alert Monitor ────────────────────────────────────────────────────────────

_delivery_stats = {"activations": 0, "deactivations": 0, "last_action": None}


class AlertMonitor:
    def __init__(self, http_client: httpx.AsyncClient):
        self.http_client = http_client
        self.prev_local_state: str = ""
        self.prev_threshold: int = 0
        self.prev_alert_ids: set[str] = set()
        self.siren_active: bool = False

    async def poll(self):
        """Fetch alerts from proxy and control sirens on state changes."""
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

        # Classify for threshold checks
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
        """Handle alerts for the user's ALERT_AREA — activate/deactivate sirens."""
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

        # Area dropped from alerts entirely — treat as clear
        if local_state == "" and self.prev_local_state in ("active", "warning"):
            local_state = "clear"
            local_category = 13

        now_iso = datetime.now(timezone.utc).isoformat()

        if local_state == "active":
            _publish(SIREN_TOPICS_ACTIVE, SIREN_PAYLOAD_ACTIVE)
            self.siren_active = True
            _delivery_stats["activations"] += 1
            _delivery_stats["last_action"] = now_iso
            log.info("SIREN ACTIVE — %s (cat %d: %s)",
                     LOCAL_AREA, local_category, CATEGORY_NAMES.get(local_category, "Unknown"))

        elif local_state == "warning":
            _publish(SIREN_TOPICS_WARNING, SIREN_PAYLOAD_WARNING)
            self.siren_active = True
            _delivery_stats["activations"] += 1
            _delivery_stats["last_action"] = now_iso
            log.info("SIREN WARNING — %s", LOCAL_AREA)

        elif local_state == "clear":
            _publish(SIREN_TOPICS_CLEAR, SIREN_PAYLOAD_CLEAR)
            self.siren_active = False
            _delivery_stats["deactivations"] += 1
            _delivery_stats["last_action"] = now_iso
            log.info("SIREN CLEAR — %s", LOCAL_AREA)

        self.prev_local_state = local_state

    async def _process_general_alerts(self, active_count: int):
        """Handle nationwide threshold crossings — optionally sound sirens."""
        current_threshold = 0
        for t in THRESHOLD_LEVELS:
            if active_count >= t:
                current_threshold = t
                break

        if current_threshold > self.prev_threshold and SIREN_ON_THRESHOLD:
            _publish(SIREN_TOPICS_ACTIVE, SIREN_PAYLOAD_ACTIVE)
            self.siren_active = True
            _delivery_stats["activations"] += 1
            _delivery_stats["last_action"] = datetime.now(timezone.utc).isoformat()
            log.info("SIREN THRESHOLD %d — %d active areas", current_threshold, active_count)

        self.prev_threshold = current_threshold


# ── Shared state ─────────────────────────────────────────────────────────────

_monitor: AlertMonitor | None = None
_http_client: httpx.AsyncClient | None = None


# ── FastAPI app ──────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _monitor, _http_client, _mqtt_client, _mqtt_connected

    _mqtt_client = _connect_mqtt()
    _mqtt_connected = _mqtt_client is not None

    _http_client = httpx.AsyncClient()
    _monitor = AlertMonitor(_http_client)

    log.info("Red Alert MQTT Siren starting...")
    log.info("Proxy: %s", OREF_PROXY_URL)
    log.info("Local area: %s", LOCAL_AREA or "(not configured)")
    log.info("MQTT broker: %s:%d", MQTT_BROKER or "(not configured)", MQTT_PORT)
    log.info("Warning topics: %d, Active topics: %d, Clear topics: %d",
             len(SIREN_TOPICS_WARNING), len(SIREN_TOPICS_ACTIVE), len(SIREN_TOPICS_CLEAR))
    log.info("Threshold sirens: %s", "enabled" if SIREN_ON_THRESHOLD else "disabled")

    poll_task = asyncio.create_task(_poll_loop())

    yield

    poll_task.cancel()
    try:
        await poll_task
    except asyncio.CancelledError:
        pass
    if _mqtt_client:
        _mqtt_client.loop_stop()
        _mqtt_client.disconnect()
    await _http_client.aclose()
    log.info("MQTT Siren service stopped")


async def _poll_loop():
    while True:
        await _monitor.poll()
        await asyncio.sleep(POLL_INTERVAL)


app = FastAPI(title="Red Alert MQTT Siren", lifespan=lifespan)

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
        "service": "mqtt-siren",
        "local_area": LOCAL_AREA or None,
        "mqtt_connected": _mqtt_connected,
        "mqtt_broker": f"{MQTT_BROKER}:{MQTT_PORT}" if MQTT_BROKER else None,
        "topics": {
            "warning": len(SIREN_TOPICS_WARNING),
            "active": len(SIREN_TOPICS_ACTIVE),
            "clear": len(SIREN_TOPICS_CLEAR),
        },
        "current_state": _monitor.prev_local_state if _monitor else "unknown",
        "siren_active": _monitor.siren_active if _monitor else False,
        "activations": _delivery_stats["activations"],
        "deactivations": _delivery_stats["deactivations"],
        "last_action": _delivery_stats["last_action"],
    }


@app.post("/api/test-siren")
async def test_siren(state: str = "active"):
    """Send a test siren payload. State: active, warning, clear."""
    if not _mqtt_client:
        return {"error": "MQTT not connected"}

    if state == "active":
        _publish(SIREN_TOPICS_ACTIVE, SIREN_PAYLOAD_ACTIVE)
    elif state == "warning":
        _publish(SIREN_TOPICS_WARNING, SIREN_PAYLOAD_WARNING)
    elif state == "clear":
        _publish(SIREN_TOPICS_CLEAR, SIREN_PAYLOAD_CLEAR)
    else:
        return {"error": f"Unknown state: {state}", "valid_states": ["active", "warning", "clear"]}

    return {
        "status": "ok",
        "state": state,
        "topics": (
            SIREN_TOPICS_ACTIVE if state == "active"
            else SIREN_TOPICS_WARNING if state == "warning"
            else SIREN_TOPICS_CLEAR
        ),
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=HTTP_PORT)
