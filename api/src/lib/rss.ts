/**
 * RSS feed poller — polls configured feeds on a schedule and caches articles in memory.
 * Consolidated from the standalone rss-cache service.
 */

import { XMLParser } from "fast-xml-parser";

interface Article {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
}

interface FeedStatus {
  status: "ok" | "error";
  count?: number;
  error?: string;
}

interface RssCache {
  articles: Article[];
  lastUpdated: string | null;
  feedStatus: Record<string, FeedStatus>;
}

const cache: RssCache = {
  articles: [],
  lastUpdated: null,
  feedStatus: {},
};

// Parse feed config from env: RSS_FEED_1_URL / RSS_FEED_1_NAME (up to 10)
function getFeeds(): Array<{ url: string; name: string }> {
  const feeds: Array<{ url: string; name: string }> = [];
  for (let i = 1; i <= 10; i++) {
    const url = process.env[`RSS_FEED_${i}_URL`]?.trim();
    const name = process.env[`RSS_FEED_${i}_NAME`]?.trim() || `Feed ${i}`;
    if (url) feeds.push({ url, name });
  }
  if (feeds.length === 0) {
    feeds.push(
      { url: "https://www.timesofisrael.com/feed/", name: "Times of Israel" },
      { url: "https://www.jns.org/feed/", name: "JNS" }
    );
  }
  return feeds;
}

const POLL_INTERVAL = parseInt(process.env.RSS_POLL_INTERVAL || "300", 10) * 1000;
const MAX_ARTICLES = parseInt(process.env.RSS_MAX_ARTICLES || "30", 10);
const FEEDS = getFeeds();

function parseRss(xml: string, source: string, limit = 15): Article[] {
  const parser = new XMLParser({ ignoreAttributes: true });
  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item;
  if (!items) return [];

  const list = Array.isArray(items) ? items : [items];
  return list.slice(0, limit).map((item: Record<string, string>) => ({
    title: (item.title || "").toString().trim(),
    link: (item.link || "").toString().trim(),
    pubDate: (item.pubDate || "").toString().trim(),
    description: (item.description || "").toString().slice(0, 500),
    source,
  })).filter((a: Article) => a.title && a.link);
}

async function pollFeeds(): Promise<void> {
  const allArticles: Article[] = [];

  for (const feed of FEEDS) {
    try {
      const resp = await fetch(feed.url, {
        signal: AbortSignal.timeout(15_000),
        headers: { "User-Agent": "RedAlert-RSS/1.0" },
      });
      if (resp.ok) {
        const xml = await resp.text();
        const articles = parseRss(xml, feed.name);
        allArticles.push(...articles);
        cache.feedStatus[feed.name] = { status: "ok", count: articles.length };
      } else {
        cache.feedStatus[feed.name] = { status: "error", error: `HTTP ${resp.status}` };
      }
    } catch (e) {
      cache.feedStatus[feed.name] = { status: "error", error: (e as Error).name };
    }
  }

  allArticles.sort((a, b) => (b.pubDate || "").localeCompare(a.pubDate || ""));
  cache.articles = allArticles.slice(0, MAX_ARTICLES);
  cache.lastUpdated = new Date().toISOString();
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startRssPoller(): void {
  console.log(`[rss] Starting poller (${FEEDS.length} feeds, ${POLL_INTERVAL / 1000}s interval)`);
  // Initial poll
  pollFeeds().catch((e) => console.error("[rss] Initial poll error:", e));
  // Schedule recurring polls
  intervalId = setInterval(() => {
    pollFeeds().catch((e) => console.error("[rss] Poll error:", e));
  }, POLL_INTERVAL);
}

export function stopRssPoller(): void {
  if (intervalId) clearInterval(intervalId);
}

export function getArticles(limit = 20): Article[] {
  return cache.articles.slice(0, Math.min(limit, 100));
}

export function getRssStatus() {
  return {
    articles: cache.articles,
    lastUpdated: cache.lastUpdated,
    feedStatus: cache.feedStatus,
    feedCount: FEEDS.length,
    pollIntervalSeconds: POLL_INTERVAL / 1000,
  };
}
