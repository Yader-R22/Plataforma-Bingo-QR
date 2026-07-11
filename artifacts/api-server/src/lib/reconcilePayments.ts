import { db, cardsTable, gamesTable, feedItemsTable, usersTable } from "@workspace/db";
import { eq, and, isNotNull, gte, lt } from "drizzle-orm";
import { logger } from "./logger";

const PAYMENT_API_URL = "https://yhzzqeogsakeeknjlwtw.supabase.co/functions/v1";
const RECONCILE_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 10_000;

// Solo revisar transacciones creadas en las últimas 24 horas.
// Los pagos más antiguos casi nunca se completan y generan requests HTTP innecesarios.
const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Expirar automáticamente cartones pendientes con más de 48 horas sin pago.
const EXPIRE_AFTER_MS = 48 * 60 * 60 * 1000;

async function activateCards(transactionId: string): Promise<void> {
  await db.update(cardsTable)
    .set({ paymentStatus: "paid", status: "active" })
    .where(eq(cardsTable.checkoutId, transactionId));

  const paidCards = await db.select().from(cardsTable)
    .where(eq(cardsTable.checkoutId, transactionId));

  if (!paidCards.length) return;

  const gameId = paidCards[0].gameId;
  const game = await db.select().from(gamesTable)
    .where(eq(gamesTable.id, gameId)).limit(1);

  if (game.length) {
    await db.update(gamesTable)
      .set({ participantCount: game[0].participantCount + paidCards.length })
      .where(eq(gamesTable.id, gameId));
  }

  const buyer = await db.select().from(usersTable)
    .where(eq(usersTable.id, paidCards[0].userId)).limit(1);

  if (buyer.length && game.length) {
    const u = buyer[0];
    const bparts = u.fullName.trim().split(/\s+/);
    const bName = bparts.length >= 2 ? `${bparts[0]} ${bparts[1]}` : bparts[0];
    const bDept = u.department ?? "";
    const cardCount = paidCards.length;
    db.insert(feedItemsTable).values({
      type: "card_purchase",
      message: `${bName}${bDept ? ` de ${bDept}` : ""} compró ${cardCount} cartón${cardCount !== 1 ? "es" : ""} en ${game[0].title}`,
      userDisplayName: bName,
    }).catch(() => {});
  }

  logger.info({ transactionId, cards: paidCards.length }, "Reconciliation: cards activated");
}

async function expireOldPendingCards(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - EXPIRE_AFTER_MS);
    const result = await db.update(cardsTable)
      .set({ paymentStatus: "failed", status: "expired" })
      .where(
        and(
          eq(cardsTable.paymentStatus, "pending"),
          lt(cardsTable.createdAt, cutoff),
        )
      );
    if ((result.rowCount ?? 0) > 0) {
      logger.info({ count: result.rowCount }, "Reconciliation: expired old pending cards (>48h)");
    }
  } catch (err) {
    logger.warn({ err }, "Reconciliation: could not expire old pending cards");
  }
}

async function reconcile(): Promise<void> {
  try {
    // Solo revisar transacciones de las últimas 24 horas
    const cutoff = new Date(Date.now() - PENDING_MAX_AGE_MS);
    const pending = await db.selectDistinct({ checkoutId: cardsTable.checkoutId })
      .from(cardsTable)
      .where(
        and(
          eq(cardsTable.paymentStatus, "pending"),
          isNotNull(cardsTable.checkoutId),
          gte(cardsTable.createdAt, cutoff),
        )
      );

    if (!pending.length) return;

    logger.debug({ count: pending.length }, "Reconciliation: checking pending transactions");

    for (const { checkoutId } of pending) {
      if (!checkoutId) continue;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        let res: Response;
        try {
          res = await fetch(`${PAYMENT_API_URL}/check-status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transactionId: checkoutId }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }
        if (!res.ok) continue;
        const data = await res.json() as { status: string };
        if (data.status === "COMPLETED") {
          await activateCards(checkoutId);
        }
      } catch (err: unknown) {
        const name = (err as { name?: string }).name;
        if (name === "AbortError") {
          logger.warn({ checkoutId }, "Reconciliation: check-status timed out");
        } else {
          logger.warn({ err, checkoutId }, "Reconciliation: check-status failed");
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Reconciliation job error");
  }
}

export function startReconciliationJob(): void {
  // Limpiar cartones viejos pendientes al arrancar y luego cada hora
  void expireOldPendingCards();
  const expireJob = setInterval(() => void expireOldPendingCards(), 60 * 60 * 1000);
  expireJob.unref();

  // Reconciliar pagos recientes cada 30 s
  const initTimer = setTimeout(() => void reconcile(), 5_000);
  initTimer.unref();
  const job = setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
  job.unref();

  logger.info({ intervalMs: RECONCILE_INTERVAL_MS, maxAgeH: 24 }, "Payment reconciliation job started");
}
