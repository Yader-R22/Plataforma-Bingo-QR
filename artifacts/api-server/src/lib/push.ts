import webpush from "web-push";
import { db, pushSubscriptionsTable, usersTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
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
  image?: string;
}

export interface PushJobStatus {
  total: number;
  sent: number;
  failed: number;
  done: boolean;
  startedAt: Date;
}

const jobStore = new Map<string, PushJobStatus>();

export function getJobStatus(jobId: string): PushJobStatus | undefined {
  return jobStore.get(jobId);
}

async function send(endpoint: string, p256dh: string, auth: string, payload: PushPayload): Promise<boolean> {
  init();
  if (!initialized) return false;
  try {
    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      JSON.stringify(payload),
      { TTL: 86400, urgency: "high" }
    );
    return true;
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
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

export async function sendPushToUserByCi(ci: string, payload: PushPayload): Promise<{ found: boolean; sent: number }> {
  const users = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.ci, ci)).limit(1);
  if (!users.length) return { found: false, sent: 0 };
  const userId = users[0].id;
  const subs = await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
  if (!subs.length) return { found: true, sent: 0 };
  const results = await Promise.allSettled(subs.map((s) => send(s.endpoint, s.p256dh, s.auth, payload)));
  const sent = results.filter((r) => r.status === "fulfilled" && r.value).length;
  return { found: true, sent };
}

export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const subs = await db.select().from(pushSubscriptionsTable);
  let sent = 0; let failed = 0;
  const SMALL_BATCH = 20;
  for (let i = 0; i < subs.length; i += SMALL_BATCH) {
    const batch = subs.slice(i, i + SMALL_BATCH);
    const results = await Promise.allSettled(batch.map((s) => send(s.endpoint, s.p256dh, s.auth, payload)));
    sent  += results.filter((r) => r.status === "fulfilled" && r.value).length;
    failed += results.filter((r) => r.status !== "fulfilled" || !r.value).length;
  }
  return { sent, failed };
}

const BATCH = 100;

export async function startBroadcastJob(
  jobId: string,
  payload: PushPayload,
  department?: string
): Promise<number> {
  let totalCount: number;
  if (department) {
    const [row] = await db
      .select({ value: count() })
      .from(pushSubscriptionsTable)
      .innerJoin(usersTable, eq(pushSubscriptionsTable.userId, usersTable.id))
      .where(eq(usersTable.department, department));
    totalCount = Number(row.value);
  } else {
    const [row] = await db.select({ value: count() }).from(pushSubscriptionsTable);
    totalCount = Number(row.value);
  }

  jobStore.set(jobId, { total: totalCount, sent: 0, failed: 0, done: false, startedAt: new Date() });
  setTimeout(() => jobStore.delete(jobId), 7200_000);

  setImmediate(async () => {
    try {
      let currentOffset = 0;
      while (true) {
        type SubRow = { endpoint: string; p256dh: string; auth: string };
        let subs: SubRow[];

        if (department) {
          subs = await db
            .select({
              endpoint: pushSubscriptionsTable.endpoint,
              p256dh: pushSubscriptionsTable.p256dh,
              auth: pushSubscriptionsTable.auth,
            })
            .from(pushSubscriptionsTable)
            .innerJoin(usersTable, eq(pushSubscriptionsTable.userId, usersTable.id))
            .where(eq(usersTable.department, department))
            .limit(BATCH)
            .offset(currentOffset);
        } else {
          subs = await db
            .select({
              endpoint: pushSubscriptionsTable.endpoint,
              p256dh: pushSubscriptionsTable.p256dh,
              auth: pushSubscriptionsTable.auth,
            })
            .from(pushSubscriptionsTable)
            .limit(BATCH)
            .offset(currentOffset);
        }

        if (!subs.length) break;

        const results = await Promise.allSettled(
          subs.map((s) => send(s.endpoint, s.p256dh, s.auth, payload))
        );
        const job = jobStore.get(jobId);
        if (job) {
          job.sent += results.filter((r) => r.status === "fulfilled" && r.value).length;
          job.failed += results.filter((r) => r.status !== "fulfilled" || !r.value).length;
        }
        currentOffset += subs.length;
        if (subs.length < BATCH) break;
      }
    } catch (err) {
      logger.error({ err, jobId }, "broadcast job failed");
    } finally {
      const job = jobStore.get(jobId);
      if (job) job.done = true;
    }
  });

  return totalCount;
}
