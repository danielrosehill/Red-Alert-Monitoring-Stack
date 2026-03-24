"""Red Alert MCP Server — exposes alert data as tools for AI agents.

Tools:
  - get_current_alerts: Returns all currently active alerts nationwide
  - get_area_alerts: Returns alerts within a user-defined area/perimeter
  - get_alert_history: Returns recent alert history
  - get_sample_payloads: Returns stored sample alert payloads for development
  - get_news: Returns cached news from the RSS cache service

Also stores one sample alert payload every 3 hours (max) to build a reference
library of real payload structures in data/samples.json.
"""

import atexit
import os
import json
import logging
import time
import asyncio
import math
from datetime import datetime, timezone
from pathlib import Path

import httpx
from mcp.server.fastmcp import FastMCP

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("redalert.mcp")

PROXY_URL = os.getenv("OREF_PROXY_URL", "http://oref-proxy:8764")
RSS_CACHE_URL = os.getenv("RSS_CACHE_URL", "http://rss-cache:8785")
SAMPLE_INTERVAL = int(os.getenv("SAMPLE_INTERVAL", "10800"))  # 3 hours
SAMPLES_FILE = Path(os.getenv("SAMPLES_PATH", "/app/data/samples.json"))
MAX_SAMPLES = int(os.getenv("MAX_SAMPLES", "100"))

mcp = FastMCP("Red Alert MCP Server")

http_client: httpx.AsyncClient | None = None
_last_sample_time: float = 0


def _load_samples() -> list[dict]:
    if SAMPLES_FILE.exists():
        try:
            return json.loads(SAMPLES_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return []
    return []


def _save_samples(samples: list[dict]):
    SAMPLES_FILE.parent.mkdir(parents=True, exist_ok=True)
    SAMPLES_FILE.write_text(json.dumps(samples, indent=2, ensure_ascii=False))


def _maybe_store_sample(alerts: list | dict):
    """Store one sample payload every SAMPLE_INTERVAL seconds."""
    global _last_sample_time
    now = time.time()

    if now - _last_sample_time < SAMPLE_INTERVAL:
        return
    if not alerts:
        return

    payload = alerts if isinstance(alerts, list) else [alerts]
    if not payload:
        return

    sample = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "alert_count": len(payload),
        "payload": payload[:5],  # store up to 5 alerts per sample
    }

    samples = _load_samples()
    samples.append(sample)
    if len(samples) > MAX_SAMPLES:
        samples = samples[-MAX_SAMPLES:]
    _save_samples(samples)
    _last_sample_time = now


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in km."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def _get_client() -> httpx.AsyncClient:
    global http_client
    if http_client is None:
        http_client = httpx.AsyncClient()
    return http_client


@mcp.tool()
async def get_current_alerts() -> str:
    """Get all currently active Pikud HaOref alerts across Israel.

    Returns the raw alert data from the Oref Alert Proxy including
    area names, alert categories, and timestamps.
    """
    client = await _get_client()
    try:
        resp = await client.get(f"{PROXY_URL}/api/alerts", timeout=5)
        data = resp.json()
        _maybe_store_sample(data)
        if not data:
            return json.dumps({"status": "all_clear", "message": "No active alerts", "alerts": []})
        return json.dumps({"status": "active", "alert_count": len(data) if isinstance(data, list) else 1, "alerts": data}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e), "proxy_url": PROXY_URL})


@mcp.tool()
async def get_area_alerts(latitude: float, longitude: float, radius_km: float = 50.0) -> str:
    """Get alerts within a radius of a geographic point.

    Args:
        latitude: Center point latitude (e.g., 31.77 for Jerusalem)
        longitude: Center point longitude (e.g., 35.21 for Jerusalem)
        radius_km: Search radius in kilometers (default: 50km)

    Returns alerts from areas whose centers fall within the specified radius.
    Requires the proxy to include lat/lon data in alert responses.
    """
    client = await _get_client()
    try:
        resp = await client.get(f"{PROXY_URL}/api/alerts", timeout=5)
        data = resp.json()
        _maybe_store_sample(data)

        if not data:
            return json.dumps({
                "status": "all_clear",
                "center": {"lat": latitude, "lon": longitude},
                "radius_km": radius_km,
                "alerts": [],
            })

        alerts = data if isinstance(data, list) else [data]
        nearby = []
        for alert in alerts:
            alert_lat = alert.get("lat") or alert.get("latitude")
            alert_lon = alert.get("lon") or alert.get("lng") or alert.get("longitude")
            if alert_lat is not None and alert_lon is not None:
                dist = _haversine_km(latitude, longitude, float(alert_lat), float(alert_lon))
                if dist <= radius_km:
                    alert["distance_km"] = round(dist, 1)
                    nearby.append(alert)
            else:
                # If no coordinates, include with a note
                alert["distance_km"] = None
                alert["note"] = "No coordinates available for distance filtering"
                nearby.append(alert)

        return json.dumps({
            "status": "active" if nearby else "all_clear_in_area",
            "center": {"lat": latitude, "lon": longitude},
            "radius_km": radius_km,
            "alert_count": len(nearby),
            "alerts": nearby,
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def get_alert_history() -> str:
    """Get recent alert history from the Oref Alert Proxy.

    Returns the last few hours of alerts including resolved ones.
    """
    client = await _get_client()
    try:
        resp = await client.get(f"{PROXY_URL}/api/history", timeout=10)
        return json.dumps(resp.json(), ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
async def get_news(limit: int = 10) -> str:
    """Get cached news articles related to Israeli security from the RSS cache.

    Args:
        limit: Maximum number of articles to return (default: 10, max: 50)
    """
    limit = max(1, min(limit, 50))
    client = await _get_client()
    try:
        resp = await client.get(f"{RSS_CACHE_URL}/api/news", params={"limit": limit}, timeout=5)
        return json.dumps(resp.json(), ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e), "note": "RSS cache service may not be running"})


@mcp.tool()
async def get_sample_payloads(last_n: int = 5) -> str:
    """Get stored sample alert payloads for development reference.

    The system automatically captures one real alert payload every 3 hours
    to build a library of payload structures.

    Args:
        last_n: Number of most recent samples to return (default: 5, max: 20)
    """
    last_n = max(1, min(last_n, 20))
    samples = _load_samples()
    recent = samples[-last_n:] if samples else []
    return json.dumps({
        "total_samples": len(samples),
        "returned": len(recent),
        "samples": recent,
    }, ensure_ascii=False)


@mcp.tool()
async def get_proxy_status() -> str:
    """Check the health/status of the Oref Alert Proxy."""
    client = await _get_client()
    try:
        resp = await client.get(f"{PROXY_URL}/api/status", timeout=5)
        return json.dumps(resp.json(), ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e), "proxy_url": PROXY_URL})


def _cleanup():
    """Close HTTP client on shutdown."""
    global http_client
    if http_client:
        asyncio.get_event_loop().run_until_complete(http_client.aclose())
        log.info("MCP server HTTP client closed")


atexit.register(_cleanup)

if __name__ == "__main__":
    log.info("Starting MCP server on port 8786")
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8786)
