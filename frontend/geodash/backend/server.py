"""Red Alert Geodash — Local Docker deployment with InfluxDB time-series storage.

Background poller fetches Oref alerts every 3s and writes to InfluxDB.
Frontend reads from in-memory cache (live) and InfluxDB (history/timeline).
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import time
import xml.etree.ElementTree as ET
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import FastAPI, Query, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

# ── Logging ─────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("geodash")

# ── Configuration ────────────────────────────────────────────────────────────

INFLUX_URL = os.environ.get("INFLUX_URL", "http://influxdb:8086")
INFLUX_TOKEN = os.environ.get("INFLUX_TOKEN", "")
INFLUX_ORG = os.environ.get("INFLUX_ORG", "geodash")
INFLUX_BUCKET = os.environ.get("INFLUX_BUCKET", "redalerts")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "15"))

OREF_HEADERS = {
    "Referer": "https://www.oref.org.il/",
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
}

ALERTS_URL = "https://www.oref.org.il/WarningMessages/alert/alerts.json"
HISTORY_URL = "https://www.oref.org.il/WarningMessages/alert/History/AlertsHistory.json"
HISTORY_ALT_URL = "https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=he&mode=1"

NEWS_FEEDS = [
    ("https://www.timesofisrael.com/feed/", "Times of Israel"),
    ("https://www.jns.org/feed/", "JNS"),
]

# ── Shared State ─────────────────────────────────────────────────────────────

# In-memory cache for instant reads (no DB query for live view)
cache = {
    "alerts": {"data": [], "timestamp": 0},
    "history": {"data": [], "timestamp": 0},
    "news": {"data": [], "timestamp": 0},
}

HISTORY_CACHE_TTL = 15  # seconds
NEWS_CACHE_TTL = 180    # 3 minutes

# InfluxDB client (initialized at startup)
influx_client: InfluxDBClient | None = None
influx_write = None
influx_query = None

# HTTP client (reused for connection pooling — gentle on Oref)
http_client: httpx.AsyncClient | None = None

# Track previous alert set to detect transitions and avoid redundant writes
prev_alert_areas: set[str] = set()
prev_alert_hash: str = ""  # hash of alert set — only write to InfluxDB on change

# Active test alerts — {area: {alert_dict, expires: epoch}}
test_alerts: dict[str, dict] = {}

# Enriched state — timestamps for calculated fields
last_alert_time: float | None = None  # epoch when last non-empty alert was seen
last_alert_areas: list[str] = []      # areas from the last active alert

# Alert persistence — presume active for 30 min without all-clear
alert_tracking: dict[str, dict] = {}  # area -> {"start": epoch, "alert": dict}
PRESUMED_ACTIVE_DURATION = 1800  # 30 minutes
PREWARNING_ACTIVE_DURATION = 300  # 5 minutes — cat-14 pre-warnings resolve faster

# Shelter instruction titles — these are post-event messages, NOT active threats.
# Oref sends them in single-object format with various "cat" values (e.g. 10)
# but they should all be treated as all-clear (category 13).
SHELTER_INSTRUCTION_TITLES = {
    "האירוע הסתיים",                                          # The event has ended
    "ניתן לצאת מהמרחב המוגן אך יש להישאר בקרבתו",           # May leave shelter, stay nearby
    "סיום שהייה בסמיכות למרחב המוגן",                         # End shelter proximity
}


def is_shelter_instruction(title: str) -> bool:
    """Check if an alert title is a shelter instruction (post-event, not a threat)."""
    if not title:
        return False
    for shelter_title in SHELTER_INSTRUCTION_TITLES:
        if shelter_title in title or title in shelter_title:
            return True
    return False


# Early warning titles — Oref sends these as cat 10 but they are pre-warnings,
# not active infiltration alerts. Remap to category 14 for correct coloring/decay.
EARLY_WARNING_TITLES = {
    "בדקות הקרובות צפויות להתקבל התרעות באזורך",  # Alerts expected shortly in your area
    "יש לשהות בסמיכות למרחב המוגן",                # Stay near protected space
    "מגן אך יש להישאר בקרבתו",                      # Shield, stay nearby
}


def is_early_warning(title: str) -> bool:
    """Check if an alert title is an early warning (alerts expected shortly)."""
    if not title:
        return False
    return any(ew in title or title in ew for ew in EARLY_WARNING_TITLES)


# Monitored areas — regions of interest for the dashboard
MONITORED_AREAS = {
    "jerusalem": "ירושלים - דרום",
    "tel_aviv": "תל אביב - מרכז העיר",
    "haifa": "חיפה - כרמל ועיר תחתית",
    "beer_sheva": "באר שבע - מערב",
}

# Daily format sample — directory for raw Oref response captures
SAMPLES_DIR = Path(__file__).parent.parent / "data" / "format-samples"

# Polygon data cache (loaded at startup for area counting)
polygonData: dict = {}

# Area name translations (Hebrew → English)
areaTranslations: dict = {}


def _human_duration(seconds: float) -> str:
    """Format a duration in seconds to a human-readable string."""
    if seconds < 60:
        return f"{int(seconds)}s"
    if seconds < 3600:
        return f"{int(seconds // 60)}m {int(seconds % 60)}s"
    hours = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    return f"{hours}h {mins}m"


# ── InfluxDB Setup ───────────────────────────────────────────────────────────

async def init_influx_with_retry(max_retries: int = 10, delay: float = 3.0):
    """Initialize InfluxDB client with retry logic for container startup ordering."""
    global influx_client, influx_write, influx_query

    for attempt in range(1, max_retries + 1):
        try:
            client = InfluxDBClient(
                url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG,
            )
            # Verify connection by pinging
            health = client.health()
            if health.status == "pass":
                influx_client = client
                influx_write = client.write_api(write_options=SYNCHRONOUS)
                influx_query = client.query_api()
                log.info("InfluxDB connected (attempt %d)", attempt)
                return
            else:
                log.warning("InfluxDB health check failed: %s", health.message)
        except Exception as e:
            log.warning("InfluxDB connection attempt %d/%d failed: %s", attempt, max_retries, e)

        if attempt < max_retries:
            await asyncio.sleep(delay)

    log.error("Could not connect to InfluxDB after %d attempts — running without persistence", max_retries)


def store_alerts_influx(alerts: list) -> None:
    """Write alert data to InfluxDB. Skips test alerts."""
    if not influx_write:
        return

    # Filter out test alerts — they should never be persisted
    alerts = [a for a in alerts if a.get("alert_type") != "test"]
    if not alerts:
        return

    now = datetime.now(timezone.utc)

    try:
        points = []

        # Individual alert events — one point per area
        for alert in alerts:
            area = alert.get("data", "")
            category = alert.get("category", 0)
            title = alert.get("title", "")
            alert_date = alert.get("alertDate", "")

            p = (
                Point("alert")
                .tag("area", area)
                .tag("title", title)
                .field("category", category)
                .field("alert_date", alert_date)
                .time(now, WritePrecision.S)
            )
            points.append(p)

        # Snapshot — full payload for timeline replay
        snap = (
            Point("snapshot")
            .field("count", len(alerts))
            .field("payload", json.dumps(alerts, ensure_ascii=False))
            .time(now, WritePrecision.S)
        )
        points.append(snap)

        influx_write.write(bucket=INFLUX_BUCKET, record=points)
    except Exception as e:
        log.error("InfluxDB write error: %s", e)


# ── Oref Fetching ────────────────────────────────────────────────────────────

async def fetch_oref(url: str) -> list:
    """Fetch JSON from Oref, handling BOM, empty responses, and single-object format.

    Oref may return:
      - A JSON array of alert objects (normal)
      - A single JSON object with "data" as a list of area names (e.g. all-clear messages)
      - An empty string (no alerts)
    Always returns a list of alert dicts.
    """
    if not http_client:
        return []
    try:
        resp = await http_client.get(url, headers=OREF_HEADERS)
        text = resp.text.strip().lstrip("\ufeff")
        if not text:
            return []
        parsed = json.loads(text)

        # Already a list — normal case
        if isinstance(parsed, list):
            return parsed

        # Single object — Oref sometimes returns one alert dict instead of an array.
        # The "data" field contains area names; expand into per-area alert objects.
        if isinstance(parsed, dict):
            areas = parsed.get("data", [])
            raw_cat = int(parsed.get("cat", 0))
            title = parsed.get("title", "")

            # Shelter instructions (e.g. "leave shelter, stay nearby") come
            # with various cat values (often 10) but are NOT active threats.
            # Remap to category 13 (all-clear) so they're handled correctly.
            # Early warning ("alerts expected shortly") also arrives as cat 10
            # but should be category 14 (pre-warning) for correct color/decay.
            if is_shelter_instruction(title):
                category = 13
            elif is_early_warning(title):
                category = 14
            else:
                category = raw_cat

            if isinstance(areas, list):
                return [
                    {
                        "data": area,
                        "category": category,
                        "title": title,
                        "desc": parsed.get("desc", ""),
                        "alertDate": "",
                    }
                    for area in areas
                ]
            # data is a single string area name
            return [{
                "data": areas if isinstance(areas, str) else str(areas),
                "category": category,
                "title": title,
                "desc": parsed.get("desc", ""),
                "alertDate": "",
            }]

        return []
    except Exception as e:
        log.error("Oref fetch error (%s): %s", url, e)
        return []


# ── Background Poller ────────────────────────────────────────────────────────

async def backfill_history():
    """Backfill InfluxDB with today's full alert history from Oref on startup."""
    if not influx_write or not http_client:
        return

    log.info("Fetching Oref alert history for backfill...")
    try:
        history = await fetch_oref(HISTORY_URL)

        # Also try alternative history endpoint for additional data
        try:
            alt_history = await fetch_oref(HISTORY_ALT_URL)
            if alt_history:
                # Merge, dedup by alertDate+area
                seen = {(a.get("alertDate", "") + a.get("data", "")) for a in history}
                for a in alt_history:
                    key = a.get("alertDate", "") + a.get("data", "")
                    if key not in seen:
                        history.append(a)
                        seen.add(key)
                log.info("Merged: %d total events from both endpoints", len(history))
        except Exception:
            pass

        if not history:
            log.info("No history data available")
            return

        points = []
        for alert in history:
            alert_date = alert.get("alertDate", "")
            area = alert.get("data", "")
            category = alert.get("category", 0)
            title = alert.get("title", "") or alert.get("category_desc", "")

            # Parse Oref date formats:
            #   "2026-03-10 20:07:58"     (main history)
            #   "2026-03-10T20:08:00"     (alt history)
            try:
                from zoneinfo import ZoneInfo
                for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M"):
                    try:
                        ts = datetime.strptime(alert_date, fmt)
                        ts = ts.replace(tzinfo=ZoneInfo("Asia/Jerusalem"))
                        break
                    except ValueError:
                        continue
                else:
                    continue
            except ImportError:
                continue

            p = (
                Point("alert")
                .tag("area", area)
                .tag("title", title)
                .field("category", category)
                .field("alert_date", alert_date)
                .field("source", "backfill")
                .time(ts, WritePrecision.S)
            )
            points.append(p)

        if points:
            # Write in batches to avoid overwhelming InfluxDB
            batch_size = 500
            for i in range(0, len(points), batch_size):
                influx_write.write(bucket=INFLUX_BUCKET, record=points[i:i + batch_size])
            log.info("Wrote %d historical alerts to InfluxDB", len(points))
        else:
            log.info("No parseable history entries")

    except Exception as e:
        log.error("Backfill error: %s", e)


