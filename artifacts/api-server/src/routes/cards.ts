import { Router } from "express";
import { db, cardsTable, gamesTable, winnersTable, usersTable, auditLogsTable, feedItemsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import {
  ListMyCardsQueryParams,
  BuyCardBody,
  GetCardParams,
  MarkNumbersParams,
  MarkNumbersBody,
  ClaimBingoParams,
  ClaimBingoBody,
} from "@workspace/api-zod";

const PAGOSYA_BASE_URL = process.env.PAGOSYA_BASE_URL || "https://nbjwpakpimrqfocsxkda.supabase.co/functions/v1";
const PAGOSYA_SECRET_KEY = process.env.PAGOSYA_SECRET_KEY || "";

const router = Router();

function generateBingoCard(): number[][] {
  const card: number[][] = [];
  const ranges = [
    [1, 15], [16, 30], [31, 45], [46, 60], [61, 75],
  ];
  for (let col = 0; col < 5; col++) {
    const [min, max] = ranges[col];
    const pool = Array.from({ length: max - min + 1 }, (_, i) => i + min);
    const picked: number[] = [];
    for (let row = 0; row < 5; row++) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    card.push(picked);
  }
  // Transpose: card[row][col]
  const transposed: number[][] = [];
  for (let row = 0; row < 5; row++) {
    transposed.push([]);
    for (let col = 0; col < 5; col++) {
      transposed[row].push(card[col][row]);
    }
  }
  // Free space center
  transposed[2][2] = 0;
  return transposed;
}

function formatCard(card: typeof cardsTable.$inferSelect) {
  return {
    id: card.id,
    game_id: card.gameId,
    user_id: card.userId,
    numbers: card.numbers,
    marked_numbers: card.markedNumbers ?? [],
    status: card.status,
    payment_status: card.paymentStatus,
    checkout_id: card.checkoutId ?? null,
    created_at: card.createdAt,
  };
}

// Validate a bingo win strictly against the numbers actually called by the
// game. The free space (0) always counts as a hit. Client-supplied marks are
// NOT trusted for validity — a card wins if and only if the winning pattern's
// cells all hold numbers that were called (this is the real bingo rule and is
// immune to client tampering or polling lag).
function validateBingo(card: typeof cardsTable.$inferSelect, gameMode: string, calledNumbers: number[]): boolean {
  const matrix = card.numbers as number[][];
  const calledSet = new Set(calledNumbers);

  const isHit = (row: number, col: number) => {
    const n = matrix[row][col];
    return n === 0 || calledSet.has(n);
  };

  if (gameMode === "full_card") {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (!isHit(r, c)) return false;
      }
    }
    return true;
  }
  if (gameMode === "horizontal" || gameMode === "quina") {
    for (let r = 0; r < 5; r++) {
      if ([0, 1, 2, 3, 4].every(c => isHit(r, c))) return true;
    }
  }
  if (gameMode === "vertical") {
    for (let c = 0; c < 5; c++) {
      if ([0, 1, 2, 3, 4].every(r => isHit(r, c))) return true;
    }
  }
  if (gameMode === "diagonal") {
    if ([0, 1, 2, 3, 4].every(i => isHit(i, i))) return true;
    if ([0, 1, 2, 3, 4].every(i => isHit(i, 4 - i))) return true;
  }
  return false;
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const query = ListMyCardsQueryParams.safeParse(req.query);
  const conditions = [eq(cardsTable.userId, req.userId!)];
  if (query.success && query.data.game_id) {
    conditions.push(eq(cardsTable.gameId, query.data.game_id));
  }
  const cards = await db.select().from(cardsTable).where(and(...conditions));
  res.json(cards.map(formatCard));
});

