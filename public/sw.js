const APP_BASE = new URL("./", self.location.href);
const CACHE_PREFIX = `jot-shell:${encodeURIComponent(APP_BASE.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}v9`;
const APP_SHELL = ["./", "./manifest.webmanifest", "./icons/icon.svg"];

function isAppDocument(url) {
  return url.origin === APP_BASE.origin && (url.pathname === APP_BASE.pathname || url.pathname === `${APP_BASE.pathname}index.html`);
}

function isPublicPath(url) {
  if (url.origin !== APP_BASE.origin || !url.pathname.startsWith(APP_BASE.pathname)) return false;
  const path = url.pathname.slice(APP_BASE.pathname.length);
  return path === "" || path === "index.html" || path === "manifest.webmanifest" ||
    /^icons\/[a-zA-Z0-9_.-]+\.(svg|png|ico|webp)$/.test(path) ||
    /^_build\/assets\/[a-zA-Z0-9_.-]+\.(js|css|woff2?|ttf|otf|svg|png|webp|jpe?g|gif)$/.test(path);
}

function publicCacheKey(request) {
  const url = new URL(request.url);
  return request.method === "GET" && !request.headers.has("Authorization") && !url.search &&
    !url.username && !url.password && isPublicPath(url) ? url.href : null;
}

function isPublicResponse(response, key) {
  return response.ok && !response.redirected &&
    (!response.url || response.url === key) &&
    !/(?:^|,)\s*(?:private|no-store)\b/i.test(response.headers.get("Cache-Control") ?? "") &&
    response.headers.get("Vary") !== "*";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(APP_SHELL.map(async (path) => {
      const request = new Request(new URL(path, APP_BASE), { credentials: "omit", cache: "no-store" });
      const response = await fetch(request);
      if (isPublicResponse(response, request.url)) await cache.put(request.url, response);
    }))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const current = await caches.open(CACHE_NAME);
    for (const name of await caches.keys()) {
      if (name === CACHE_NAME) continue;
      const legacyShared = /^jot-shell-v\d+$/.test(name);
      if (!legacyShared && !name.startsWith(CACHE_PREFIX)) continue;
      const previous = await caches.open(name);
      for (const request of await previous.keys()) {
        const url = new URL(request.url);
        if (legacyShared) {
          if (url.origin !== APP_BASE.origin || !url.pathname.startsWith(APP_BASE.pathname)) continue;
          // Legacy names were shared. A path prefix alone cannot distinguish
          // this app from a nested installation; only known shell/asset paths
          // have unambiguous ownership, even below a non-root base path.
          if (!isPublicPath(url)) continue;
        }
        const key = publicCacheKey(request);
        const response = key === null ? null : await previous.match(request);
        // HTML must come from this worker's fresh install, never an older
        // document that lacks the release's current security policy.
        if (key !== null && !isAppDocument(url) && response && isPublicResponse(response, key) && !(await current.match(key))) {
          await current.put(key, response);
        }
        if (legacyShared) await previous.delete(request);
      }
      if (!legacyShared) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.headers.has("Authorization")) return;
  const requestUrl = new URL(event.request.url);
  const key = publicCacheKey(event.request);
  // Query-bearing app navigations may use the public shell offline, but their
  // original URL and response never become cache entries.
  if (key === null && !(event.request.mode === "navigate" && isAppDocument(requestUrl))) return;

  event.respondWith(
    fetch(key === null ? event.request : new Request(event.request, { credentials: "omit" })).then((response) => {
      if (key !== null && isPublicResponse(response, key)) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(key, copy)).catch(() => undefined));
      }
      return response;
    }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = key === null ? null : await cache.match(key);
      if (cached) return cached;
      if (event.request.mode === "navigate" && isAppDocument(requestUrl)) {
        const shell = await cache.match(APP_BASE.href);
        if (shell) return shell;
      }
      return new Response("Network unavailable and no cached response exists.", {
        status: 504,
        statusText: "Gateway Timeout",
        headers: { "Content-Type": "text/plain; charset=UTF-8" }
      });
    })
  );
});
