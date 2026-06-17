import { db, cardsTable, gamesTable, feedItemsTable, usersTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { logger } from "./logger";
const PAYMENT_API_URL = "https://yhzzqeogsakeeknjlwtw.supabase.co/functions/v1";
const RECONCILE_INTERVAL_MS = 30_000;

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

async function reconcile(): Promise<void> {
  try {
    // Get all unique pending transaction IDs
    const pending = await db.selectDistinct({ checkoutId: cardsTable.checkoutId })
      .from(cardsTable)
      .where(
        and(
          eq(cardsTable.paymentStatus, "pending"),
          isNotNull(cardsTable.checkoutId),
        )
      );

    if (!pending.length) return;

    logger.debug({ count: pending.length }, "Reconciliation: checking pending transactions");

    for (const { checkoutId } of pending) {
      if (!checkoutId) continue;
      try {
        const res = await fetch(`${PAYMENT_API_URL}/check-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId: checkoutId }),
        });
        if (!res.ok) continue;
        const data = await res.json() as { status: string };
        if (data.status === "COMPLETED") {
          await activateCards(checkoutId);
        }
      } catch (err) {
        logger.warn({ err, checkoutId }, "Reconciliation: check-status failed for transaction");
      }
    }
  } catch (err) {
    logger.error({ err }, "Reconciliation job error");
  }
}

export function startReconciliationJob(): void {
  // Run once shortly after boot, then on a fixed interval
  setTimeout(() => void reconcile(), 5_000);
  setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
  logger.info({ intervalMs: RECONCILE_INTERVAL_MS }, "Payment reconciliation job started");
}