router.post("/buy", requireAuth, async (req: AuthRequest, res) => {
  const parsed = BuyCardBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }

  const { game_id, quantity } = parsed.data;
  const payWithBalance = (req.body as any).pay_with_balance === true;

  const games = await db.select().from(gamesTable).where(eq(gamesTable.id, game_id)).limit(1);
  if (!games.length) { res.status(404).json({ error: "Juego no encontrado" }); return; }

  const game = games[0];
  if (game.status === "finished") { res.status(400).json({ error: "El juego ya finalizó" }); return; }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!users.length) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  const user = users[0];

  const totalAmount = parseFloat(game.cardPrice) * quantity;

  // --- Pay with wallet balance ---
  if (payWithBalance) {
    // Spendable funds = balance MINUS funds already reserved by pending
    // withdrawals. Pending withdrawals are debited later at admin mark-paid, so
    // they must not be re-spent here or the balance could go negative.
    const currentBalance = parseFloat(user.balance as unknown as string);
    const pendingRows = await db.execute(
      sql`SELECT COALESCE(SUM(amount), 0) AS total FROM withdrawals WHERE user_id = ${req.userId!} AND status = 'pending'`
    );
    const pendingAmount = parseFloat((pendingRows.rows[0]?.total as string | undefined) ?? "0");
    const available = currentBalance - pendingAmount;
    if (available < totalAmount) {
      res.status(400).json({ error: `Saldo insuficiente. Disponible: Bs ${available.toFixed(2)} (saldo Bs ${currentBalance.toFixed(2)} menos retiros pendientes Bs ${pendingAmount.toFixed(2)})` });
      return;
    }
    // Debit + card creation run in ONE transaction so the user is never
    // charged without receiving all cards. We lock the user row FOR UPDATE
    // FIRST, then re-read balance and pending withdrawals under the lock. This
    // avoids a READ COMMITTED TOCTOU: a concurrent withdrawal could commit a
    // new pending row after this tx's snapshot but before its write, so a bare
    // conditional UPDATE with a SUM subquery could still pass against stale
    // pending. Locking first forces a fresh read of committed pending.
    const newCards: (typeof cardsTable.$inferSelect)[] = [];
    let insufficient = false;
    await db.transaction(async (tx) => {
      const locked = await tx.execute(
        sql`SELECT balance FROM users WHERE id = ${req.userId!} FOR UPDATE`
      );
      const lockedBalance = parseFloat((locked.rows[0]?.balance as string | undefined) ?? "0");
      const pend = await tx.execute(
        sql`SELECT COALESCE(SUM(amount), 0) AS total FROM withdrawals WHERE user_id = ${req.userId!} AND status = 'pending'`
      );
      const lockedPending = parseFloat((pend.rows[0]?.total as string | undefined) ?? "0");
      if (lockedBalance - lockedPending < totalAmount) { insufficient = true; return; }
      await tx.execute(
        sql`UPDATE users SET balance = balance - ${totalAmount} WHERE id = ${req.userId!}`
      );
      for (let i = 0; i < quantity; i++) {
        const numbers = generateBingoCard();
        const [card] = await tx.insert(cardsTable).values({
          gameId: game_id,
          userId: req.userId!,
          numbers,
          paymentStatus: "paid",
          status: "active",
        }).returning();
        newCards.push(card);
      }
      await tx.insert(auditLogsTable).values({
        action: "card_purchase_wallet",
        userId: req.userId,
        gameId: game_id,
        details: { card_ids: newCards.map(c => c.id), amount: totalAmount, method: "wallet" },
        ipAddress: req.ip,
      });
    });
    if (insufficient) {
      res.status(400).json({ error: "Saldo insuficiente. Intenta de nuevo." });
      return;
    }

    // Feed: compra con saldo de billetera
    if (newCards.length) {
      const buyer = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
      if (buyer.length) {
        const u = buyer[0];
        const bparts = u.fullName.trim().split(/\s+/);
        const bName = bparts.length >= 2 ? `${bparts[0]} ${bparts[1]}` : bparts[0];
        const bDept = u.department ?? "";
        db.insert(feedItemsTable).values({
          type: "card_purchase",
          message: `${bName}${bDept ? ` de ${bDept}` : ""} compró ${newCards.length} cartón${newCards.length !== 1 ? "es" : ""} en ${game.title}`,
          userDisplayName: bName,
        }).catch(() => {});
      }
    }

    res.status(201).json({ cards: newCards.map(formatCard), paid_with_balance: true });
    return;
  }

  const orderId = `BINGO-${game_id}-${req.userId}-${Date.now()}`;

  // Create cards in pending_payment state
  const newCards = [];
  for (let i = 0; i < quantity; i++) {
    const numbers = generateBingoCard();
    const [card] = await db.insert(cardsTable).values({
      gameId: game_id,
      userId: req.userId!,
      numbers,
      paymentStatus: "pending",
      status: "pending_payment",
    }).returning();
    newCards.push(card);
  }

  const cardIds = newCards.map(c => c.id);

  // Call PagosYa API
  let checkoutUrl = `https://www.pagosya.com.bo/demo/${orderId}`;
  let checkoutId = `checkout-${orderId}`;
  try {
    const response = await fetch(`${PAGOSYA_BASE_URL}/create-external-checkout`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PAGOSYA_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: totalAmount,
        currency: "BOB",
        order_id: orderId,
        success_url: `${process.env.APP_URL || "http://localhost"}/pago/${checkoutId}?status=success`,
        cancel_url: `${process.env.APP_URL || "http://localhost"}/pago/${checkoutId}?status=cancel`,
        customer: {
          name: user.fullName,
          phone: user.phone,
        },
        metadata: { card_ids: cardIds, game_id },
        expiration_minutes: 30,
      }),
    });
    if (response.ok) {
      const data = await response.json() as { checkout_id: string; checkout_url: string };
      checkoutId = data.checkout_id;
      checkoutUrl = data.checkout_url;
    }
  } catch (err) {
    req.log.error({ err }, "PagosYa API error, using fallback checkout");
  }

  // Update cards with checkout ID
  for (const card of newCards) {
    await db.update(cardsTable).set({ checkoutId }).where(eq(cardsTable.id, card.id));
  }

  // Log audit
  await db.insert(auditLogsTable).values({
    action: "card_purchase",
    userId: req.userId,
    gameId: game_id,
    details: { card_ids: cardIds, amount: totalAmount, order_id: orderId, checkout_id: checkoutId },
    ipAddress: req.ip,
  });

  const updatedCards = await db.select().from(cardsTable).where(and(...cardIds.map(id => eq(cardsTable.id, id))));

  res.status(201).json({
    cards: updatedCards.map(formatCard),
    checkout_url: checkoutUrl,
    checkout_id: checkoutId,
  });
});

