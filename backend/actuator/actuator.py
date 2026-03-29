"""Red Alert Actuator — Home Assistant Bridge for Pikud HaOref alerts.

Consumes alert data from the Oref Alert Proxy and sets alert state in
Home Assistant via its REST API. HA handles all physical actuation
(lights, sirens, TTS) through automations triggered by the state changes.

The actuator sets an input_select entity (configurable via HASS_ENTITY)
to one of these states:
  - idle         — no alerts
  - warning      — early warning for local area (category 14)
  - active       — active alert for local area (categories 1-12)
  - clear        — all-clear for local area (category 13)
  - threshold_50 ... threshold_1000 — nationwide volume thresholds

Environment variables: see .env.example
"""

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager

import httpx
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("redalert.actuator")


def _log_task_exception(task: asyncio.Task):
    """Log exceptions from fire-and-forget tasks."""
    if not task.cancelled() and task.exception():
        log.error("Background task failed: %s", task.exception())

# ── Configuration ────────────────────────────────────────────────────────────

OREF_PROXY_URL = os.environ.get("OREF_PROXY_URL", "http://localhost:8764")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "3"))

# Home Assistant connection
HASS_HOST = os.environ.get("HASS_HOST", "")  # e.g. http://10.0.0.3:8123
HASS_TOKEN = os.environ.get("HASS_TOKEN", "")  # Long-lived access token
HASS_ENTITY = os.environ.get("HASS_ENTITY", "input_select.red_alert_state")

LOCAL_AREA = os.environ.get("ALERT_AREA", "") or os.environ.get("LOCAL_AREA", "")

HTTP_PORT = int(os.environ.get("PORT", "8782"))
PROMPT_RUNNER_URL = os.environ.get("PROMPT_RUNNER_URL", "http://prompt-runner:8787")

# When to trigger the prompt runner for immediate intel.
# Values: "active" (default), "warning", "both"
PROMPT_RUNNER_TRIGGER = os.environ.get("PROMPT_RUNNER_TRIGGER", "active").lower()
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

# Alert categories (from shared module)
from alert_constants import ACTIVE_CATEGORIES, RED_CATEGORIES, THRESHOLD_LEVELS

# Valid states for the input_select entity
VALID_STATES = (
    ["idle", "warning", "active", "clear", "test_active", "test_warning", "test_clear"]
    + [f"threshold_{t}" for t in THRESHOLD_LEVELS]
)


# ── Test Alert Model ────────────────────────────────────────────────────────


class TestAlertRequest(BaseModel):
    """Request body for triggering a test alert."""
    alert_type: str = "red_alert"  # red_alert, early_warning, all_clear, threshold_100
    area: str = ""  # optional area name override


# ── Home Assistant Client ───────────────────────────────────────────────────


class HAClient:
    """Sets state on a Home Assistant input_select entity via REST API."""

    def __init__(self, host: str, token: str, entity: str):
        self.host = host.rstrip("/")
        self.token = token
        self.entity = entity
        self.current_state: str = ""

        if not host or not token:
            log.warning("HASS_HOST or HASS_TOKEN not set — HA bridge disabled")
            self.enabled = False
            return

        self.enabled = True
        log.info("HA bridge enabled: %s → %s", self.host, self.entity)

    async def set_state(self, state: str, http_client: httpx.AsyncClient):
        """Set the input_select to the given state."""
        if not self.enabled:
            log.warning("HA bridge not enabled — cannot set state to %s", state)
            return False

        if state == self.current_state:
            return True

        url = f"{self.host}/api/services/input_select/select_option"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        payload = {
            "entity_id": self.entity,
            "option": state,
        }

        try:
            resp = await http_client.post(url, json=payload, headers=headers, timeout=10)
            if resp.status_code == 200:
                log.info("HA state → %s", state)
                self.current_state = state
                return True
            else:
                log.error("HA API error (%d): %s", resp.status_code, resp.text)
                return False
        except Exception as e:
            log.error("HA API request failed: %s", e)
            return False

    async def check_connection(self, http_client: httpx.AsyncClient) -> bool:
        """Verify HA is reachable and the entity exists."""
        if not self.enabled:
            return False
        try:
            url = f"{self.host}/api/states/{self.entity}"
            headers = {"Authorization": f"Bearer {self.token}"}
            resp = await http_client.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                self.current_state = data.get("state", "")
                log.info("HA connected — %s is '%s'", self.entity, self.current_state)
                return True
            elif resp.status_code == 404:
                log.error("HA entity %s not found — create it in HA first", self.entity)
                return False
            else:
                log.error("HA connection check failed (%d): %s", resp.status_code, resp.text)
                return False
        except Exception as e:
            log.error("HA connection check failed: %s", e)
            return False


