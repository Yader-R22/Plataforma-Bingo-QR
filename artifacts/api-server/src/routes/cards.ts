import { Router } from "express";
import { db, cardsTable, gamesTable, winnersTable, usersTable, auditLogsTable, feedItemsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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

function validateBingo(card: typeof cardsTable.$inferSelect, markedNumbers: number[], gameMode: string, calledNumbers: number[]): boolean {
  const matrix = card.numbers as number[][];
  const marked = new Set([...markedNumbers, 0]);
  const calledSet = new Set(calledNumbers);

  // All marked numbers must be in called numbers (except free space 0)
  for (const num of markedNumbers) {
    if (num !== 0 && !calledSet.has(num)) return false;
  }

  const isMarked = (row: number, col: number) => marked.has(matrix[row][col]);

  if (gameMode === "full_card") {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (!isMarked(r, c)) return false;
      }
    }
    return true;
  }
  if (gameMode === "horizontal") {
    for (let r = 0; r < 5; r++) {
      if ([0, 1, 2, 3, 4].every(c => isMarked(r, c))) return true;
    }
  }
  if (gameMode === "vertical") {
    for (let c = 0; c < 5; c++) {
      if ([0, 1, 2, 3, 4].every(r => isMarked(r, c))) return true;
    }
  }
  if (gameMode === "diagonal") {
    if ([0, 1, 2, 3, 4].every(i => isMarked(i, i))) return true;
    if ([0, 1, 2, 3, 4].every(i => isMarked(i, 4 - i))) return true;
  }
  if (gameMode === "quina") {
    for (let r = 0; r < 5; r++) {
      if ([0, 1, 2, 3, 4].every(c => isMarked(r, c))) return true;
    }
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
    const currentBalance = parseFloat(user.balance as unknown as string);
    if (currentBalance < totalAmount) {
      res.status(400).json({ error: `Saldo insuficiente. Saldo actual: Bs ${currentBalance.toFixed(2)}` });
      return;
    }
    const newBalance = (currentBalance - totalAmount).toFixed(2);
    const newCards = [];
    for (let i = 0; i < quantity; i++) {
      const numbers = generateBingoCard();
      const [card] = await db.insert(cardsTable).values({
        gameId: game_id,
        userId: req.userId!,
        numbers,
        paymentStatus: "paid",
        status: "active",
      }).returning();
      newCards.push(card);
    }
    await db.update(usersTable).set({ balance: newBalance }).where(eq(usersTable.id, req.userId!));
    await db.insert(auditLogsTable).values({
      action: "card_purchase_wallet",
      userId: req.userId,
      gameId: game_id,
      details: { card_ids: newCards.map(c => c.id), amount: totalAmount, method: "wallet" },
      ipAddress: req.ip,
    });
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
  const isValid = validateBingo(card, b.data.marked_numbers, game.gameMode, calledNumbers);

  if (!isValid) {
    res.json({ valid: false, message: "Los números marcados no coinciden con el patrón ganador. ¡Sigue jugando!" });
    return;
  }

  // Check if max winners reached
  const existingWinners = await db.select().from(winnersTable)
    .where(and(eq(winnersTable.gameId, game.id), eq(winnersTable.validated, true)));

  if (existingWinners.length >= game.maxWinners) {
    res.json({ valid: false, message: "Ya se alcanzó el número máximo de ganadores para este juego" });
    return;
  }

  const prizes = (game.prizes as Array<{ place: number; amount: number }>) ?? [];
  const nextPlace = existingWinners.length + 1;
  const prize = prizes.find(p => p.place === nextPlace);
  const prizeAmount = prize?.amount ?? parseFloat(game.prizeAmount);

  // Record the winner claim (unvalidated — admin must validate)
  const [winner] = await db.insert(winnersTable).values({
    gameId: game.id,
    userId: req.userId!,
    cardId: card.id,
    place: nextPlace,
    prizeAmount: String(prizeAmount),
    claimedAtMs: String(b.data.claimed_at_ms),
    validated: false,
  }).returning();

  // Log audit
  await db.insert(auditLogsTable).values({
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

  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

  res.json({
    valid: true,
    message: `¡BINGO! Tu reclamo fue recibido en el puesto #${nextPlace}. El administrador validará tu premio.`,
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