router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const p = GetCardParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const cards = await db.select().from(cardsTable).where(and(eq(cardsTable.id, p.data.id), eq(cardsTable.userId, req.userId!))).limit(1);
  if (!cards.length) { res.status(404).json({ error: "Cartón no encontrado" }); return; }
  res.json(formatCard(cards[0]));
});

router.patch("/:id/mark", requireAuth, async (req: AuthRequest, res) => {
  const p = MarkNumbersParams.safeParse({ id: parseInt(String(req.params.id)) });
  const b = MarkNumbersBody.safeParse(req.body);
  if (!p.success || !b.success) { res.status(400).json({ error: "Datos inválidos" }); return; }
  const cards = await db.select().from(cardsTable).where(and(eq(cardsTable.id, p.data.id), eq(cardsTable.userId, req.userId!))).limit(1);
  if (!cards.length) { res.status(404).json({ error: "Cartón no encontrado" }); return; }
  const [updated] = await db.update(cardsTable).set({ markedNumbers: b.data.marked_numbers }).where(eq(cardsTable.id, p.data.id)).returning();
  res.json(formatCard(updated));
});

router.post("/:id/claim-bingo", requireAuth, async (req: AuthRequest, res) => {
  const p = ClaimBingoParams.safeParse({ id: parseInt(String(req.params.id)) });
  const b = ClaimBingoBody.safeParse(req.body);
  if (!p.success || !b.success) { res.status(400).json({ error: "Datos inválidos" }); return; }

  const claimTimestamp = Date.now();

  const cards = await db.select().from(cardsTable)
    .where(and(eq(cardsTable.id, p.data.id), eq(cardsTable.userId, req.userId!)))
    .limit(1);
  if (!cards.length) { res.status(404).json({ error: "Cartón no encontrado" }); return; }
  const card = cards[0];

  if (card.status !== "active") {
    res.status(400).json({ valid: false, message: "El cartón no está activo para este juego" });
    return;
  }
  if (card.paymentStatus !== "paid") {
    res.status(400).json({ valid: false, message: "El pago de este cartón no fue confirmado" });
    return;
  }

  const games = await db.select().from(gamesTable).where(eq(gamesTable.id, card.gameId)).limit(1);
  if (!games.length) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  const game = games[0];

  if (game.status !== "active") {
    res.json({ valid: false, message: "El juego no está activo en este momento" });
    return;
  }

  const calledNumbers = game.calledNumbers ?? [];
  const isValid = validateBingo(card, game.gameMode, calledNumbers);

  if (!isValid) {
    res.json({ valid: false, message: "Los números marcados no coinciden con el patrón ganador. ¡Sigue jugando!" });
    return;
  }

  // Window-expired check: if the player already had a valid bingo BEFORE the
  // last number was called, they missed their claim window. They must claim on
  // the exact number that completes their pattern — not after the next bolillo.
  if (calledNumbers.length > 1) {
    const alreadyWonBefore = validateBingo(card, game.gameMode, calledNumbers.slice(0, -1));
    if (alreadyWonBefore) {
      res.json({
        valid: false,
        expired: true,
        message: "¡Tiempo expirado! Ya cantaron el siguiente bolillo después de tu BINGO. Debes reclamar antes de que se cante el siguiente número.",
      });
      return;
    }
  }

  // Dedupe, max-winners cap, place assignment, winner insert and audit all run
  // inside ONE transaction that locks the game row (SELECT ... FOR UPDATE).
  // This serializes concurrent valid claims so two players cannot both pass the
  // cap check or collide on the same place. The DB unique constraint on
  // winners.card_id is the final guard against a same-card double claim.
  let winner: typeof winnersTable.$inferSelect | undefined;
  let dupCard = false;
  let capReached = false;
  let notActive = false;
  try {
    await db.transaction(async (tx) => {
      // Lock the game row, then RE-READ status inside the lock: the game could
      // have flipped to finished between the precheck and here, and we must not
      // admit a late winner after the game closed.
      const lockedRows = await tx.execute(
        sql`SELECT status FROM games WHERE id = ${game.id} FOR UPDATE`
      );
      if ((lockedRows.rows[0]?.status as string | undefined) !== "active") { notActive = true; return; }

      const cardWinner = await tx.select().from(winnersTable)
        .where(eq(winnersTable.cardId, card.id)).limit(1);
      if (cardWinner.length) { dupCard = true; return; }

      // Count ALL existing claims (pending + validated): pending claims are
      // already server-verified wins, so they occupy a slot and set the order.
      const existingWinners = await tx.select().from(winnersTable)
        .where(eq(winnersTable.gameId, game.id));
      if (existingWinners.length >= game.maxWinners) { capReached = true; return; }

      const prizes = (game.prizes as Array<{ place: number; amount: number }>) ?? [];
      const nextPlace = existingWinners.length + 1;
      const prize = prizes.find(p => p.place === nextPlace);
      const prizeAmount = prize?.amount ?? parseFloat(game.prizeAmount);

      [winner] = await tx.insert(winnersTable).values({
        gameId: game.id,
        userId: req.userId!,
        cardId: card.id,
        place: nextPlace,
        prizeAmount: String(prizeAmount),
        claimedAtMs: String(b.data.claimed_at_ms),
        validated: false,
      }).returning();

      await tx.insert(auditLogsTable).values({
        action: "bingo_claim",
        userId: req.userId,
        gameId: game.id,
        cardId: card.id,
        details: {
          claimed_at_ms: b.data.claimed_at_ms,
          server_timestamp_ms: claimTimestamp,
          marked_numbers: b.data.marked_numbers,
          called_numbers: calledNumbers,
          prize_amount: prizeAmount,
          place: nextPlace,
        },
        ipAddress: req.ip,
      });
    });
  } catch (err) {
    req.log.warn({ err, cardId: card.id }, "Reclamo de bingo duplicado o en conflicto bloqueado");
    res.json({ valid: false, message: "Ya reclamaste BINGO con este cartón. El administrador validará tu premio." });
    return;
  }

  if (notActive) {
    res.json({ valid: false, message: "El juego ya no está activo. Tu reclamo no pudo ser registrado." });
    return;
  }
  if (dupCard) {
    res.json({ valid: false, message: "Ya reclamaste BINGO con este cartón. El administrador validará tu premio." });
    return;
  }
  if (capReached) {
    res.json({ valid: false, message: "Ya se alcanzó el número máximo de ganadores para este juego" });
    return;
  }
  if (!winner) { res.status(500).json({ error: "No se pudo registrar el reclamo" }); return; }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

  res.json({
    valid: true,
    message: `¡BINGO! Tu reclamo fue recibido en el puesto #${winner.place}. El administrador validará tu premio.`,
    winner: {
      id: winner.id,
      game_id: winner.gameId,
      user_id: winner.userId,
      card_id: winner.cardId,
      place: winner.place,
      prize_amount: parseFloat(winner.prizeAmount),
      claimed_at_ms: parseInt(winner.claimedAtMs),
      validated: winner.validated,
      user_name: users[0]?.fullName ?? null,
      created_at: winner.createdAt,
    },
  });
});

export { router as cardsRouter };
