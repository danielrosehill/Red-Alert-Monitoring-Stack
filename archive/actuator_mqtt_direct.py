"""Red Alert Actuator — Physical alert outputs for Pikud HaOref alerts.

Consumes alert data from the Oref Alert Proxy and triggers physical actions:
  - Snapcast TTS announcements via pipe (pre-recorded audio files)
  - MQTT smart light color changes (red/orange/green/off)
  - User-configurable scripts per alert level (subprocess)

Sits downstream of the Oref Alert Proxy as part of the Red Alert Stack.

Environment variables: see .env.example
"""

import asyncio
import json
import logging
import os
import subprocess
import time
import wave
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    import paho.mqtt.client as mqtt

    HAS_MQTT = True
except ImportError:
    HAS_MQTT = False

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("redalert.actuator")

# ── Configuration ────────────────────────────────────────────────────────────

OREF_PROXY_URL = os.environ.get("OREF_PROXY_URL", "http://localhost:8764")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "3"))

MQTT_BROKER = os.environ.get("MQTT_BROKER", "10.0.0.4")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USERNAME = os.environ.get("MQTT_USERNAME", "")
MQTT_PASSWORD = os.environ.get("MQTT_PASSWORD", "")
MQTT_LIGHT_TOPICS = [
    t.strip()
    for t in os.environ.get("MQTT_LIGHT_TOPICS", "").split(",")
    if t.strip()
]
MQTT_ALARM_TOPICS = [
    t.strip()
    for t in os.environ.get("MQTT_ALARM_TOPICS", "").split(",")
    if t.strip()
]
LIGHT_RESTORE_AFTER = int(os.environ.get("LIGHT_RESTORE_AFTER", "120"))

SNAPCAST_FIFO = os.environ.get("SNAPCAST_FIFO", "/tmp/snapfifo")
TTS_ENABLED = os.environ.get("TTS_ENABLED", "true").lower() in ("true", "1", "yes")
TTS_COOLDOWN = int(os.environ.get("TTS_COOLDOWN", "60"))

LOCAL_AREA = os.environ.get("ALERT_AREA", "") or os.environ.get("LOCAL_AREA", "")

HTTP_PORT = int(os.environ.get("PORT", "8782"))
PROMPT_RUNNER_URL = os.environ.get("PROMPT_RUNNER_URL", "http://prompt-runner:8787")

AUDIO_DIR = Path(__file__).parent / "audio"


# ── Test Alert Model ────────────────────────────────────────────────────────


class TestAlertRequest(BaseModel):
    """Request body for triggering a test alert."""
    alert_type: str = "red_alert"  # red_alert, early_warning, all_clear, threshold_100
    area: str = ""  # optional area name override


# Alert categories
ACTIVE_CATEGORIES = {1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14}
RED_CATEGORIES = {1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12}
THRESHOLD_LEVELS = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100, 50]  # checked high to low

# ── User Scripts (optional shell commands per alert level) ────────────────────
# Each SCRIPT_* env var holds a shell command to run when that alert fires.
# Scripts run async (fire-and-forget) and won't block alert processing.

ALERT_SCRIPTS = {
    "early_warning": os.environ.get("SCRIPT_EARLY_WARNING", ""),
    "red_alert": os.environ.get("SCRIPT_RED_ALERT", ""),
    "all_clear": os.environ.get("SCRIPT_ALL_CLEAR", ""),
    "threshold_50": os.environ.get("SCRIPT_THRESHOLD_50", ""),
    "threshold_100": os.environ.get("SCRIPT_THRESHOLD_100", ""),
    "threshold_200": os.environ.get("SCRIPT_THRESHOLD_200", ""),
    "threshold_300": os.environ.get("SCRIPT_THRESHOLD_300", ""),
    "threshold_400": os.environ.get("SCRIPT_THRESHOLD_400", ""),
    "threshold_500": os.environ.get("SCRIPT_THRESHOLD_500", ""),
    "threshold_600": os.environ.get("SCRIPT_THRESHOLD_600", ""),
    "threshold_700": os.environ.get("SCRIPT_THRESHOLD_700", ""),
    "threshold_800": os.environ.get("SCRIPT_THRESHOLD_800", ""),
    "threshold_900": os.environ.get("SCRIPT_THRESHOLD_900", ""),
    "threshold_1000": os.environ.get("SCRIPT_THRESHOLD_1000", ""),
}