async def capture_daily_sample():
    """Save one raw Oref response per day as a format reference.

    Captures the raw JSON from each endpoint to data/format-samples/ so we
    have a record of how the API format evolves over time.
    """
    from zoneinfo import ZoneInfo

    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now(ZoneInfo("Asia/Jerusalem")).strftime("%Y-%m-%d")

    sample_file = SAMPLES_DIR / f"sample-{today}.json"
    if sample_file.exists():
        return  # already captured today

    if not http_client:
        return

    log.info("Capturing daily format sample for %s...", today)
    samples = {}
    for name, url in [
        ("alerts", ALERTS_URL),
        ("history", HISTORY_URL),
        ("history_alt", HISTORY_ALT_URL),
    ]:
        try:
            resp = await http_client.get(url, headers=OREF_HEADERS)
            raw = resp.text.strip().lstrip("\ufeff")
            # Store both raw text and parsed structure
            try:
                parsed = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                parsed = None
            samples[name] = {
                "url": url,
                "status_code": resp.status_code,
                "raw_type": type(parsed).__name__ if parsed is not None else "empty",
                "raw_text": raw[:2000] if raw else "",
                "parsed": parsed if isinstance(parsed, (dict, list)) and len(raw) < 50000 else f"[truncated, {len(raw)} chars]",
            }
        except Exception as e:
            samples[name] = {"url": url, "error": str(e)}

    samples["_meta"] = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "date": today,
    }

    sample_file.write_text(json.dumps(samples, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info("Saved format sample to %s", sample_file)


async def poll_loop():
    """Continuously poll Oref alerts and write to InfluxDB.

    Runs every POLL_INTERVAL seconds. Uses a single reusable HTTP client
    with standard browser headers — looks like normal traffic.
    """
    global prev_alert_areas, prev_alert_hash, last_alert_time, last_alert_areas

    log.info("Starting background alert poller (every %ds)", POLL_INTERVAL)

    # Run backfill and daily sample on first iteration
    await backfill_history()
    await capture_daily_sample()

    while True:
        try:
            alerts = await fetch_oref(ALERTS_URL)

            # Merge active test alerts (expire old ones)
            now_epoch = time.time()
            expired = [k for k, v in test_alerts.items() if v["expires"] <= now_epoch]
            for k in expired:
                del test_alerts[k]
            for area, ta in test_alerts.items():
                alerts.append(ta["alert"])

            # -- Alert persistence: presume active for 30 min without all-clear --
            now_ts = time.time()

            # Classify current Oref alerts (exclude test alerts)
            oref_active: dict[str, dict] = {}
            oref_allclear: set[str] = set()
            for a in alerts:
                if a.get("alert_type") == "test":
                    continue
                area = a.get("data", "")
                cat = a.get("category", 0)
                title = a.get("title", "")
                # Category 13 OR shelter instruction titles = all-clear
                if cat == 13 or is_shelter_instruction(title):
                    oref_allclear.add(area)
                elif cat not in (0,) and cat < 15:
                    oref_active[area] = a

            # Track new active areas
            for area, alert_dict in oref_active.items():
                if area not in alert_tracking:
                    alert_tracking[area] = {"start": now_ts, "alert": dict(alert_dict)}

            # Handle areas that dropped from Oref
            for area in list(alert_tracking.keys()):
                if area in oref_active:
                    continue  # still active
                if area in oref_allclear:
                    # Don't let all-clear cancel pre-warnings (cat 14).
                    # All-clear is for the *previous* event; pre-warnings
                    # are about *incoming* alerts and should expire naturally.
                    tracked_cat = alert_tracking[area]["alert"].get("category", 0)
                    if tracked_cat == 14:
                        pa = dict(alert_tracking[area]["alert"])
                        pa["presumed"] = True
                        pa["alertStartTime"] = alert_tracking[area]["start"]
                        if not any(a.get("data") == area and a.get("category") == 14 for a in alerts):
                            alerts.append(pa)
                        continue
                    del alert_tracking[area]  # all-clear received
                elif now_ts - alert_tracking[area]["start"] > (
                    PREWARNING_ACTIVE_DURATION if alert_tracking[area]["alert"].get("category", 0) == 14
                    else PRESUMED_ACTIVE_DURATION
                ):
                    del alert_tracking[area]  # expired after 30 min
                else:
                    # Presumed still active — inject into alerts
                    pa = dict(alert_tracking[area]["alert"])
                    pa["presumed"] = True
                    pa["alertStartTime"] = alert_tracking[area]["start"]
                    if not any(a.get("data") == area for a in alerts):
                        alerts.append(pa)

            # Add start times to all alerts
            for a in alerts:
                area = a.get("data", "")
                if area in alert_tracking and "alertStartTime" not in a:
                    a["alertStartTime"] = alert_tracking[area]["start"]

            cache["alerts"]["data"] = alerts
            cache["alerts"]["timestamp"] = time.time()

            # Determine current areas
            current_areas = {a.get("data", "") for a in alerts}

            # Update enriched state
            active_alerts = [a for a in alerts if a.get("category", 0) not in (13, 0)]
            if active_alerts:
                last_alert_time = time.time()
                last_alert_areas = [a.get("data", "") for a in active_alerts]

            # Only write to InfluxDB when the alert set CHANGES (not every poll cycle).
            # This dramatically reduces InfluxDB write volume during sustained alerts.
            real_alerts = [a for a in alerts if a.get("alert_type") != "test"]
            alert_hash = hashlib.md5(
                json.dumps(sorted(
                    (a.get("data", ""), a.get("category", 0)) for a in real_alerts
                ), ensure_ascii=False).encode()
            ).hexdigest()

            if alert_hash != prev_alert_hash:
                if real_alerts or prev_alert_areas:
                    store_alerts_influx(alerts)
                prev_alert_hash = alert_hash

            prev_alert_areas = current_areas

        except Exception as e:
            log.error("Poller error: %s", e)

        await asyncio.sleep(POLL_INTERVAL)


# ── App Lifecycle ────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client

    global polygonData

    # Startup
    http_client = httpx.AsyncClient(timeout=10, http2=False)
    await init_influx_with_retry()

    # Load polygon data for area counting
    polygon_path = Path(__file__).parent.parent / "research" / "area_to_polygon.json"
    try:
        polygonData = json.loads(polygon_path.read_text(encoding="utf-8"))
        log.info("Loaded %d polygon areas", len(polygonData))
    except Exception as e:
        log.warning("Could not load polygons: %s", e)

    # Load area name translations
    global areaTranslations
    trans_path = Path(__file__).parent.parent / "research" / "area_translations.json"
    try:
        areaTranslations = json.loads(trans_path.read_text(encoding="utf-8"))
        log.info("Loaded %d area translations", len(areaTranslations))
    except Exception as e:
        log.warning("Could not load translations: %s", e)

    poller_task = asyncio.create_task(poll_loop())
    log.info("Red Alert Geodash backend ready")

    yield

    # Shutdown
    poller_task.cancel()
    if http_client:
        await http_client.aclose()
    if influx_client:
        influx_client.close()


app = FastAPI(lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


# ── API Endpoints ────────────────────────────────────────────────────────────

@app.get("/api/alerts")
async def get_alerts():
    """Return current active alerts from in-memory cache (updated by background poller)."""
    return cache["alerts"]["data"]


@app.get("/api/history")
async def get_history():
    """Return today's Oref alert history (cached 15s)."""
    now = time.time()
    if now - cache["history"]["timestamp"] > HISTORY_CACHE_TTL:
        try:
            cache["history"]["data"] = await fetch_oref(HISTORY_URL)
            cache["history"]["timestamp"] = now
        except Exception:
            pass
    return cache["history"]["data"]


@app.get("/api/polygons")
async def get_polygons():
    """Return area polygon data."""
    polygon_path = Path(__file__).parent.parent / "research" / "area_to_polygon.json"
    return FileResponse(polygon_path, media_type="application/json")


@app.get("/api/translations")
async def get_translations():
    """Return Hebrew-to-English area name translations."""
    return areaTranslations


@app.get("/api/area-regions")
async def get_area_regions():
    """Return area-to-region mapping (formal Israeli HFC districts)."""
    region_path = Path(__file__).parent.parent / "research" / "area_regions.json"
    if not region_path.exists():
        return {}
    return FileResponse(region_path, media_type="application/json")


# ── InfluxDB Query Endpoints ────────────────────────────────────────────────

def _sanitize_flux_string(value: str) -> str:
    """Sanitize a string for safe interpolation into Flux queries.

    Prevents Flux injection by stripping characters that could break out
    of a quoted string context.
    """
    if not value:
        return ""
    # Remove any characters that could escape Flux string context
    return re.sub(r'["\\\n\r|>)\]}]', '', value)

@app.get("/api/alert-log")
async def get_alert_log(
    minutes: int = Query(default=60, ge=1, le=10080),
    area: str = Query(default=None),
):
    """Query stored alert events from InfluxDB, deduplicated."""
    if not influx_query:
        return []

    try:
        area_filter = f' |> filter(fn: (r) => r["area"] == "{_sanitize_flux_string(area)}")' if area else ""
        # Use group() to merge all series into one table, then apply a true global limit
        query = f'''
            from(bucket: "{INFLUX_BUCKET}")
                |> range(start: -{minutes}m)
                |> filter(fn: (r) => r["_measurement"] == "alert")
                |> filter(fn: (r) => r["_field"] == "category")
                {area_filter}
                |> group()
                |> sort(columns: ["_time"], desc: true)
                |> limit(n: 5000)
        '''
        tables = influx_query.query(query)
        raw = []
        for table in tables:
            for record in table.records:
                raw.append({
                    "ts": record.get_time().isoformat(),
                    "area": record.values.get("area", ""),
                    "category": record.get_value(),
                    "title": record.values.get("title", ""),
                })

        # Deduplicate: collapse consecutive same area+category within 3-min windows
        # raw is sorted desc by time; process in order and skip near-duplicates
        results = []
        last_seen: dict[str, str] = {}  # "area|category" -> last ts ISO
        for entry in raw:
            key = f"{entry['area']}|{entry['category']}"
            if key in last_seen:
                try:
                    prev_ts = datetime.fromisoformat(last_seen[key])
                    curr_ts = datetime.fromisoformat(entry["ts"])
                    gap = abs((prev_ts - curr_ts).total_seconds())
                    if gap < 180:  # 3 min window (polls every 15s)
                        last_seen[key] = entry["ts"]
                        continue
                except Exception:
                    pass
            last_seen[key] = entry["ts"]
            results.append(entry)

        return results
    except Exception as e:
        log.error("Alert log query error: %s", e)
        return []


@app.get("/api/alert-snapshots")
async def get_alert_snapshots(
    minutes: int = Query(default=30, ge=1, le=10080),
):
    """Query stored snapshots for timeline playback."""
    if not influx_query:
        return []

    try:
        query = f'''
            from(bucket: "{INFLUX_BUCKET}")
                |> range(start: -{minutes}m)
                |> filter(fn: (r) => r["_measurement"] == "snapshot")
                |> filter(fn: (r) => r["_field"] == "payload")
                |> sort(columns: ["_time"], desc: false)
        '''
        tables = influx_query.query(query)
        results = []
        for table in tables:
            for record in table.records:
                payload = record.get_value()
                alerts = json.loads(payload) if payload else []
                if len(alerts) > 0:
                    results.append({
                        "ts": record.get_time().isoformat(),
                        "tsEpoch": record.get_time().timestamp(),
                        "count": len(alerts),
                        "alerts": alerts,
                    })
        return results
    except Exception as e:
        log.error("Snapshot query error: %s", e)
        return []


@app.get("/api/alert-log/stats")
async def get_alert_log_stats():
    """Quick stats on stored alert data."""
    if not influx_query:
        return {"error": "InfluxDB not connected"}

    try:
        # Count events
        q_events = f'''
            from(bucket: "{INFLUX_BUCKET}")
                |> range(start: -30d)
                |> filter(fn: (r) => r["_measurement"] == "alert")
                |> filter(fn: (r) => r["_field"] == "category")
                |> count()
                |> sum()
        '''
        q_snapshots = f'''
            from(bucket: "{INFLUX_BUCKET}")
                |> range(start: -30d)
                |> filter(fn: (r) => r["_measurement"] == "snapshot")
                |> filter(fn: (r) => r["_field"] == "count")
                |> count()
        '''
        q_areas = f'''
            from(bucket: "{INFLUX_BUCKET}")
                |> range(start: -30d)
                |> filter(fn: (r) => r["_measurement"] == "alert")
                |> filter(fn: (r) => r["_field"] == "category")
                |> distinct(column: "area")
                |> count()
        '''

        event_count = 0
        for table in influx_query.query(q_events):
            for record in table.records:
                event_count += record.get_value() or 0

        snapshot_count = 0
        for table in influx_query.query(q_snapshots):
            for record in table.records:
                snapshot_count += record.get_value() or 0

        unique_areas = 0
        for table in influx_query.query(q_areas):
            for record in table.records:
                unique_areas += record.get_value() or 0

        # Enriched calculated fields
        now = time.time()
        time_since_last = None
        if last_alert_time:
            delta = now - last_alert_time
            time_since_last = {
                "seconds": round(delta),
                "minutes": round(delta / 60, 1),
                "hours": round(delta / 3600, 2),
                "human": _human_duration(delta),
            }

        # % of known polygon areas currently under alert
        total_areas = len(polygonData) if polygonData else 0
        active_now = [a for a in cache["alerts"]["data"] if a.get("category", 0) not in (0, 13)]
        active_area_count = len({a.get("data", "") for a in active_now})
        pct_active = round(active_area_count / total_areas * 100, 2) if total_areas > 0 else 0

        return {
            "events": event_count,
            "snapshots": snapshot_count,
            "unique_areas": unique_areas,
            "influx_url": INFLUX_URL,
            "bucket": INFLUX_BUCKET,
            "poller_interval_s": POLL_INTERVAL,
            "cache_age_s": round(now - cache["alerts"]["timestamp"], 1)
            if cache["alerts"]["timestamp"] > 0
            else None,
            "time_since_last_alert": time_since_last,
            "last_alert_areas": last_alert_areas,
            "active_areas_now": active_area_count,
            "total_polygon_areas": total_areas,
            "pct_areas_active": pct_active,
        }
    except Exception as e:
        return {"error": str(e)}


# ── Monitored Areas & Enriched Endpoints ────────────────────────────────────

@app.get("/api/monitored-areas")
async def get_monitored_areas():
    """Return configured monitored areas with their current alert status."""
    current = {a.get("data", ""): a for a in cache["alerts"]["data"]}
    result = {}
    for key, area_name in MONITORED_AREAS.items():
        alert = current.get(area_name)
        result[key] = {
            "area": area_name,
            "active": alert is not None,
            "category": alert.get("category", 0) if alert else None,
            "title": alert.get("title", "") if alert else None,
        }
    return result


@app.get("/api/alerts/enriched")
async def get_alerts_enriched():
    """Return current alerts with calculated fields."""
    alerts = cache["alerts"]["data"]
    now = time.time()

    total_areas = len(polygonData) if polygonData else 0
    active = [a for a in alerts if a.get("category", 0) not in (0, 13)]
    active_area_names = {a.get("data", "") for a in active}

    return {
        "alerts": alerts,
        "timestamp": cache["alerts"]["timestamp"],
        "active_count": len(active_area_names),
        "total_polygon_areas": total_areas,
        "pct_areas_active": round(len(active_area_names) / total_areas * 100, 2) if total_areas > 0 else 0,
        "time_since_last_alert": _human_duration(now - last_alert_time) if last_alert_time else None,
        "last_alert_areas": last_alert_areas,
        "monitored": {
            key: {
                "area": name,
                "active": name in active_area_names,
            }
            for key, name in MONITORED_AREAS.items()
        },
    }


TEST_ALERT_DURATION = 30  # seconds


@app.post("/api/test-alert")
async def send_test_alert(request: Request):
    """Inject a test alert into the live cache. Not stored in InfluxDB.

    Body (all optional):
      area: Hebrew area name (default: first monitored area)
      category: alert category int (default: 1 = rockets)
      title: alert title (default: "ירי רקטות וטילים")
      duration: seconds to keep alert active (default: 30, max: 120)
    """
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    area = body.get("area", MONITORED_AREAS.get("jerusalem", "ירושלים - דרום"))
    category = int(body.get("category", 1))
    title = body.get("title", "ירי רקטות וטילים")
    duration = min(int(body.get("duration", TEST_ALERT_DURATION)), 120)

    alert = {
        "data": area,
        "category": category,
        "title": title,
        "alertDate": datetime.now(timezone.utc).isoformat(),
        "alert_type": "test",
    }

    test_alerts[area] = {
        "alert": alert,
        "expires": time.time() + duration,
    }

    # Immediately inject into cache so next frontend poll picks it up
    current = [a for a in cache["alerts"]["data"] if a.get("data") != area or a.get("alert_type") != "test"]
    current.append(alert)
    cache["alerts"]["data"] = current
    cache["alerts"]["timestamp"] = time.time()

    return {"ok": True, "area": area, "category": category, "expires_in": duration}


@app.delete("/api/test-alert")
async def clear_test_alerts():
    """Clear all active test alerts."""
    test_alerts.clear()
    # Remove test alerts from cache
    cache["alerts"]["data"] = [a for a in cache["alerts"]["data"] if a.get("alert_type") != "test"]
    cache["alerts"]["timestamp"] = time.time()
    return {"ok": True}


@app.get("/api/alert-latencies")
async def get_alert_latencies(
    minutes: int = Query(default=1440, ge=1, le=10080),
    area: str = Query(default=None),
):
    """Compute warning→alert interval and alert→all-clear latency from InfluxDB.

    Walks each area's event timeline and finds:
    - warningInterval: seconds between a cat-14 (pre-warning) and the next red alert (cat 1-12)
    - allClearLatency: seconds between a red alert (cat 1-12) and the next cat-13 (all clear)

    Returns per-area sequences and aggregated stats.
    """
    if not influx_query:
        return {"error": "InfluxDB not connected"}

    RED_CATS = {1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12}

    try:
        area_filter = f' |> filter(fn: (r) => r["area"] == "{_sanitize_flux_string(area)}")' if area else ""
        query = f'''
            from(bucket: "{INFLUX_BUCKET}")
                |> range(start: -{minutes}m)
                |> filter(fn: (r) => r["_measurement"] == "alert")
                |> filter(fn: (r) => r["_field"] == "category")
                {area_filter}
                |> sort(columns: ["_time"], desc: false)
                |> limit(n: 5000)
        '''
        tables = influx_query.query(query)

        # Group events by area
        by_area: dict[str, list] = {}
        for table in tables:
            for record in table.records:
                a = record.values.get("area", "")
                cat = record.get_value()
                ts = record.get_time()
                by_area.setdefault(a, []).append({"ts": ts, "category": cat})

        warning_intervals = []  # seconds from warning to red alert
        all_clear_latencies = []  # seconds from red alert to all-clear
        sequences = []  # detailed per-area sequences

        for area_name, events in by_area.items():
            last_warning_ts = None
            last_red_ts = None

            for ev in events:
                cat = ev["category"]
                ts = ev["ts"]

                if cat == 14:
                    last_warning_ts = ts

                elif cat in RED_CATS:
                    if last_warning_ts:
                        delta = (ts - last_warning_ts).total_seconds()
                        if 0 < delta < 3600:  # sanity: within 1 hour
                            warning_intervals.append(delta)
                            sequences.append({
                                "area": area_name,
                                "type": "warningInterval",
                                "from_ts": last_warning_ts.isoformat(),
                                "to_ts": ts.isoformat(),
                                "seconds": round(delta, 1),
                                "human": _human_duration(delta),
                            })
                        last_warning_ts = None
                    last_red_ts = ts

                elif cat == 13:
                    if last_red_ts:
                        delta = (ts - last_red_ts).total_seconds()
                        if 0 < delta < 3600:
                            all_clear_latencies.append(delta)
                            sequences.append({
                                "area": area_name,
                                "type": "allClearLatency",
                                "from_ts": last_red_ts.isoformat(),
                                "to_ts": ts.isoformat(),
                                "seconds": round(delta, 1),
                                "human": _human_duration(delta),
                            })
                    last_red_ts = None
                    last_warning_ts = None

        # Compute aggregates
        def stats(values):
            if not values:
                return None
            return {
                "count": len(values),
                "min_s": round(min(values), 1),
                "max_s": round(max(values), 1),
                "avg_s": round(sum(values) / len(values), 1),
                "median_s": round(sorted(values)[len(values) // 2], 1),
                "min_human": _human_duration(min(values)),
                "max_human": _human_duration(max(values)),
                "avg_human": _human_duration(sum(values) / len(values)),
            }

        return {
            "period_minutes": minutes,
            "warningInterval": stats(warning_intervals),
            "allClearLatency": stats(all_clear_latencies),
            "sequences": sorted(sequences, key=lambda s: s["from_ts"], reverse=True),
        }
    except Exception as e:
        log.error("Alert latency query error: %s", e)
        return {"error": str(e)}


@app.get("/api/format-samples")
async def get_format_samples():
    """List captured daily format samples."""
    if not SAMPLES_DIR.exists():
        return []
    samples = sorted(SAMPLES_DIR.glob("sample-*.json"), reverse=True)
    return [{"date": f.stem.replace("sample-", ""), "file": f.name} for f in samples[:30]]


@app.get("/api/format-samples/{date}")
async def get_format_sample(date: str):
    """Return a specific daily format sample."""
    # Validate date format to prevent path traversal
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")
    sample_file = SAMPLES_DIR / f"sample-{date}.json"
    if not sample_file.exists():
        raise HTTPException(status_code=404, detail="No sample for this date")
    return json.loads(sample_file.read_text(encoding="utf-8"))


# ── User Settings ───────────────────────────────────────────────────────────

SETTINGS_DIR = Path(__file__).parent.parent / "data" / "user-settings"


@app.get("/api/settings/{user_id}")
async def get_settings(user_id: str):
    """Get user settings (alert area, preferences)."""
    # Validate user_id to prevent path traversal
    if not user_id.isalnum() or len(user_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid user ID")
    settings_file = SETTINGS_DIR / f"{user_id}.json"
    if not settings_file.exists():
        return {"localArea": "ירושלים - דרום", "theme": "dark"}
    return json.loads(settings_file.read_text(encoding="utf-8"))


@app.post("/api/settings/{user_id}")
async def save_settings(user_id: str, request: Request):
    """Save user settings."""
    if not user_id.isalnum() or len(user_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid user ID")
    SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    body = await request.json()
    # Only allow known keys
    allowed = {"localArea", "theme", "audioEnabled", "speechEnabled"}
    settings = {k: v for k, v in body.items() if k in allowed}
    settings_file = SETTINGS_DIR / f"{user_id}.json"
    settings_file.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}


# ── News Feed Proxy ──────────────────────────────────────────────────────────

def _parse_rss(xml_text: str, source: str, limit: int = 15) -> list[dict]:
    root = ET.fromstring(xml_text)
    articles = []
    for item in root.iter("item"):
        title_el = item.find("title")
        link_el = item.find("link")
        pub_date_el = item.find("pubDate")
        if title_el is None or link_el is None:
            continue
        articles.append({
            "title": title_el.text or "",
            "link": link_el.text or "",
            "pubDate": pub_date_el.text if pub_date_el is not None else "",
            "source": source,
        })
        if len(articles) >= limit:
            break
    return articles


@app.get("/api/news")
async def get_news():
    """Return aggregated news feed (cached for 3 minutes)."""
    now = time.time()
    if now - cache["news"]["timestamp"] < NEWS_CACHE_TTL and cache["news"]["data"]:
        return cache["news"]["data"]

    all_articles = []
    if not http_client:
        return cache["news"]["data"] or []
    for feed_url, source in NEWS_FEEDS:
        try:
            resp = await http_client.get(feed_url, follow_redirects=True, timeout=10)
            if resp.status_code != 200:
                continue
            articles = _parse_rss(resp.text, source, limit=10)
            all_articles.extend(articles)
        except Exception:
            continue
    all_articles.sort(key=lambda a: a.get("pubDate", ""), reverse=True)
    result = all_articles[:20]
    cache["news"]["data"] = result
    cache["news"]["timestamp"] = now
    return result


# ── Static File Serving ──────────────────────────────────────────────────────

PUBLIC_DIR = Path(__file__).parent.parent / "www"


@app.get("/")
async def serve_root():
    """Serve dashboard directly — no login needed on local deployment."""
    html = (PUBLIC_DIR / "dashboard.html").read_text(encoding="utf-8")
    return HTMLResponse(html, headers={"Cache-Control": "no-cache"})


@app.get("/dashboard")
@app.get("/dashboard.html")
async def serve_dashboard():
    html = (PUBLIC_DIR / "dashboard.html").read_text(encoding="utf-8")
    return HTMLResponse(html)


@app.get("/history")
async def serve_history():
    html = (PUBLIC_DIR / "history.html").read_text(encoding="utf-8")
    return HTMLResponse(html, headers={"Cache-Control": "no-cache"})


@app.get("/news")
async def serve_news():
    html = (PUBLIC_DIR / "news.html").read_text(encoding="utf-8")
    return HTMLResponse(html)


@app.get("/tablet")
async def serve_tablet():
    html = (PUBLIC_DIR / "tablet.html").read_text(encoding="utf-8")
    return HTMLResponse(html)


@app.get("/tv")
async def serve_tv():
    html = (PUBLIC_DIR / "tv.html").read_text(encoding="utf-8")
    return HTMLResponse(html)


@app.get("/alerts-news")
async def serve_alerts_news():
    html = (PUBLIC_DIR / "alerts-news.html").read_text(encoding="utf-8")
    return HTMLResponse(html, headers={"Cache-Control": "no-cache"})


@app.get("/map")
async def serve_map():
    html = (PUBLIC_DIR / "map.html").read_text(encoding="utf-8")
    return HTMLResponse(html, headers={"Cache-Control": "no-cache"})


@app.get("/mobile")
async def serve_mobile():
    html = (PUBLIC_DIR / "mobile.html").read_text(encoding="utf-8")
    return HTMLResponse(html, headers={"Cache-Control": "no-cache"})


@app.get("/settings")
async def serve_settings():
    html = (PUBLIC_DIR / "settings.html").read_text(encoding="utf-8")
    return HTMLResponse(html, headers={"Cache-Control": "no-cache"})


# Auth endpoints return success for local deployment (no auth needed)
@app.get("/api/check-auth")
async def check_auth():
    return {"authenticated": True}


@app.get("/api/health")
async def health_check():
    """Health check endpoint for Docker and monitoring."""
    now = time.time()
    influx_ok = False
    if influx_client:
        try:
            health = influx_client.health()
            influx_ok = health.status == "pass"
        except Exception:
            pass

    cache_age = round(now - cache["alerts"]["timestamp"], 1) if cache["alerts"]["timestamp"] > 0 else None

    return {
        "status": "ok" if influx_ok else "degraded",
        "influxdb": "connected" if influx_ok else "disconnected",
        "poller_interval_s": POLL_INTERVAL,
        "cache_age_s": cache_age,
        "polygon_areas": len(polygonData),
    }


@app.get("/api/version")
async def get_version():
    """Return a hash of key static files so clients can detect new deployments."""
    import hashlib
    h = hashlib.md5()
    for fname in ["static/components.js", "static/dashboard.js", "dashboard.html"]:
        fpath = PUBLIC_DIR / fname
        if fpath.is_file():
            h.update(fpath.read_bytes())
    return {"version": h.hexdigest()[:12]}


@app.get("/static/{file_path:path}")
async def serve_static(file_path: str):
    full_path = PUBLIC_DIR / "static" / file_path
    if not full_path.is_file() or not full_path.resolve().is_relative_to(PUBLIC_DIR.resolve()):
        raise HTTPException(status_code=404)
    suffix = full_path.suffix
    media_types = {
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
    }
    # Binary files (images)
    if suffix in (".png", ".jpg", ".jpeg", ".svg", ".ico", ".gif", ".webp"):
        return FileResponse(full_path, media_type=media_types.get(suffix, "application/octet-stream"))
    content = full_path.read_text(encoding="utf-8")
    return Response(
        content=content,
        media_type=media_types.get(suffix, "text/plain"),
        headers={"Cache-Control": "no-cache, must-revalidate"},
    )
