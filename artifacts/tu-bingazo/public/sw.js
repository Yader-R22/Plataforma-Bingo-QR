const BASE_CACHE = "elbingote";
let currentCacheName = "elbingote-v1";
let lastKnownVersion = 1;
let lastVersionCheck = 0;
const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // recheck at most every 5 minutes

async function resolveCacheName() {
  try {
    const r = await fetch("/api/pwa/cache-version", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      const v = d.version ?? 1;
      lastKnownVersion = v;
      lastVersionCheck = Date.now();
      return `${BASE_CACHE}-v${v}`;
    }
  } catch {}
  return `${BASE_CACHE}-v${lastKnownVersion}`;
}

async function applyVersionIfChanged() {
  const now = Date.now();
  if (now - lastVersionCheck < VERSION_CHECK_INTERVAL) return; // throttle
  try {
    const r = await fetch("/api/pwa/cache-version", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    const v = d.version ?? 1;
    lastVersionCheck = now;
    if (v === lastKnownVersion) return; // no change
    lastKnownVersion = v;
    const newName = `${BASE_CACHE}-v${v}`;
    if (newName === currentCacheName) return;
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith(BASE_CACHE) && k !== newName).map((k) => caches.delete(k))
    );
    currentCacheName = newName;
  } catch {}
}

function offlinePage(noInternet) {
  const emoji = noInternet ? "📵" : "🔧";
  const title = noInternet ? "Sin conexión a Internet" : "Actualización en proceso";
  const msg = noInternet
    ? "Parece que no tienes Internet. Conéctate a una red y vuelve a intentarlo."
    : "El servidor se está actualizando. Vuelve a intentarlo en unos momentos.";
  return new Response(
    `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f14;color:#f1f1f5;display:flex;align-items:center;justify-content:center;min-height:100dvh;padding:24px;text-align:center}
    .card{background:#1a1a24;border:1px solid #2a2a3a;border-radius:20px;padding:40px 32px;max-width:360px;width:100%}
    .emoji{font-size:56px;margin-bottom:16px}
    h1{font-size:20px;font-weight:700;margin-bottom:10px;color:#fff}
    p{font-size:14px;color:#9090a8;line-height:1.6;margin-bottom:24px}
    button{background:#7c3aed;color:#fff;border:none;border-radius:12px;padding:12px 28px;font-size:15px;font-weight:600;cursor:pointer;width:100%}
    button:active{opacity:.85}
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <h1>${title}</h1>
    <p>${msg}</p>
    <button onclick="location.reload()">Reintentar</button>
  </div>
</body>
</html>`,
    {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
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
        keys
          .filter((k) => (k.startsWith(BASE_CACHE) || k.startsWith("tu-bingazo")) && k !== name)
          .map((k) => caches.delete(k))
      );
      self.clients.claim();
    })
  );
});

// Triggered by the admin "Forzar caché" button via postMessage
self.addEventListener("message", async (e) => {
  if (e.data?.type === "FORCE_CACHE_UPDATE") {
    lastVersionCheck = 0; // bypass throttle
    await applyVersionIfChanged();
  }
});

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener("push", (e) => {
  let data = { title: "El Bingote", body: "Tienes una nueva notificación", url: "/", icon: "", image: "" };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch {}

  const notifOptions = {
    body: data.body,
    icon: data.icon || "/notif-icon.png",
    badge: "/badge-96.png",
    data: { url: data.url ?? "/" },
    vibrate: [200, 100, 200],
  };
  if (data.image) notifOptions.image = data.image;

  e.waitUntil(self.registration.showNotification(data.title, notifOptions));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(url);
      } else {
        self.clients.openWindow(url);
      }
    })
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  // API calls: always go to network, return error JSON if offline
  if (e.request.url.includes("/api/")) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(
          JSON.stringify({ error: self.navigator.onLine ? "Servidor en mantenimiento" : "Sin conexión a Internet" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    return;
  }

  // Navigation requests (HTML): check version in background (throttled), then network-first
  if (e.request.mode === "navigate") {
    e.respondWith(
      (async () => {
        applyVersionIfChanged().catch(() => {}); // non-blocking version check
        try {
          const res = await fetch(e.request);
          if (res.ok) {
            caches.open(currentCacheName).then((c) => c.put(e.request, res.clone()));
          }
          return res;
        } catch {
          const cached = await caches.match(e.request);
          return cached ?? offlinePage(!self.navigator.onLine);
        }
      })()
    );
    return;
  }

  // All other assets: network-first, cache as fallback
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
          (cached) => cached ?? offlinePage(!self.navigator.onLine)
        )
      )
  );
});
