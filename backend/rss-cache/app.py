"""RSS Cache Service — polls news feeds on a schedule, serves cached results."""

import os
import time
import asyncio
import logging
from contextlib import asynccontextmanager
from defusedxml import ElementTree as ET
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, Query

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("redalert.rss-cache")

# Configurable feeds via numbered env vars: RSS_FEED_1_URL / RSS_FEED_1_NAME (up to 10)
# Falls back to defaults used by Geodash
FEEDS: list[tuple[str, str]] = []
for i in range(1, 11):
    url = os.getenv(f"RSS_FEED_{i}_URL", "")
    name = os.getenv(f"RSS_FEED_{i}_NAME", f"Feed {i}")
    if url:
        FEEDS.append((url.strip(), name.strip()))

# Legacy format: comma-separated "url|label" pairs (deprecated, still supported)
if not FEEDS:
    legacy = os.getenv("RSS_FEEDS", "")
    if legacy:
        for entry in legacy.split(","):
            entry = entry.strip()
            if "|" in entry:
                url, label = entry.rsplit("|", 1)
                FEEDS.append((url.strip(), label.strip()))

# Defaults if nothing configured
if not FEEDS:
    FEEDS = [
        ("https://www.timesofisrael.com/feed/", "Times of Israel"),
        ("https://www.jns.org/feed/", "JNS"),
    ]

POLL_INTERVAL = int(os.getenv("RSS_POLL_INTERVAL", "300"))  # 5 minutes
MAX_ARTICLES = int(os.getenv("RSS_MAX_ARTICLES", "30"))

# In-memory cache
cache = {
    "articles": [],
    "last_updated": None,
    "feed_status": {},
}

http_client: httpx.AsyncClient | None = None


def _parse_rss(xml_text: str, source: str, limit: int = 15) -> list[dict]:
    """Parse RSS XML into article dicts. Uses defusedxml to prevent XXE attacks."""
    root = ET.fromstring(xml_text)
    articles = []
    for item in root.iter("item"):
        title = item.findtext("title", "").strip()
        link = item.findtext("link", "").strip()
        pub_date = item.findtext("pubDate", "").strip()
        description = item.findtext("description", "").strip()
        if title and link:
            articles.append({
                "title": title,
                "link": link,
                "pubDate": pub_date,
                "description": description[:500] if description else "",
                "source": source,
            })
        if len(articles) >= limit:
            break
    return articles


async def poll_feeds():
    """Background task: fetch and cache all feeds."""
    global http_client
    while True:
        if not http_client:
            await asyncio.sleep(1)
            continue

        all_articles = []
        for feed_url, source in FEEDS:
            try:
                resp = await http_client.get(feed_url, follow_redirects=True, timeout=15)
                if resp.status_code == 200:
                    articles = _parse_rss(resp.text, source, limit=15)
                    all_articles.extend(articles)
                    cache["feed_status"][source] = {"status": "ok", "count": len(articles)}
                else:
                    cache["feed_status"][source] = {"status": "error", "code": resp.status_code}
            except Exception as e:
                cache["feed_status"][source] = {"status": "error", "error": type(e).__name__}

        all_articles.sort(key=lambda a: a.get("pubDate", ""), reverse=True)
        cache["articles"] = all_articles[:MAX_ARTICLES]
        cache["last_updated"] = datetime.now(timezone.utc).isoformat()

        await asyncio.sleep(POLL_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client
    http_client = httpx.AsyncClient()
    task = asyncio.create_task(poll_feeds())
    log.info("RSS cache started (%d feeds, %ds interval)", len(FEEDS), POLL_INTERVAL)
    yield
    task.cancel()
    if http_client:
        await http_client.aclose()
    log.info("RSS cache shut down")


app = FastAPI(title="Red Alert RSS Cache", lifespan=lifespan)


@app.get("/api/news")
async def get_news(limit: int = Query(20, ge=1, le=100)):
    """Return cached news articles. Drop-in replacement for Geodash /api/news."""
    return cache["articles"][:limit]


@app.get("/api/news/full")
async def get_news_full():
    """Return full cache state including metadata."""
    return {
        "articles": cache["articles"],
        "last_updated": cache["last_updated"],
        "feed_status": cache["feed_status"],
        "feed_count": len(FEEDS),
        "poll_interval_seconds": POLL_INTERVAL,
    }


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "rss-cache",
        "last_updated": cache["last_updated"],
        "article_count": len(cache["articles"]),
    }
