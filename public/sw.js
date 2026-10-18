const APP_BASE = new URL("./", self.location.href);
const CACHE_PREFIX = `jot-shell:${encodeURIComponent(APP_BASE.pathname)}:`;
const CACHE_NAME = `${CACHE_PREFIX}v7`;
const APP_SHELL = ["./", "./manifest.webmanifest", "./icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const current = await caches.open(CACHE_NAME);
    for (const name of await caches.keys()) {
      if (name === CACHE_NAME) continue;
      if (/^jot-shell-v\d+$/.test(name)) {
        // Legacy cache names were shared across installations. Copy only this
        // path's entries; never delete the shared cache or another app's keys.
        const legacy = await caches.open(name);
        for (const request of await legacy.keys()) {
          const url = new URL(request.url);
          if (url.origin !== APP_BASE.origin || !url.pathname.startsWith(APP_BASE.pathname)) continue;
          if (await current.match(request)) continue;
          const response = await legacy.match(request);
          if (response) await current.put(request, response);
        }
      } else if (name.startsWith(CACHE_PREFIX)) {
        await caches.delete(name);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => undefined));
      }
      return response;
    }).catch(async (error) => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;

      if (event.request.mode === "navigate") {
        const shell = await cache.match(APP_BASE.href);
        if (shell) return shell;
      }

      return new Response("Network unavailable and no cached response exists.", {
        status: 504,
        statusText: "Gateway Timeout",
        headers: {
          "Content-Type": "text/plain; charset=UTF-8"
        }
      });
    })
  );
});
