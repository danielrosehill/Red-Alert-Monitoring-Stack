"""Red Alert Snapcast TTS — Audio announcements via Snapcast.

Monitors the Oref Alert Proxy for alert state changes and plays
TTS announcements through Snapcast speaker groups.

Audio delivery: connects to a Snapcast TCP source and streams raw PCM data.
Requires Snapcast server to have a TCP source configured in snapserver.conf:

  source = tcp://0.0.0.0:4953?name=RedAlert&sampleformat=48000:16:2&mode=server

Pre-recorded WAV files ship in audio/ — loaded into memory at startup for
zero-latency playback. Custom text uses edge-tts to generate on the fly.

Snapcast control: uses JSON-RPC over WebSocket (port 1780) for client/group
discovery and stream management.

Environment variables: see .env.example
"""

import asyncio
import json
import logging
import os
import subprocess
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path

import edge_tts
import httpx
import uvicorn
import websockets
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

AUDIO_DIR = Path(__file__).parent / "audio"

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("redalert.snapcast-tts")


def _log_task_exception(task: asyncio.Task):
    """Log exceptions from fire-and-forget tasks."""
    if not task.cancelled() and task.exception():
        log.error("Background task failed: %s", task.exception())

# ── Configuration ────────────────────────────────────────────────────────────

OREF_PROXY_URL = os.environ.get("OREF_PROXY_URL", "http://localhost:8764")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "3"))
LOCAL_AREA = os.environ.get("ALERT_AREA", "") or os.environ.get("LOCAL_AREA", "")
HTTP_PORT = int(os.environ.get("PORT", "8783"))

# Snapcast connection
SNAPCAST_SERVER = os.environ.get("SNAPCAST_SERVER", "")
SNAPCAST_JSONRPC_PORT = int(os.environ.get("SNAPCAST_PORT", "1780"))
SNAPCAST_STREAM_PORT = int(os.environ.get("SNAPCAST_STREAM_PORT", "4953"))
SNAPCAST_GROUP = os.environ.get("SNAPCAST_GROUP", "")

# TTS configuration
TTS_VOICE = os.environ.get("TTS_VOICE", "en-US-GuyNeural")
SNAPCAST_VOLUME = int(os.environ.get("SNAPCAST_VOLUME", "50"))  # 0-100


def _env_bool(key: str, default: bool = True) -> bool:
    val = os.environ.get(key, "").lower()
    if not val:
        return default
    return val in ("1", "true", "yes")


TTS_ON_WARNING = _env_bool("TTS_ON_WARNING", True)
TTS_ON_ACTIVE = _env_bool("TTS_ON_ACTIVE", True)
TTS_ON_CLEAR = _env_bool("TTS_ON_CLEAR", True)
TTS_ON_THRESHOLD = _env_bool("TTS_ON_THRESHOLD", True)
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

# Alert categories (from shared module)
from alert_constants import ACTIVE_CATEGORIES, RED_CATEGORIES, THRESHOLD_LEVELS

# ── TTS Messages ─────────────────────────────────────────────────────────────
# All messages are pre-generated at startup and cached as raw PCM bytes.

