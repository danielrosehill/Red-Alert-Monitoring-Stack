"""Red Alert Stack Management UI — lightweight status dashboard."""

import os
import asyncio
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

app = FastAPI(title="Red Alert Stack Manager")
templates = Jinja2Templates(directory="/app/templates")
app.mount("/static", StaticFiles(directory="/app/static"), name="static")

# Service definitions from environment
SERVICES = {
    "oref-proxy": {
        "name": "Oref Alert Proxy",
        "url": os.getenv("OREF_PROXY_URL", "http://oref-proxy:8764"),
        "health": "/api/status",
        "port": 8764,
        "description": "Polls Pikud HaOref every 3s, serves raw alert data",
    },
    "geodash": {
        "name": "Geodash Dashboard",
        "url": os.getenv("GEODASH_URL", "http://geodash:8083"),
        "health": "/",
        "port": 8083,
        "description": "Real-time map dashboard with InfluxDB storage",
        "ui_url": os.getenv("GEODASH_EXTERNAL_URL", "http://localhost:8083"),
    },
    "pushover": {
        "name": "Pushover Notifier",
        "url": os.getenv("PUSHOVER_URL", "http://pushover:8780"),
        "health": "/health",
        "port": 8780,
        "description": "Push notifications for volumetric alert thresholds",
    },
    "telegram-bot": {
        "name": "Telegram Bot",
        "url": os.getenv("TELEGRAM_BOT_URL", "http://telegram-bot:8781"),
        "health": "/health",
        "port": 8781,
        "description": "AI situation reports and on-demand alert queries",
    },
    "actuator": {
        "name": "Actuator",
        "url": os.getenv("ACTUATOR_URL", "http://actuator:8782"),
        "health": "/health",
        "port": 8782,
        "description": "TTS announcements via Snapcast + MQTT smart lights",
    },
    "influxdb": {
        "name": "InfluxDB",
        "url": os.getenv("INFLUXDB_URL", "http://influxdb:8086"),
        "health": "/health",
        "port": 8086,
        "description": "Time-series database for alert history",
    },
    "mosquitto": {
        "name": "Mosquitto MQTT",
        "url": None,  # MQTT doesn't have HTTP health
        "health": None,
        "port": 1883,
        "description": "MQTT broker for smart light control",
        "tcp_check": os.getenv("MQTT_BROKER", "mosquitto:1883"),
    },
    "portainer": {
        "name": "Portainer",
        "url": os.getenv("PORTAINER_URL", "http://portainer:9000"),
        "health": "/api/status",
        "port": 9000,
        "description": "Docker container management UI",
        "ui_url": os.getenv("PORTAINER_EXTERNAL_URL", "http://localhost:9000"),
    },
}


async def check_http(client: httpx.AsyncClient, url: str, path: str) -> dict:
    """Check HTTP service health."""
    try:
        resp = await client.get(f"{url}{path}", timeout=3.0)
        return {"status": "up", "code": resp.status_code}
    except Exception as e:
        return {"status": "down", "error": str(type(e).__name__)}


async def check_tcp(host: str, port: int) -> dict:
    """Check TCP connectivity (for MQTT etc)."""
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=3.0
        )
        writer.close()
        await writer.wait_closed()
        return {"status": "up"}
    except Exception as e:
        return {"status": "down", "error": str(type(e).__name__)}


async def get_all_statuses() -> dict:
    """Check all services concurrently."""
    results = {}
    async with httpx.AsyncClient() as client:
        tasks = {}
        for svc_id, svc in SERVICES.items():
            if svc.get("tcp_check"):
                host, port = svc["tcp_check"].rsplit(":", 1)
                tasks[svc_id] = check_tcp(host, int(port))
            elif svc["url"] and svc["health"]:
                tasks[svc_id] = check_http(client, svc["url"], svc["health"])
            else:
                results[svc_id] = {"status": "unknown"}

        checks = await asyncio.gather(
            *tasks.values(), return_exceptions=True
        )
        for svc_id, result in zip(tasks.keys(), checks):
            if isinstance(result, Exception):
                results[svc_id] = {"status": "down", "error": str(result)}
            else:
                results[svc_id] = result

    return results


@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    statuses = await get_all_statuses()
    return templates.TemplateResponse(
        "dashboard.html",
        {
            "request": request,
            "services": SERVICES,
            "statuses": statuses,
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            "stack_name": os.getenv("STACK_NAME", "Red Alert Monitoring Stack"),
        },
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "management-ui"}


@app.get("/api/statuses")
async def api_statuses():
    statuses = await get_all_statuses()
    return {"statuses": statuses, "checked_at": datetime.now(timezone.utc).isoformat()}
