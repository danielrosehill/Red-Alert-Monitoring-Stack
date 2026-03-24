"""RSS Cache Service — polls news feeds on a schedule, serves cached results."""

import os
import time
import asyncio
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI

app = FastAPI(title="Red Alert RSS Cache")

# Configurable feeds via env (comma-separated "url|label" pairs)
# Falls back to defaults used by Geodash
DEFAULT_FEEDS = "https://www.timesofisrael.com/feed/|Times of Israel,https://www.jns.org/feed/|JNS"
FEEDS_RAW = os.getenv("RSS_FEEDS", DEFAULT_FEEDS)
FEEDS = []
for entry in FEEDS_RAW.split(","):
    entry = entry.strip()
    if "|" in entry:
        url, label = entry.rsplit("|", 1)
        FEEDS.append((url.strip(), label.strip()))

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
    """Parse RSS XML into article dicts."""
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


@app.on_event("startup")
async def startup():
    global http_client
    http_client = httpx.AsyncClient()
    asyncio.create_task(poll_feeds())


@app.on_event("shutdown")
async def shutdown():
    global http_client
    if http_client:
        await http_client.aclose()


@app.get("/api/news")
async def get_news(limit: int = 20):
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