MESSAGES = {
    # Localized alerts (generic — not area-specific)
    "active": (
        "Red alert. Active threat detected in your area. "
        "Seek shelter immediately."
    ),
    "warning": (
        "Early warning. Alerts are expected shortly in your area. "
        "Move to a protected space and stay nearby."
    ),
    "clear": (
        "All clear. The event in your area has ended. "
        "You may leave the protected space."
    ),
    # Nationwide thresholds
    "threshold_50": (
        "Nationwide alert. Over 50 areas are under simultaneous "
        "active alert across Israel."
    ),
    "threshold_100": (
        "Nationwide alert. Over 100 areas are under simultaneous "
        "active alert across Israel."
    ),
    "threshold_200": (
        "Major attack in progress. Over 200 areas are under "
        "active alert across Israel."
    ),
    "threshold_300": (
        "Major attack in progress. Over 300 areas are under "
        "active alert across Israel."
    ),
    "threshold_400": (
        "Large scale attack. Over 400 areas are under "
        "active alert across Israel."
    ),
    "threshold_500": (
        "Large scale attack. Over 500 areas are under "
        "active alert across Israel."
    ),
    "threshold_600": (
        "Massive attack in progress. Over 600 areas are under "
        "active alert across Israel."
    ),
    "threshold_700": (
        "Massive attack in progress. Over 700 areas are under "
        "active alert across Israel."
    ),
    "threshold_800": (
        "Unprecedented attack. Over 800 areas are under "
        "active alert across Israel."
    ),
    "threshold_900": (
        "Unprecedented attack. Over 900 areas are under "
        "active alert across Israel."
    ),
    "threshold_1000": (
        "Unprecedented nationwide emergency. Over 1000 areas are under "
        "active alert across Israel."
    ),
    # Test / system
    "test": (
        "This is a test announcement from the Red Alert dashboard. "
        "If you can hear this, your Snapcast audio is working correctly."
    ),
    "test_active": (
        "This is a test. Red alert test in progress. "
        "This is only a test."
    ),
    "test_warning": (
        "This is a test. Early warning test in progress. "
        "This is only a test."
    ),
    "test_clear": (
        "This is a test. The test alert has ended."
    ),
}

# In-memory cache of pre-generated PCM audio: message_key -> bytes
_pcm_cache: dict[str, bytes] = {}


# ── TTS Engine ───────────────────────────────────────────────────────────────


async def _text_to_pcm(text: str, voice: str = TTS_VOICE) -> bytes:
    """Convert text to raw PCM (48kHz, 16-bit, stereo) via edge-tts + ffmpeg."""
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        mp3_path = f.name

    try:
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(mp3_path)

        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", mp3_path,
                "-ar", "48000", "-ac", "2", "-f", "s16le",
                "-acodec", "pcm_s16le", "pipe:1",
            ],
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            log.error("ffmpeg error: %s", result.stderr.decode()[:200])
            return b""
        return result.stdout
    finally:
        try:
            os.unlink(mp3_path)
        except OSError:
            pass


def _wav_to_pcm(wav_path: Path) -> bytes:
    """Extract raw PCM from a WAV file (skip 44-byte header)."""
    data = wav_path.read_bytes()
    # Standard WAV header is 44 bytes; find "data" chunk for robustness
    idx = data.find(b"data")
    if idx >= 0:
        # 4 bytes after "data" marker is the chunk size, then PCM data
        return data[idx + 8:]
    # Fallback: skip standard 44-byte header
    return data[44:]


def load_audio_cache():
    """Load pre-generated WAV files from audio/ into memory as raw PCM.

    Falls back to edge-tts generation for any missing files.
    """
    log.info("Loading %d TTS messages from audio/...", len(MESSAGES))
    loaded = 0
    for key in MESSAGES:
        wav_path = AUDIO_DIR / f"{key}.wav"
        if wav_path.exists():
            pcm = _wav_to_pcm(wav_path)
            if pcm:
                _pcm_cache[key] = pcm
                loaded += 1
                log.info("  %-20s  %d bytes (%.1fs)", key, len(pcm), len(pcm) / (48000 * 2 * 2))
                continue
        log.warning("  %-20s  NOT FOUND — will generate on first use", key)
    log.info("Audio cache ready: %d/%d loaded from disk", loaded, len(MESSAGES))


# ── Snapcast Audio Streaming ────────────────────────────────────────────────

# Lock to serialize announcements (don't overlap stream switches)
_announce_lock = asyncio.Lock()

STREAM_ID = "RedAlert"
STREAM_URI = (
    f"tcp://0.0.0.0:{SNAPCAST_STREAM_PORT}"
    f"?name={STREAM_ID}&sampleformat=48000:16:2&mode=server"
)


