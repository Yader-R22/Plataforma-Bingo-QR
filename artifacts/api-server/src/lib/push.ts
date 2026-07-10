import webpush from "web-push";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

let initialized = false;

function init() {
  if (initialized) return;
  const pub = process.env["VAPID_PUBLIC_KEY"];
  const priv = process.env["VAPID_PRIVATE_KEY"];
  const email = process.env["VAPID_EMAIL"] ?? "mailto:admin@elbingote.com";
  if (!pub || !priv) {
    logger.warn("VAPID keys no configuradas — push notifications deshabilitadas");
    return;
  }
  webpush.setVapidDetails(email, pub, priv);
  initialized = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

async function send(endpoint: string, p256dh: string, auth: string, payload: PushPayload): Promise<boolean> {
  init();
  if (!initialized) return false;
  try {
    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      JSON.stringify(payload),
      { TTL: 86400 }
    );
    return true;
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      // Subscription expiró — limpiar
      await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint)).catch(() => {});
    } else {
      logger.warn({ err, endpoint: endpoint.slice(0, 40) }, "push send error");
    }
    return false;
  }
}

export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  const subs = await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
  await Promise.allSettled(subs.map((s) => send(s.endpoint, s.p256dh, s.auth, payload)));
}

export async function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<void> {
  if (!userIds.length) return;
  const { inArray } = await import("drizzle-orm");
  const subs = await db.select().from(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.userId, userIds));
  await Promise.allSettled(subs.map((s) => send(s.endpoint, s.p256dh, s.auth, payload)));
}

export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const subs = await db.select().from(pushSubscriptionsTable);
  const results = await Promise.allSettled(subs.map((s) => send(s.endpoint, s.p256dh, s.auth, payload)));
  const sent = results.filter((r) => r.status === "fulfilled" && r.value).length;
  const failed = results.length - sent;
  return { sent, failed };
}
