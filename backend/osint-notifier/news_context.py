"""Fetch recent headlines from RSS feeds for AI report context.

Provides real-time news context to the intel and sitrep generators
so they can reference actual reporting rather than relying solely
on training data.
"""

import logging
import os
import xml.etree.ElementTree as ET

import httpx

log = logging.getLogger("osint-notifier")

# Comma-separated RSS feed URLs
RSS_FEEDS = [
    url.strip() for url in
    os.environ.get(
        "RSS_FEEDS",
        "https://www.timesofisrael.com/feed/,https://www.jns.org/feed/"
    ).split(",")
    if url.strip()
]

RSS_MAX_ITEMS = int(os.environ.get("RSS_MAX_ITEMS", "15"))


async def fetch_headlines() -> str:
    """Fetch recent headlines from configured RSS feeds.

    Returns a plain-text summary suitable for injecting into LLM prompts.
    Returns empty string on failure.
    """
    headlines: list[str] = []

    async with httpx.AsyncClient() as client:
        for feed_url in RSS_FEEDS:
            try:
                resp = await client.get(feed_url, timeout=10, headers={
                    "User-Agent": "Red-Alert-OSINT-Notifier/1.0",
                })
                resp.raise_for_status()
                root = ET.fromstring(resp.text)

                # Standard RSS 2.0
                for item in root.findall(".//item")[:RSS_MAX_ITEMS]:
                    title = item.findtext("title", "").strip()
                    if title:
                        headlines.append(f"- {title}")

            except Exception as exc:
                log.debug("RSS fetch failed (%s): %s", feed_url, exc)

    if not headlines:
        return ""

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for h in headlines:
        if h not in seen:
            seen.add(h)
            unique.append(h)

    return "\n".join(unique[:RSS_MAX_ITEMS])