async def _ensure_stream(sc: "SnapcastClient"):
    """Create the RedAlert TCP stream if it doesn't already exist."""
    try:
        streams = await sc.get_streams()
        if any(s["id"] == STREAM_ID for s in streams):
            return
        await sc.add_stream(STREAM_URI)
        log.info("Created dynamic stream: %s", STREAM_ID)
    except Exception as e:
        log.error("Failed to ensure RedAlert stream: %s", e)
        raise


async def _play_pcm(pcm_data: bytes) -> bool:
    """Full announce cycle: switch groups → set volume → stream → restore."""
    if not _snapcast:
        log.error("No Snapcast client available")
        return False

    sc = _snapcast
    try:
        await _ensure_stream(sc)
    except Exception:
        return False

    # Snapshot current state and switch connected groups to RedAlert stream
    status = await sc.get_status()
    groups = status.get("server", {}).get("groups", [])
    original: dict[str, dict] = {}  # group_id -> {stream_id, clients: {id: volume}}

    for g in groups:
        connected = [c for c in g.get("clients", []) if c.get("connected")]
        if not connected:
            continue
        gid = g["id"]
        original[gid] = {
            "stream_id": g.get("stream_id", "default"),
            "clients": {
                c["id"]: c.get("config", {}).get("volume", {}).get("percent", 100)
                for c in connected
            },
        }
        # Switch to RedAlert stream
        await sc.set_group_stream(gid, STREAM_ID)
        # Set announcement volume
        for cid in original[gid]["clients"]:
            await sc.set_client_volume(cid, SNAPCAST_VOLUME)

    if not original:
        log.warning("No connected groups to announce to")
        return False

    # Stream the PCM audio
    try:
        reader, writer = await asyncio.open_connection(SNAPCAST_SERVER, SNAPCAST_STREAM_PORT)
        writer.write(pcm_data)
        await writer.drain()

        # Wait for playback to finish
        duration = len(pcm_data) / (48000 * 2 * 2)
        await asyncio.sleep(duration + 0.5)

        writer.close()
        await writer.wait_closed()
        log.info("Streamed %.1fs of audio to %s:%d", duration, SNAPCAST_SERVER, SNAPCAST_STREAM_PORT)
    except Exception as e:
        log.error("TCP stream failed: %s", e)

    # Restore original streams and volumes
    for gid, orig in original.items():
        try:
            await sc.set_group_stream(gid, orig["stream_id"])
            for cid, vol in orig["clients"].items():
                await sc.set_client_volume(cid, vol)
        except Exception as e:
            log.error("Failed to restore group %s: %s", gid[:8], e)

    return True


async def announce(message_key: str) -> bool:
    """Play a pre-generated message through Snapcast."""
    if not SNAPCAST_SERVER:
        log.warning("SNAPCAST_SERVER not configured — skipping announcement")
        return False

    pcm = _pcm_cache.get(message_key)
    if not pcm:
        log.warning("No cached audio for '%s' — generating on the fly", message_key)
        text = MESSAGES.get(message_key, "")
        if not text:
            return False
        pcm = await _text_to_pcm(text)
        if not pcm:
            return False
        _pcm_cache[message_key] = pcm

    log.info("Announcing: %s", message_key)
    async with _announce_lock:
        return await _play_pcm(pcm)


async def announce_custom(text: str) -> bool:
    """Generate and play arbitrary TTS text (not cached)."""
    if not SNAPCAST_SERVER:
        log.warning("SNAPCAST_SERVER not configured — skipping announcement")
        return False

    log.info("Custom announcement: %s", text[:80])
    pcm = await _text_to_pcm(text)
    if not pcm:
        return False
    async with _announce_lock:
        return await _play_pcm(pcm)


# ── Snapcast JSON-RPC Client (WebSocket) ────────────────────────────────────


