/* sw.js — Safe PWA Service Worker (GitHub Pages + iOS friendly) */

const CACHE_VERSION = "2026-01-15-safe-1";
const STATIC_CACHE = `planner-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `planner-runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

function isNavigationRequest(req) {
  return req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");
}

async function safePrecache() {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.allSettled(
    PRECACHE_URLS.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: "reload" }));
      } catch (_) {}
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await safePrecache();
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => {
        if (k.startsWith("planner-") && k !== STATIC_CACHE && k !== RUNTIME_CACHE) {
          return caches.delete(k);
        }
      })
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (!isSameOrigin(req.url)) return;

  if (isNavigationRequest(req)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put("./index.html", fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        return (await caches.match("./index.html")) ||
          new Response("Offline", { headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) {
      event.waitUntil((async () => {
        try {
          const res = await fetch(req);
          if (res.ok && res.type !== "opaque") {
            const cache = await caches.open(RUNTIME_CACHE);
            await cache.put(req, res.clone());
          }
        } catch {}
      })());
      return cached;
    }

    try {
      const res = await fetch(req);
      if (res.ok && res.type !== "opaque") {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(req, res.clone());
      }
      return res;
    } catch {
      return new Response("", { status: 504 });
    }
  })());
});
