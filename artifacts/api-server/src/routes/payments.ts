import { Router } from "express";
import crypto from "crypto";
import { db, cardsTable, gamesTable, feedItemsTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { CreateCheckoutBody, GetPaymentStatusParams } from "@workspace/api-zod";

const PAGOSYA_BASE_URL = process.env.PAGOSYA_BASE_URL || "https://nbjwpakpimrqfocsxkda.supabase.co/functions/v1";
const PAGOSYA_SECRET_KEY = process.env.PAGOSYA_SECRET_KEY || "";

const router = Router();

router.post("/create-checkout", requireAuth, async (req: AuthRequest, res) => {
  const parsed = CreateCheckoutBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }

  const { amount, order_id, card_ids } = parsed.data;

  try {
    const response = await fetch(`${PAGOSYA_BASE_URL}/create-external-checkout`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PAGOSYA_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: "BOB",
        order_id,
        success_url: `${process.env.APP_URL || ""}/pago/success`,
        cancel_url: `${process.env.APP_URL || ""}/pago/cancel`,
        metadata: { card_ids },
        expiration_minutes: 30,
      }),
    });
    const data = await response.json() as { checkout_id: string; checkout_url: string; expires_at: string };
    res.status(201).json({
      checkout_id: data.checkout_id,
      checkout_url: data.checkout_url,
      amount,
      currency: "BOB",
      expires_at: data.expires_at,
    });
  } catch (err) {
    req.log.error({ err }, "PagosYa create-checkout error");
    res.status(502).json({ error: "Error al crear sesión de pago" });
  }
});

// Webhook — must use raw body for HMAC verification
router.post("/webhook", async (req, res) => {
  const signature = req.headers["x-pagosya-signature"] as string;
  const rawBody = JSON.stringify(req.body);

  if (signature && PAGOSYA_SECRET_KEY) {
    const expected = crypto.createHmac("sha256", PAGOSYA_SECRET_KEY).update(rawBody).digest("hex");
    if (signature !== expected) {
      req.log.warn("Invalid webhook signature");
      res.status(401).json({ error: "Firma inválida" });
      return;
    }
  }

  const event = req.body;
  if (event.event === "checkout.completed") {
    const checkoutId = event.data?.checkout_id;
    if (checkoutId) {
      // Activate all cards with this checkout ID
      await db.update(cardsTable)
        .set({ paymentStatus: "paid", status: "active" })
        .where(eq(cardsTable.checkoutId, checkoutId));

      // Increment participant count for the game + feed event
      const paidCards = await db.select().from(cardsTable).where(eq(cardsTable.checkoutId, checkoutId));
      if (paidCards.length) {
        const gameId = paidCards[0].gameId;
        const game = await db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).limit(1);
        if (game.length) {
          await db.update(gamesTable)
            .set({ participantCount: game[0].participantCount + paidCards.length })
            .where(eq(gamesTable.id, gameId));
        }

        // Feed: compra de cartones confirmada por QR
        const buyer = await db.select().from(usersTable).where(eq(usersTable.id, paidCards[0].userId)).limit(1);
        if (buyer.length) {
          const u = buyer[0];
          const bparts = u.fullName.trim().split(/\s+/);
          const bName = bparts.length >= 2 ? `${bparts[0]} ${bparts[1]}` : bparts[0];
          const bDept = u.department ?? "";
          const gameTitle = game.length ? game[0].title : `juego #${gameId}`;
          const cardCount = paidCards.length;
          db.insert(feedItemsTable).values({
            type: "card_purchase",
            message: `${bName}${bDept ? ` de ${bDept}` : ""} compró ${cardCount} cartón${cardCount !== 1 ? "es" : ""} en ${gameTitle}`,
            userDisplayName: bName,
          }).catch(() => {});
        }
      }
      req.log.info({ checkoutId }, "Payment confirmed, cards activated");
    }
  }

  res.json({ received: true });
});

router.get("/:checkoutId/status", requireAuth, async (req: AuthRequest, res) => {
  const p = GetPaymentStatusParams.safeParse({ checkoutId: req.params.checkoutId });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const cards = await db.select().from(cardsTable).where(eq(cardsTable.checkoutId, p.data.checkoutId)).limit(1);
  if (!cards.length) {
    res.json({ checkout_id: p.data.checkoutId, status: "pending", amount: null, completed_at: null });
    return;
  }

  const card = cards[0];
  const status = card.paymentStatus === "paid" ? "completed" : card.paymentStatus === "failed" ? "failed" : "pending";
  res.json({
    checkout_id: p.data.checkoutId,
    status,
    amount: null,
    completed_at: null,
  });
});

export { router as paymentsRouter };