class SnapcastClient:
    """Communicates with Snapcast server via JSON-RPC over WebSocket."""

    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self._req_id = 0

    @property
    def _ws_url(self) -> str:
        return f"ws://{self.host}:{self.port}/jsonrpc"

    async def _rpc(self, method: str, params: dict | None = None) -> dict:
        self._req_id += 1
        msg = {"id": self._req_id, "jsonrpc": "2.0", "method": method}
        if params:
            msg["params"] = params

        async with websockets.connect(self._ws_url) as ws:
            await ws.send(json.dumps(msg))
            resp = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))

        if "error" in resp:
            raise RuntimeError(f"Snapcast RPC error: {resp['error']}")
        return resp.get("result", {})

    async def get_status(self) -> dict:
        return await self._rpc("Server.GetStatus")

    async def get_clients(self) -> list[dict]:
        status = await self.get_status()
        server = status.get("server", {})
        clients = []
        for group in server.get("groups", []):
            group_name = group.get("name", "")
            group_id = group.get("id", "")
            stream_id = group.get("stream_id", "")
            for client in group.get("clients", []):
                config = client.get("config", {})
                host_info = client.get("host", {})
                clients.append({
                    "id": client.get("id", ""),
                    "name": config.get("name", ""),
                    "host": host_info.get("ip", ""),
                    "mac": host_info.get("mac", ""),
                    "connected": client.get("connected", False),
                    "volume": config.get("volume", {}).get("percent", 0),
                    "muted": config.get("volume", {}).get("muted", False),
                    "group_id": group_id,
                    "group_name": group_name,
                    "stream_id": stream_id,
                })
        return clients

    async def get_groups(self) -> list[dict]:
        status = await self.get_status()
        server = status.get("server", {})
        groups = []
        for group in server.get("groups", []):
            groups.append({
                "id": group.get("id", ""),
                "name": group.get("name", ""),
                "stream_id": group.get("stream_id", ""),
                "muted": group.get("muted", False),
                "clients": [
                    {
                        "id": c.get("id", ""),
                        "name": c.get("config", {}).get("name", ""),
                        "connected": c.get("connected", False),
                    }
                    for c in group.get("clients", [])
                ],
            })
        return groups

    async def get_streams(self) -> list[dict]:
        status = await self.get_status()
        server = status.get("server", {})
        return [
            {
                "id": s.get("id", ""),
                "status": s.get("status", ""),
                "uri": s.get("uri", {}).get("raw", ""),
            }
            for s in server.get("streams", [])
        ]

    async def add_stream(self, stream_uri: str) -> dict:
        return await self._rpc("Stream.AddStream", {"streamUri": stream_uri})

    async def set_group_stream(self, group_id: str, stream_id: str):
        return await self._rpc("Group.SetStream", {"id": group_id, "stream_id": stream_id})

    async def set_client_volume(self, client_id: str, percent: int, muted: bool = False):
        return await self._rpc("Client.SetVolume", {
            "id": client_id,
            "volume": {"percent": percent, "muted": muted},
        })


# ── Alert Monitor ────────────────────────────────────────────────────────────