# ── Alert Monitor ────────────────────────────────────────────────────────────


class AlertMonitor:
    def __init__(self, http_client: httpx.AsyncClient, ha: HAClient):
        self.http_client = http_client
        self.ha = ha

        # State tracking
        self.prev_local_state: str = ""  # "", "warning", "active", "clear"
        self.prev_threshold: int = 0
        self.prev_alert_ids: set[str] = set()
        self.last_active_time: float = 0
        self.all_clear_sent: bool = False

    async def poll(self):
        """Fetch alerts from proxy and trigger state changes."""
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

        # Check idle restore
        await self._check_idle_restore()

        # Classify all alerts (always, for threshold checks)
        active = [a for a in alerts if a.get("category", 0) in ACTIVE_CATEGORIES]
        active_areas = {a.get("data", "") for a in active}
        active_count = len(active_areas)

        # Thresholds are checked every poll — don't gate on ID changes
        await self._process_general_alerts(active_count)

        # Localized alerts only fire on actual changes
        current_ids = {f"{a.get('data', '')}:{a.get('category', 0)}" for a in alerts}
        if current_ids == self.prev_alert_ids:
            return
        self.prev_alert_ids = current_ids

        await self._process_localized_alerts(alerts)

    async def _process_localized_alerts(self, alerts: list[dict]):
        """Handle alerts specific to the user's configured ALERT_AREA."""
        local_state = ""
        for a in alerts:
            if a.get("data", "") == LOCAL_AREA:
                cat = a.get("category", 0)
                if cat in RED_CATEGORIES:
                    local_state = "active"
                    break
                elif cat == 14:
                    local_state = "warning"
                elif cat == 13:
                    local_state = "clear"

        if local_state == self.prev_local_state:
            return

        if local_state == "active":
            await self.ha.set_state("active", self.http_client)
            self.last_active_time = time.time()
            self.all_clear_sent = False
            if PROMPT_RUNNER_TRIGGER in ("active", "both"):
                task = asyncio.create_task(_trigger_prompt_runner(LOCAL_AREA))
                task.add_done_callback(_log_task_exception)

        elif local_state == "warning":
            await self.ha.set_state("warning", self.http_client)
            self.last_active_time = time.time()
            self.all_clear_sent = False
            if PROMPT_RUNNER_TRIGGER in ("warning", "both"):
                task = asyncio.create_task(_trigger_prompt_runner(LOCAL_AREA))
                task.add_done_callback(_log_task_exception)

        elif local_state == "clear" and self.prev_local_state in ("active", "warning"):
            await self.ha.set_state("clear", self.http_client)
            self.all_clear_sent = True

        elif local_state == "" and self.prev_local_state:
            # Area dropped from alerts entirely
            if not self.all_clear_sent and self.prev_local_state in ("active", "warning"):
                await self.ha.set_state("clear", self.http_client)
                self.all_clear_sent = True

        self.prev_local_state = local_state

    async def _process_general_alerts(self, active_count: int):
        """Handle nationwide volume-based threshold alerts."""
        current_threshold = 0
        for t in THRESHOLD_LEVELS:
            if active_count >= t:
                current_threshold = t
                break

        if current_threshold > self.prev_threshold:
            # Only set threshold state if no localized alert is active
            if not self.prev_local_state or self.prev_local_state == "clear":
                await self.ha.set_state(f"threshold_{current_threshold}", self.http_client)
                self.last_active_time = time.time()
                self.all_clear_sent = False

        self.prev_threshold = current_threshold

    async def _check_idle_restore(self):
        """Set state to idle after 2 minutes of no activity."""
        if not self.last_active_time:
            return
        if self.ha.current_state == "idle":
            return

        elapsed = time.time() - self.last_active_time
        if elapsed > 120:
            await self.ha.set_state("idle", self.http_client)
            self.last_active_time = 0
            self.prev_threshold = 0  # reset so thresholds re-fire on next ramp


