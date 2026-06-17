const BASE_CACHE = "tu-bingazo";
let currentCacheName = "tu-bingazo-v1";

async function resolveCacheName() {
  try {
    const r = await fetch("/api/pwa/cache-version", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      return `${BASE_CACHE}-v${d.version ?? 1}`;
    }
  } catch {}
  return `${BASE_CACHE}-v1`;
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    resolveCacheName().then((name) => {
      currentCacheName = name;
      return caches.open(name).then((c) =>
        c.addAll(["/", "/favicon.svg"]).catch(() => {})
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    resolveCacheName().then(async (name) => {
      currentCacheName = name;
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith(BASE_CACHE) && k !== name).map((k) => caches.delete(k))
      );
      self.clients.claim();
    })
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  if (e.request.url.includes("/api/")) {
    e.respondWith(
      fetch(e.request).catch(() => new Response("Offline", { status: 503 }))
    );
    return;
  }

  // Network-first: always try network, fall back to cache when offline
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          caches.open(currentCacheName).then((c) => c.put(e.request, res.clone()));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then(
          (cached) => cached ?? new Response("Offline", { status: 503 })
        )
      )
  );
});