class AlertMonitor:
    def __init__(self, http_client: httpx.AsyncClient):
        self.http_client = http_client
        self.prev_local_state: str = ""
        self.prev_threshold: int = 0
        self.prev_alert_ids: set[str] = set()
        self.last_active_time: float = 0
        self.all_clear_sent: bool = False

    async def poll(self):
        try:
            resp = await self.http_client.get(
                f"{OREF_PROXY_URL}/api/alerts", timeout=10
            )
            data = resp.json()
            alerts = data.get("alerts", [])
        except Exception as e:
            log.error("Proxy poll error: %s", e)
            return

        for a in alerts:
            if "cat" in a and "category" not in a:
                a["category"] = a["cat"]

        # Thresholds every poll
        active = [a for a in alerts if a.get("category", 0) in ACTIVE_CATEGORIES]
        active_areas = {a.get("data", "") for a in active}
        await self._process_general_alerts(len(active_areas))

        # Localized alerts only on change
        current_ids = {f"{a.get('data', '')}:{a.get('category', 0)}" for a in alerts}
        if current_ids == self.prev_alert_ids:
            await self._check_idle_restore()
            return
        self.prev_alert_ids = current_ids

        await self._process_localized_alerts(alerts)
        await self._check_idle_restore()

    async def _process_localized_alerts(self, alerts: list[dict]):
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

        if local_state == "active" and TTS_ON_ACTIVE:
            self.last_active_time = time.time()
            self.all_clear_sent = False
            task = asyncio.create_task(announce("active"))
            task.add_done_callback(_log_task_exception)

        elif local_state == "warning" and TTS_ON_WARNING:
            self.last_active_time = time.time()
            self.all_clear_sent = False
            task = asyncio.create_task(announce("warning"))
            task.add_done_callback(_log_task_exception)

        elif local_state == "clear" and TTS_ON_CLEAR:
            if self.prev_local_state in ("active", "warning"):
                self.all_clear_sent = True
                task = asyncio.create_task(announce("clear"))
                task.add_done_callback(_log_task_exception)

        elif local_state == "" and self.prev_local_state:
            if not self.all_clear_sent and self.prev_local_state in ("active", "warning"):
                if TTS_ON_CLEAR:
                    self.all_clear_sent = True
                    task = asyncio.create_task(announce("clear"))
                    task.add_done_callback(_log_task_exception)

        self.prev_local_state = local_state

    async def _process_general_alerts(self, active_count: int):
        if not TTS_ON_THRESHOLD:
            return

        current_threshold = 0
        for t in THRESHOLD_LEVELS:
            if active_count >= t:
                current_threshold = t
                break

        if current_threshold > self.prev_threshold:
            key = f"threshold_{current_threshold}"
            self.last_active_time = time.time()
            self.all_clear_sent = False
            task = asyncio.create_task(announce(key))
            task.add_done_callback(_log_task_exception)

        self.prev_threshold = current_threshold

    async def _check_idle_restore(self):
        if not self.last_active_time:
            return
        if time.time() - self.last_active_time > 120:
            self.last_active_time = 0
            self.prev_threshold = 0


# ── Shared state ─────────────────────────────────────────────────────────────

_monitor: AlertMonitor | None = None
_http_client: httpx.AsyncClient | None = None
_snapcast: SnapcastClient | None = None


# ── FastAPI ──────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _monitor, _http_client, _snapcast

    _http_client = httpx.AsyncClient()
    _monitor = AlertMonitor(_http_client)

    if SNAPCAST_SERVER:
        _snapcast = SnapcastClient(SNAPCAST_SERVER, SNAPCAST_JSONRPC_PORT)

    log.info("Snapcast TTS starting...")
    log.info("Proxy: %s", OREF_PROXY_URL)
    log.info("Local area: %s", LOCAL_AREA or "(not set)")
    log.info("Snapcast server: %s", SNAPCAST_SERVER or "(not configured)")
    log.info("Snapcast stream port: %d", SNAPCAST_STREAM_PORT)
    log.info("Snapcast JSON-RPC (WebSocket): ws://%s:%d/jsonrpc",
             SNAPCAST_SERVER or "?", SNAPCAST_JSONRPC_PORT)
    log.info("TTS voice: %s", TTS_VOICE)
    log.info(
        "TTS triggers — warning=%s active=%s clear=%s threshold=%s",
        TTS_ON_WARNING, TTS_ON_ACTIVE, TTS_ON_CLEAR, TTS_ON_THRESHOLD,
    )

    # Load pre-generated audio from disk
    load_audio_cache()

    poll_task = asyncio.create_task(_poll_loop())
    yield

    poll_task.cancel()
    try:
        await poll_task
    except asyncio.CancelledError:
        pass
    await _http_client.aclose()
    log.info("Snapcast TTS stopped")