# Light colors
COLORS = {
    "red": {"color": {"r": 255, "g": 0, "b": 0}},
    "orange": {"color": {"r": 255, "g": 140, "b": 0}},
    "green": {"color": {"r": 0, "g": 255, "b": 0}},
    "off": {"state": "OFF"},
}

# ── MQTT Client ──────────────────────────────────────────────────────────────


class LightController:
    def __init__(self):
        self.client: mqtt.Client | None = None
        self.current_color: str = ""

        if not HAS_MQTT:
            log.warning("paho-mqtt not installed — light control disabled")
            return
        if not MQTT_LIGHT_TOPICS:
            log.info("No MQTT_LIGHT_TOPICS configured — light control disabled")
            return

        self._connect_mqtt()

    def _connect_mqtt(self, retries: int = 3, delay: float = 2.0):
        """Connect to MQTT broker with retry."""
        if not HAS_MQTT or not MQTT_LIGHT_TOPICS:
            return
        for attempt in range(1, retries + 1):
            try:
                client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
                if MQTT_USERNAME:
                    client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
                client.connect(MQTT_BROKER, MQTT_PORT, 60)
                client.loop_start()
                self.client = client
                log.info(
                    "MQTT connected to %s:%d (%d lights)",
                    MQTT_BROKER,
                    MQTT_PORT,
                    len(MQTT_LIGHT_TOPICS),
                )
                return
            except Exception as e:
                log.warning(
                    "MQTT connection attempt %d/%d failed: %s", attempt, retries, e
                )
                if attempt < retries:
                    time.sleep(delay * attempt)
        log.error("MQTT connection failed after %d attempts — light control disabled", retries)
        self.client = None

    def set_color(self, color: str):
        """Set all lights to a color. color is one of: red, orange, green, off."""
        if not self.client or color == self.current_color:
            return

        payload = json.dumps(COLORS.get(color, COLORS["off"]))
        for topic in MQTT_LIGHT_TOPICS:
            self.client.publish(topic, payload)

        log.info("Lights → %s (%d lights)", color, len(MQTT_LIGHT_TOPICS))
        self.current_color = color

    def close(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()


# ── Alarm/Siren Controller ───────────────────────────────────────────────────


ALARM_PAYLOADS = {
    "on": {"warning": {"mode": "emergency", "level": "high", "strobe": True, "duration": 120}},
    "off": {"warning": {"mode": "stop"}},
}


class AlarmController:
    """Controls MQTT-based alarm/siren devices (e.g. Zigbee sirens)."""

    def __init__(self, mqtt_client: "mqtt.Client | None"):
        self.client = mqtt_client
        self.active = False

        if not MQTT_ALARM_TOPICS:
            log.info("No MQTT_ALARM_TOPICS configured — alarm control disabled")
            return
        log.info("Alarm topics configured: %d sirens", len(MQTT_ALARM_TOPICS))

    def activate(self):
        """Sound the alarm on all configured sirens."""
        if not self.client or not MQTT_ALARM_TOPICS or self.active:
            return
        payload = json.dumps(ALARM_PAYLOADS["on"])
        for topic in MQTT_ALARM_TOPICS:
            self.client.publish(topic, payload)
        self.active = True
        log.info("Alarms → ON (%d sirens)", len(MQTT_ALARM_TOPICS))

    def deactivate(self):
        """Silence all alarms."""
        if not self.client or not MQTT_ALARM_TOPICS or not self.active:
            return
        payload = json.dumps(ALARM_PAYLOADS["off"])
        for topic in MQTT_ALARM_TOPICS:
            self.client.publish(topic, payload)
        self.active = False
        log.info("Alarms → OFF (%d sirens)", len(MQTT_ALARM_TOPICS))


# ── Snapcast TTS ─────────────────────────────────────────────────────────────


class TTSPlayer:
    def __init__(self):
        self.last_played: dict[str, float] = {}
        self.fifo_path = SNAPCAST_FIFO

        if not TTS_ENABLED:
            log.info("TTS disabled")
            return

        if not Path(self.fifo_path).exists():
            log.warning("Snapcast FIFO not found at %s — TTS will fail", self.fifo_path)

        available = [f.stem for f in AUDIO_DIR.glob("*.wav")]
        log.info("TTS audio files available: %s", ", ".join(available) or "none")

    def play(self, name: str):
        """Play a pre-recorded TTS message by name (e.g., 'red_alert')."""
        if not TTS_ENABLED:
            return

        # Cooldown check
        now = time.time()
        last = self.last_played.get(name, 0)
        if now - last < TTS_COOLDOWN:
            return

        audio_file = AUDIO_DIR / f"{name}.wav"
        if not audio_file.exists():
            log.warning("Audio file not found: %s", audio_file)
            return

        try:
            # Parse WAV properly — Snapcast expects raw PCM
            with wave.open(str(audio_file), "rb") as wav:
                pcm_data = wav.readframes(wav.getnframes())

            with open(self.fifo_path, "wb") as fifo:
                fifo.write(pcm_data)

            self.last_played[name] = now
            log.info("TTS played: %s", name)
        except Exception as e:
            log.error("TTS play error (%s): %s", name, e)


# ── Alert Monitor ────────────────────────────────────────────────────────────


class AlertMonitor:
    def __init__(
        self, http_client: httpx.AsyncClient, lights: LightController, tts: TTSPlayer,
        alarms: AlarmController | None = None,
    ):
        self.http_client = http_client
        self.lights = lights
        self.tts = tts
        self.alarms = alarms

        # State tracking
        self.prev_local_state: str = ""  # "", "warning", "active", "clear"
        self.prev_threshold: int = 0
        self.prev_alert_ids: set[str] = set()
        self.last_active_time: float = 0
        self.all_clear_sent: bool = False

    async def poll(self):
        """Fetch alerts from proxy and trigger actions on state changes."""
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

        # Always check light restore timer regardless of alert changes
        self._check_light_restore()

        # Detect changes
        current_ids = {f"{a.get('data', '')}:{a.get('category', 0)}" for a in alerts}
        if current_ids == self.prev_alert_ids:
            return
        self.prev_alert_ids = current_ids

        # Classify all alerts
        active = [a for a in alerts if a.get("category", 0) in ACTIVE_CATEGORIES]
        active_areas = {a.get("data", "") for a in active}
        active_count = len(active_areas)

        # Process the two alert types independently
        self._process_localized_alerts(alerts)
        self._process_general_alerts(active_count)

    def _process_localized_alerts(self, alerts: list[dict]):
        """Handle alerts specific to the user's configured ALERT_AREA.

        Localized alerts are direct threats to the user's location:
          - warning (category 14): early warning, seek shelter soon
          - active (categories 1-12): immediate threat, take cover now
          - clear (category 13): threat has passed

        These trigger the full response: lights, sirens, TTS, scripts,
        and prompt runner for immediate intelligence.
        """
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
            self.lights.set_color("red")
            self.tts.play("red_alert")
            if self.alarms:
                self.alarms.activate()
            self.last_active_time = time.time()
            self.all_clear_sent = False
            _run_alert_script("red_alert")
            asyncio.create_task(_trigger_prompt_runner(LOCAL_AREA))

        elif local_state == "warning":
            self.lights.set_color("orange")
            self.tts.play("early_warning")
            if self.alarms:
                self.alarms.activate()
            self.last_active_time = time.time()
            self.all_clear_sent = False
            _run_alert_script("early_warning")

        elif local_state == "clear" and self.prev_local_state in ("active", "warning"):
            self.lights.set_color("green")
            self.tts.play("all_clear")
            if self.alarms:
                self.alarms.deactivate()
            self.all_clear_sent = True
            _run_alert_script("all_clear")

        elif local_state == "" and self.prev_local_state:
            # Area dropped from alerts entirely
            if not self.all_clear_sent and self.prev_local_state in ("active", "warning"):
                self.lights.set_color("green")
                self.tts.play("all_clear")
                if self.alarms:
                    self.alarms.deactivate()
                self.all_clear_sent = True
                _run_alert_script("all_clear")

        self.prev_local_state = local_state

    def _process_general_alerts(self, active_count: int):
        """Handle nationwide volume-based threshold alerts.

        General alerts are country-wide situational awareness based on
        the total number of simultaneously active alert areas. They provide
        escalating notifications as the situation intensifies:
          - 50, 100, 200, ... 1000 simultaneous areas

        These trigger TTS announcements and scripts only. Lights are set
        to red as an informational indicator (not a direct threat response)
        only when no localized alert is already active.
        """
        current_threshold = 0
        for t in THRESHOLD_LEVELS:
            if active_count >= t:
                current_threshold = t
                break

        if current_threshold > self.prev_threshold:
            audio_name = f"threshold_{current_threshold}"
            self.tts.play(audio_name)
            _run_alert_script(audio_name)

            # Informational light indicator — only if no localized alert is active
            if not self.prev_local_state or self.prev_local_state == "clear":
                self.lights.set_color("red")
                self.last_active_time = time.time()
                self.all_clear_sent = False

        self.prev_threshold = current_threshold

    def _check_light_restore(self):
        """Turn off lights after LIGHT_RESTORE_AFTER seconds of no activity."""
        if LIGHT_RESTORE_AFTER <= 0:
            return
        if not self.last_active_time:
            return
        if self.lights.current_color == "off" or self.lights.current_color == "":
            return

        elapsed = time.time() - self.last_active_time
        if elapsed > LIGHT_RESTORE_AFTER:
            self.lights.set_color("off")
            self.last_active_time = 0


# ── Shared state (set during lifespan) ───────────────────────────────────────

_lights: LightController | None = None
_alarms: AlarmController | None = None
_tts: TTSPlayer | None = None
_monitor: AlertMonitor | None = None
_http_client: httpx.AsyncClient | None = None


# ── FastAPI app ─────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _lights, _alarms, _tts, _monitor, _http_client

    _lights = LightController()
    _alarms = AlarmController(_lights.client)
    _tts = TTSPlayer()
    _http_client = httpx.AsyncClient()
    _monitor = AlertMonitor(_http_client, _lights, _tts, _alarms)

    log.info("Red Alert Actuator starting...")
    log.info("Proxy: %s", OREF_PROXY_URL)
    log.info("Local area: %s", LOCAL_AREA)
    log.info("MQTT lights: %d topics", len(MQTT_LIGHT_TOPICS))
    log.info("MQTT alarms: %d topics", len(MQTT_ALARM_TOPICS))
    log.info("TTS: %s (cooldown: %ds)", "enabled" if TTS_ENABLED else "disabled", TTS_COOLDOWN)
    configured_scripts = {k: v for k, v in ALERT_SCRIPTS.items() if v}
    if configured_scripts:
        log.info("User scripts configured: %s", ", ".join(configured_scripts.keys()))
    else:
        log.info("No user scripts configured (SCRIPT_* env vars)")

    # Start polling loop as background task
    poll_task = asyncio.create_task(_poll_loop())

    yield

    poll_task.cancel()
    try:
        await poll_task
    except asyncio.CancelledError:
        pass
    _lights.close()
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
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "actuator",
        "local_area": LOCAL_AREA,
        "mqtt_lights": len(MQTT_LIGHT_TOPICS),
        "mqtt_alarms": len(MQTT_ALARM_TOPICS),
        "tts_enabled": TTS_ENABLED,
        "current_state": _monitor.prev_local_state if _monitor else "unknown",
        "scripts_configured": [k for k, v in ALERT_SCRIPTS.items() if v],
        "threshold_levels": THRESHOLD_LEVELS,
    }


