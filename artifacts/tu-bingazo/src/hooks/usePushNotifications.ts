import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "./useAuth";

const PUSH_DISMISSED_KEY = "push_permission_dismissed";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function getVapidKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/vapid-public-key");
    if (!res.ok) return null;
    const data = await res.json() as { key: string };
    return data.key;
  } catch {
    return null;
  }
}

async function subscribe(vapidKey: string, token: string): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as string,
  });
  const json = sub.toJSON();
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    }),
  });
  return sub;
}

async function unsubscribe(sub: PushSubscription, token: string): Promise<void> {
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint }),
  });
}

export type PushStatus = "unsupported" | "loading" | "denied" | "subscribed" | "unsubscribed";

export function usePushNotifications() {
  const { token, user } = useAuthStore();
  const [status, setStatus] = useState<PushStatus>("loading");
  const [loading, setLoading] = useState(false);
  const [currentSub, setCurrentSub] = useState<PushSubscription | null>(null);

  const supported = typeof window !== "undefined" && "PushManager" in window && "serviceWorker" in navigator;

  useEffect(() => {
    if (!supported || !user || !token) { setStatus("unsupported"); return; }
    (async () => {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const perm = Notification.permission;
      if (perm === "denied") { setStatus("denied"); return; }
      if (existing) { setCurrentSub(existing); setStatus("subscribed"); return; }
      if (perm === "granted") {
        // Permiso ya otorgado pero sin suscripción activa — reintentar en segundo plano
        try {
          const vapidKey = await getVapidKey();
          if (vapidKey) {
            const sub = await subscribe(vapidKey, token);
            if (sub) { setCurrentSub(sub); setStatus("subscribed"); return; }
          }
        } catch { /* ignorar, se reintentará la próxima vez */ }
      }
      setStatus("unsubscribed");
    })();
  }, [supported, user, token]);

  const enable = useCallback(async () => {
    if (!token || loading) return;
    setLoading(true);
    try {
      const vapidKey = await getVapidKey();
      if (!vapidKey) return;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setStatus("denied"); return; }
      const sub = await subscribe(vapidKey, token);
      if (sub) { setCurrentSub(sub); setStatus("subscribed"); }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [token, loading]);

  const disable = useCallback(async () => {
    if (!currentSub || !token || loading) return;
    setLoading(true);
    try {
      await unsubscribe(currentSub, token);
      setCurrentSub(null);
      setStatus("unsubscribed");
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [currentSub, token, loading]);

  const isDismissed = () => {
    const d = localStorage.getItem(PUSH_DISMISSED_KEY);
    if (!d) return false;
    return Date.now() - parseInt(d) < 7 * 24 * 60 * 60 * 1000; // 7 días
  };

  const dismiss = () => localStorage.setItem(PUSH_DISMISSED_KEY, String(Date.now()));

  return { status, loading, enable, disable, isDismissed, dismiss };
}