# ── Shared state (set during lifespan) ───────────────────────────────────

_ha: HAClient | None = None
_monitor: AlertMonitor | None = None
_http_client: httpx.AsyncClient | None = None


# ── FastAPI app ─────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _ha, _monitor, _http_client

    _http_client = httpx.AsyncClient()
    _ha = HAClient(HASS_HOST, HASS_TOKEN, HASS_ENTITY)

    if _ha.enabled:
        await _ha.check_connection(_http_client)

    _monitor = AlertMonitor(_http_client, _ha)

    log.info("Red Alert Actuator (HA Bridge) starting...")
    log.info("Proxy: %s", OREF_PROXY_URL)
    log.info("Local area: %s", LOCAL_AREA)
    log.info("HA host: %s", HASS_HOST or "(not configured)")
    log.info("HA entity: %s", HASS_ENTITY)

    # Start polling loop as background task
    poll_task = asyncio.create_task(_poll_loop())

    yield

    poll_task.cancel()
    try:
        await poll_task
    except asyncio.CancelledError:
        pass
    await _http_client.aclose()
    log.info("Actuator stopped")


async def _poll_loop():
    """Background polling loop for alert data."""
    while True:
        await _monitor.poll()
        await asyncio.sleep(POLL_INTERVAL)


app = FastAPI(title="Red Alert Actuator", lifespan=lifespan)

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
        "service": "actuator",
        "mode": "ha_bridge",
        "local_area": LOCAL_AREA,
        "ha_host": HASS_HOST or None,
        "ha_entity": HASS_ENTITY,
        "ha_enabled": _ha.enabled if _ha else False,
        "ha_current_state": _ha.current_state if _ha else "unknown",
        "current_local_state": _monitor.prev_local_state if _monitor else "unknown",
        "valid_states": VALID_STATES,
    }


@app.post("/api/test-alert")
async def test_alert(req: TestAlertRequest):
    """Trigger a test alert — sets HA state without affecting state tracking."""
    if not _ha or not _ha.enabled:
        return {"error": "HA bridge not configured (set HASS_HOST and HASS_TOKEN)"}

    alert_type = req.alert_type.lower()

    # Test alerts use test_* states so HA automations can handle them
    # differently (countdown, shorter duration, auto-restore).
    state_map = {
        "red_alert": "test_active",
        "red": "test_active",
        "early_warning": "test_warning",
        "warning": "test_warning",
        "all_clear": "test_clear",
        "clear": "test_clear",
    }

    if alert_type in state_map:
        state = state_map[alert_type]
        _ha.current_state = ""  # force change
        await _ha.set_state(state, _http_client)
        return {"status": "ok", "triggered": alert_type, "ha_state": state}

    elif alert_type.startswith("threshold_"):
        _ha.current_state = ""
        await _ha.set_state(alert_type, _http_client)
        return {"status": "ok", "triggered": alert_type, "ha_state": alert_type}

    elif alert_type == "idle":
        _ha.current_state = ""
        await _ha.set_state("idle", _http_client)
        return {"status": "ok", "triggered": "idle", "ha_state": "idle"}

    return {
        "error": f"Unknown alert type: {alert_type}",
        "valid_types": ["red_alert", "early_warning", "all_clear", "idle"]
        + [f"threshold_{t}" for t in THRESHOLD_LEVELS],
    }


@app.post("/api/test-alert/end")
async def test_alert_end():
    """Reset HA state to idle after a test."""
    if not _ha or not _ha.enabled:
        return {"error": "HA bridge not configured"}
    _ha.current_state = ""
    await _ha.set_state("idle", _http_client)
    return {"status": "ok", "ha_state": "idle"}


async def _trigger_prompt_runner(area: str):
    """Fire-and-forget: ask prompt runner for immediate intel on the alerted area."""
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{PROMPT_RUNNER_URL}/api/run",
                json={"template": "immediate_intel", "variables": {"alert_area": area}},
                timeout=5,
            )
            log.info("Prompt runner triggered for area: %s", area)
    except Exception as e:
        log.debug("Prompt runner not available: %s", e)


# ── Main ─────────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=HTTP_PORT)