@app.post("/api/test-alert")
async def test_alert(req: TestAlertRequest):
    """Trigger a test alert — fires lights and TTS without affecting state tracking."""
    if not _lights or not _tts:
        return {"error": "Actuator not initialized"}

    alert_type = req.alert_type.lower()

    # Play test preamble TTS
    _tts.last_played.pop("test_begin", None)
    _tts.play("test_begin")

    script_key = None

    if alert_type in ("red_alert", "red"):
        script_key = "red_alert"
        _lights.current_color = ""  # force change
        _lights.set_color("red")
        _tts.last_played.pop("red_alert", None)  # bypass cooldown for test
        _tts.play("red_alert")
        if _alarms:
            _alarms.activate()
        _run_alert_script(script_key)
        # Trigger prompt runner for immediate intel if configured
        asyncio.create_task(_trigger_prompt_runner(req.area or LOCAL_AREA))
        return {"status": "ok", "triggered": "red_alert", "lights": "red", "tts": "red_alert", "alarms": "on",
                "script": ALERT_SCRIPTS.get(script_key, "") or None}

    elif alert_type in ("early_warning", "warning"):
        script_key = "early_warning"
        _lights.current_color = ""
        _lights.set_color("orange")
        _tts.last_played.pop("early_warning", None)
        _tts.play("early_warning")
        if _alarms:
            _alarms.activate()
        _run_alert_script(script_key)
        return {"status": "ok", "triggered": "early_warning", "lights": "orange", "tts": "early_warning", "alarms": "on",
                "script": ALERT_SCRIPTS.get(script_key, "") or None}

    elif alert_type in ("all_clear", "clear"):
        script_key = "all_clear"
        _lights.current_color = ""
        _lights.set_color("green")
        _tts.last_played.pop("all_clear", None)
        _tts.play("all_clear")
        if _alarms:
            _alarms.deactivate()
        _run_alert_script(script_key)
        return {"status": "ok", "triggered": "all_clear", "lights": "green", "tts": "all_clear", "alarms": "off",
                "script": ALERT_SCRIPTS.get(script_key, "") or None}

    elif alert_type.startswith("threshold_"):
        script_key = alert_type
        _lights.current_color = ""
        _lights.set_color("red")
        _tts.last_played.pop(alert_type, None)
        _tts.play(alert_type)
        _run_alert_script(script_key)
        return {"status": "ok", "triggered": alert_type, "lights": "red", "tts": alert_type,
                "script": ALERT_SCRIPTS.get(script_key, "") or None}

    elif alert_type == "lights_off":
        _lights.current_color = ""
        _lights.set_color("off")
        return {"status": "ok", "triggered": "lights_off", "lights": "off"}

    return {"error": f"Unknown alert type: {alert_type}",
            "valid_types": ["red_alert", "early_warning", "all_clear", "lights_off"]
            + [f"threshold_{t}" for t in THRESHOLD_LEVELS]}


@app.post("/api/test-alert/end")
async def test_alert_end():
    """Play the 'test ended' TTS and restore lights to off."""
    if not _lights or not _tts:
        return {"error": "Actuator not initialized"}
    _tts.last_played.pop("test_ended", None)
    _tts.play("test_ended")
    _lights.current_color = ""
    _lights.set_color("off")
    if _alarms:
        _alarms.active = False  # reset without sending MQTT if already off
    return {"status": "ok", "triggered": "test_ended", "lights": "off"}


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


def _run_alert_script(alert_key: str):
    """Run user-configured script for an alert level (fire-and-forget subprocess)."""
    cmd = ALERT_SCRIPTS.get(alert_key, "")
    if not cmd:
        return
    try:
        subprocess.Popen(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        log.info("Script fired for %s: %s", alert_key, cmd)
    except Exception as e:
        log.error("Script error for %s: %s", alert_key, e)


# ── Main ─────────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=HTTP_PORT)
