/*
 * Red Alert Geodash — service worker
 *
 * Strategy:
 *  - Static app shell (HTML pages, JS, CSS, icons): stale-while-revalidate so
 *    the app loads instantly and the next visit picks up new code.
 *  - API requests (/api/*): NETWORK ONLY. We never cache alert data — showing
 *    stale rocket-alert state would be dangerous. If the network is down the
 *    request fails and the UI displays its existing in-memory state.
 *  - Cross-origin tile requests (Google/OSM map tiles): pass through, the
 *    browser handles its own HTTP caching.
 *
 * Cache version is bumped whenever this file changes; old caches are purged
 * on activate.
 */

const CACHE_VERSION = "geodash-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

const SHELL_URLS = [
  "/",
  "/dashboard",
  "/mobile",
  "/map",
  "/history",
  "/news",
  "/static/components.js",
  "/static/dashboard.js",
  "/static/mobile.js",
  "/static/map.js",
  "/static/history.js",
  "/static/news.js",
  "/static/i18n.js",
  "/static/icon.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Use {cache: "reload"} so we don't pull from HTTP cache during install.
      .then((cache) =>
        Promise.all(
          SHELL_URLS.map((url) =>
            fetch(url, { cache: "reload" })
              .then((resp) => (resp.ok ? cache.put(url, resp) : null))
              .catch(() => null),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("geodash-") && k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Same-origin only — leave cross-origin (map tiles, fonts, etc.) untouched.
  if (url.origin !== self.location.origin) return;

  // Never cache live alert / settings / health data.
  if (url.pathname.startsWith("/api/")) {
    return; // default: go to network
  }

  // Stale-while-revalidate for the app shell.
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((resp) => {
          if (resp && resp.ok) cache.put(req, resp.clone());
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
