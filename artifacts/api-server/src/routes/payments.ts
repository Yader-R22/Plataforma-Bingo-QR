import { Router } from "express";
import { db, cardsTable, gamesTable, feedItemsTable, usersTable, activatorCardSalesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendPushToUser } from "../lib/push";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const PAYMENT_API_URL = "https://api.pay.enlazzo.com/functions/v1";

const router = Router();

router.get("/:checkoutId/status", requireAuth, async (req: AuthRequest, res) => {
  const transactionId = String(req.params.checkoutId);
  if (!transactionId) { res.status(400).json({ error: "ID inválido" }); return; }

  // Fast-path: cards already activated in DB
  const cards = await db.select().from(cardsTable)
    .where(eq(cardsTable.checkoutId, transactionId))
    .limit(1);

  if (cards.length) {
    if (cards[0].paymentStatus === "paid") {
      res.json({ checkout_id: transactionId, status: "completed" });
      return;
    }
    if (cards[0].paymentStatus === "failed") {
      res.json({ checkout_id: transactionId, status: "failed" });
      return;
    }
  }

  // Cards still pending — ask the payment API
  try {
    const response = await fetch(`${PAYMENT_API_URL}/check-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId }),
    });

    if (!response.ok) {
      res.json({ checkout_id: transactionId, status: "pending" });
      return;
    }

    const data = await response.json() as { status: string };

    if (data.status === "COMPLETED") {
      // Activate cards
      await db.update(cardsTable)
        .set({ paymentStatus: "paid", status: "active" })
        .where(eq(cardsTable.checkoutId, transactionId));

      // Mark activator sale as paid (if this was an activator purchase)
      await db.update(activatorCardSalesTable)
        .set({ status: "paid" })
        .where(eq(activatorCardSalesTable.checkoutId, transactionId));

      // Update participant count
      const paidCards = await db.select().from(cardsTable)
        .where(eq(cardsTable.checkoutId, transactionId));

      if (paidCards.length) {
        const gameId = paidCards[0].gameId;
        const game = await db.select().from(gamesTable)
          .where(eq(gamesTable.id, gameId))
          .limit(1);

        if (game.length) {
          await db.update(gamesTable)
            .set({ participantCount: game[0].participantCount + paidCards.length })
            .where(eq(gamesTable.id, gameId));
        }

        // Feed item
        const buyer = await db.select().from(usersTable)
          .where(eq(usersTable.id, paidCards[0].userId))
          .limit(1);

        if (buyer.length && game.length) {
          const u = buyer[0];
          const bparts = u.fullName.trim().split(/\s+/);
          const bName = bparts.length >= 2 ? `${bparts[0]} ${bparts[1]}` : bparts[0];
          const bDept = u.department ?? "";
          const gameTitle = game[0].title;
          const cardCount = paidCards.length;
          db.insert(feedItemsTable).values({
            type: "card_purchase",
            message: `${bName}${bDept ? ` de ${bDept}` : ""} compró ${cardCount} cartón${cardCount !== 1 ? "es" : ""} en ${gameTitle}`,
            userDisplayName: bName,
          }).catch(() => {});
        }
      }

      // Notify the buyer their cards are ready
      if (paidCards.length && paidCards[0].userId) {
        const count = paidCards.length;
        const gameId2 = paidCards[0].gameId;
        const gameRow = await db.select({ title: gamesTable.title }).from(gamesTable).where(eq(gamesTable.id, gameId2)).limit(1);
        const gameTitle = gameRow[0]?.title ?? "el bingo";
        sendPushToUser(paidCards[0].userId, {
          title: "🎟️ ¡Pago confirmado!",
          body: `Tu${count > 1 ? "s" : ""} ${count} cartón${count !== 1 ? "es" : ""} para ${gameTitle} ${count !== 1 ? "están listos" : "está listo"}. ¡Buena suerte!`,
          url: `/my-cards`,
        }).catch(() => {});
      }
      req.log.info({ transactionId }, "Payment confirmed via polling, cards activated");
      res.json({ checkout_id: transactionId, status: "completed" });
      return;
    }

    res.json({ checkout_id: transactionId, status: "pending" });
  } catch (err) {
    req.log.error({ err }, "check-status error");
    res.json({ checkout_id: transactionId, status: "pending" });
  }
});

export { router as paymentsRouter };