async def _poll_loop():
    while True:
        await _monitor.poll()
        await asyncio.sleep(POLL_INTERVAL)


app = FastAPI(title="Red Alert Snapcast TTS", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    snapcast_ok = False
    if _snapcast:
        try:
            await _snapcast.get_status()
            snapcast_ok = True
        except Exception:
            pass

    return {
        "status": "ok",
        "service": "snapcast-tts",
        "local_area": LOCAL_AREA or None,
        "snapcast_server": SNAPCAST_SERVER or None,
        "snapcast_reachable": snapcast_ok,
        "tts_voice": TTS_VOICE,
        "cached_messages": len(_pcm_cache),
        "total_messages": len(MESSAGES),
        "triggers": {
            "warning": TTS_ON_WARNING,
            "active": TTS_ON_ACTIVE,
            "clear": TTS_ON_CLEAR,
            "threshold": TTS_ON_THRESHOLD,
        },
        "current_state": _monitor.prev_local_state if _monitor else "unknown",
    }


@app.get("/api/clients")
async def list_clients():
    """Scan Snapcast server and return all clients."""
    if not _snapcast:
        return {"error": "SNAPCAST_SERVER not configured"}
    try:
        return {"clients": await _snapcast.get_clients()}
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/groups")
async def list_groups():
    """List all Snapcast groups with their clients and streams."""
    if not _snapcast:
        return {"error": "SNAPCAST_SERVER not configured"}
    try:
        return {"groups": await _snapcast.get_groups()}
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/streams")
async def list_streams():
    """List all configured Snapcast streams."""
    if not _snapcast:
        return {"error": "SNAPCAST_SERVER not configured"}
    try:
        return {"streams": await _snapcast.get_streams()}
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/status")
async def snapcast_status():
    """Full Snapcast server status (raw JSON-RPC response)."""
    if not _snapcast:
        return {"error": "SNAPCAST_SERVER not configured"}
    try:
        return await _snapcast.get_status()
    except Exception as e:
        return {"error": str(e)}


class TestRequest(BaseModel):
    message: str = ""  # custom text (generated on the fly)
    message_key: str = ""  # predefined key (plays from cache)


@app.post("/api/test")
async def test_announce(req: TestRequest):
    """Play a test TTS announcement through Snapcast."""
    if not SNAPCAST_SERVER:
        return {"error": "SNAPCAST_SERVER not configured"}

    if req.message:
        ok = await announce_custom(req.message)
        return {"status": "ok" if ok else "failed", "text": req.message}
    elif req.message_key:
        if req.message_key not in MESSAGES:
            return {
                "error": f"Unknown message key: {req.message_key}",
                "valid_keys": list(MESSAGES.keys()),
            }
        ok = await announce(req.message_key)
        return {"status": "ok" if ok else "failed", "key": req.message_key}
    else:
        ok = await announce("test")
        return {"status": "ok" if ok else "failed", "key": "test"}


@app.get("/api/messages")
async def list_messages():
    """List all predefined TTS messages and their cache status."""
    return {
        "messages": {
            key: {
                "text": text,
                "cached": key in _pcm_cache,
                "size_bytes": len(_pcm_cache[key]) if key in _pcm_cache else 0,
            }
            for key, text in MESSAGES.items()
        }
    }


@app.post("/api/regenerate")
async def regenerate():
    """Re-generate all TTS messages via edge-tts (e.g. after changing TTS_VOICE)."""
    _pcm_cache.clear()
    generated = 0
    for key, text in MESSAGES.items():
        pcm = await _text_to_pcm(text)
        if pcm:
            _pcm_cache[key] = pcm
            generated += 1
    return {"status": "ok", "cached": generated, "total": len(MESSAGES)}


# ── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=HTTP_PORT)
