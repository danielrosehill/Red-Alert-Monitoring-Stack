"""Oref Alert Proxy — Local relay for Israel Homefront Command alerts.

Dumb relay that polls the Oref (Pikud HaOref) alert endpoints every few
seconds and exposes the raw data via a local HTTP API. Consumers (dashboards,
bots, notification services) read from this proxy instead of hitting Oref
directly, so there's only one poller regardless of how many services need
the data.

The proxy does NO interpretation — no category remapping, no persistence
logic, no alert tracking. It passes through whatever Oref returns, verbatim.

Endpoints:
  GET /api/alerts          — Current active alerts (polled every POLL_INTERVAL)
  GET /api/history         — Today's alert history (polled every HISTORY_INTERVAL)
  GET /api/health          — Health check
  GET /api/status          — Poller status (last poll time, counts, errors)

Environment variables:
  POLL_INTERVAL            — Active alert poll interval in seconds (default: 3)
  HISTORY_INTERVAL         — History poll interval in seconds (default: 60)
  HOST                     — Bind address (default: 0.0.0.0)
  PORT                     — Listen port (default: 8764)

Note: Must run from an Israeli IP — Oref endpoints are geo-restricted.
"""

import asyncio
import json
import logging
import os
import time

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("oref-proxy")

# ── Configuration ────────────────────────────────────────────────────────────

POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "3"))
HISTORY_INTERVAL = int(os.environ.get("HISTORY_INTERVAL", "60"))
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8764"))

OREF_ALERTS_URL = "https://www.oref.org.il/WarningMessages/alert/alerts.json"
OREF_HISTORY_URL = "https://www.oref.org.il/WarningMessages/alert/History/AlertsHistory.json"

OREF_HEADERS = {
    "Referer": "https://www.oref.org.il/",
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
}

# ── In-memory cache ─────────────────────────────────────────────────────────

cache = {
    "alerts": {
        "data": [],
        "raw": "",           # Raw response text from Oref
        "timestamp": 0.0,
    },
    "history": {
        "data": [],
        "timestamp": 0.0,
    },
}

stats = {
    "alerts_polls": 0,
    "alerts_errors": 0,
    "history_polls": 0,
    "history_errors": 0,
    "started": 0.0,
    "last_alert_poll": 0.0,
    "last_history_poll": 0.0,
    "last_nonempty_alerts": 0.0,
}

http_client: httpx.AsyncClient | None = None

# ── Polling ──────────────────────────────────────────────────────────────────


async def poll_alerts():
    """Fetch current alerts from Oref. Stores raw response verbatim."""
    while True:
        try:
            resp = await http_client.get(
                OREF_ALERTS_URL, headers=OREF_HEADERS, timeout=10
            )
            text = resp.text.strip().lstrip("\ufeff")
            stats["alerts_polls"] += 1
            stats["last_alert_poll"] = time.time()

            if not text:
                alerts = []
            else:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    alerts = parsed
                elif isinstance(parsed, dict):
                    # Oref sometimes returns a single object instead of array
                    alerts = [parsed]
                else:
                    alerts = []

            cache["alerts"]["data"] = alerts
            cache["alerts"]["raw"] = text
            cache["alerts"]["timestamp"] = time.time()

            if alerts:
                stats["last_nonempty_alerts"] = time.time()

        except Exception as e:
            stats["alerts_errors"] += 1
            log.error("Alert poll error: %s", e)

        await asyncio.sleep(POLL_INTERVAL)


async def poll_history():
    """Fetch today's alert history from Oref."""
    while True:
        try:
            resp = await http_client.get(
                OREF_HISTORY_URL, headers=OREF_HEADERS, timeout=15
            )
            text = resp.text.strip().lstrip("\ufeff")
            stats["history_polls"] += 1
            stats["last_history_poll"] = time.time()

            if not text:
                history = []
            else:
                history = json.loads(text)
                if not isinstance(history, list):
                    history = []

            cache["history"]["data"] = history
            cache["history"]["timestamp"] = time.time()

        except Exception as e:
            stats["history_errors"] += 1
            log.error("History poll error: %s", e)

        await asyncio.sleep(HISTORY_INTERVAL)


# ── App lifecycle ────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client
    http_client = httpx.AsyncClient()
    stats["started"] = time.time()

    alert_task = asyncio.create_task(poll_alerts())
    history_task = asyncio.create_task(poll_history())
    log.info(
        "Oref Alert Proxy started (alerts every %ds, history every %ds)",
        POLL_INTERVAL,
        HISTORY_INTERVAL,
    )

    yield

    alert_task.cancel()
    history_task.cancel()
    await http_client.aclose()


# ── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(title="Oref Alert Proxy", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/alerts")
async def get_alerts():
    """Current active alerts — raw Oref data, no interpretation."""
    return {
        "alerts": cache["alerts"]["data"],
        "timestamp": cache["alerts"]["timestamp"],
    }


@app.get("/api/alerts/raw")
async def get_alerts_raw():
    """Raw Oref response text, for consumers that want to parse themselves."""
    return {
        "raw": cache["alerts"]["raw"],
        "timestamp": cache["alerts"]["timestamp"],
    }


@app.get("/api/history")
async def get_history():
    """Today's alert history — raw Oref data."""
    return {
        "history": cache["history"]["data"],
        "timestamp": cache["history"]["timestamp"],
    }


@app.get("/api/health")
async def health():
    return {"status": "ok", "uptime": time.time() - stats["started"]}


@app.get("/api/status")
async def status():
    """Poller stats for monitoring."""
    now = time.time()
    return {
        "uptime_seconds": round(now - stats["started"], 1),
        "alerts": {
            "poll_count": stats["alerts_polls"],
            "error_count": stats["alerts_errors"],
            "last_poll_ago": round(now - stats["last_alert_poll"], 1) if stats["last_alert_poll"] else None,
            "last_nonempty_ago": round(now - stats["last_nonempty_alerts"], 1) if stats["last_nonempty_alerts"] else None,
            "current_count": len(cache["alerts"]["data"]),
            "poll_interval": POLL_INTERVAL,
        },
        "history": {
            "poll_count": stats["history_polls"],
            "error_count": stats["history_errors"],
            "last_poll_ago": round(now - stats["last_history_poll"], 1) if stats["last_history_poll"] else None,
            "current_count": len(cache["history"]["data"]),
            "poll_interval": HISTORY_INTERVAL,
        },
    }


# ── Entrypoint ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
