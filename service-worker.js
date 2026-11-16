const CACHE_NAME = "st-vault-shell-v11-4";
// v11.3：React 等依赖来自 esm.sh，单独缓存，换版本时不删除，断网也能打开
const LIB_CACHE = "st-vault-libs-v1";
const LIB_PREFIXES = ["https://esm.sh/"];
const INDEX_URL = new URL("./index.html", self.registration.scope).href;
const LOCAL_ASSETS = [
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

const isLib = (url) => LIB_PREFIXES.some((prefix) => url.startsWith(prefix));

async function cacheLib(request) {
  const cache = await caches.open(LIB_CACHE);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(LOCAL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME && !key.startsWith("st-vault-libs")).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "cache-libs" || !Array.isArray(data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(LIB_CACHE);
    for (const url of data.urls) {
      if (typeof url !== "string" || !isLib(url)) continue;
      try {
        if (await cache.match(url, { ignoreVary: true })) continue;
        const response = await fetch(url, { mode: "cors", credentials: "omit" });
        if (response.ok) await cache.put(url, response);
      } catch {}
    }
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request, { cache: "no-store" });
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(INDEX_URL, response.clone());
          }
          return response;
        } catch {
          return await caches.match(INDEX_URL) || Response.error();
        }
      })()
    );
    return;
  }

  if (isLib(event.request.url)) {
    event.respondWith(cacheLib(event.request));
    return;
  }

  if (requestUrl.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      })()
    );
  }
});
