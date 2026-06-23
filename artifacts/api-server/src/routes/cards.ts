import { Router } from "express";
import { db, cardsTable, gamesTable, winnersTable, usersTable, auditLogsTable, feedItemsTable, referralCodesTable, activatorSettingsTable, referralTransactionsTable } from "@workspace/db";
import type { RoundConfig } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

function getCurrentRoundConfig(game: typeof gamesTable.$inferSelect) {
  const rounds = game.rounds as RoundConfig[] | null | undefined;
  if (rounds?.length) {
    const r = rounds[(game.currentRound ?? 1) - 1];
    if (r) {
      return {
        game_mode: r.game_mode as "horizontal" | "vertical" | "diagonal" | "quina" | "full_card" | "esquinas" | "cruz" | "x_doble",
        max_winners: r.max_winners,
        prize_amount: r.prize_amount,
      };
    }
  }
  return {
    game_mode: game.gameMode,
    max_winners: game.maxWinners,
    prize_amount: parseFloat(game.prizeAmount),
  };
}
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

import { getPaymentApiKey } from "../lib/paymentApiKey";

const PAYMENT_API_URL = "https://yhzzqeogsakeeknjlwtw.supabase.co/functions/v1";

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
// Cuenta cuántas líneas ganadoras independientes tiene el cartón con los números dados.
// Usado para el chequeo de pisado: si el último bolillo aumentó el conteo, el jugador
// formó una línea nueva y el reclamo es válido aunque ya tuviera otra línea antes.
function countValidLines(card: typeof cardsTable.$inferSelect, gameMode: string, calledNumbers: number[]): number {
  const matrix = card.numbers as number[][];
  const calledSet = new Set(calledNumbers);
  const isHit = (row: number, col: number) => {
    const n = matrix[row][col];
    return n === 0 || calledSet.has(n);
  };
  let count = 0;
  if (gameMode === "horizontal") {
    for (let r = 0; r < 5; r++) {
      if ([0, 1, 2, 3, 4].every(c => isHit(r, c))) count++;
    }
  } else if (gameMode === "vertical") {
    for (let c = 0; c < 5; c++) {
      if ([0, 1, 2, 3, 4].every(r => isHit(r, c))) count++;
    }
  } else if (gameMode === "diagonal") {
    if ([0, 1, 2, 3, 4].every(i => isHit(i, i))) count++;
    if ([0, 1, 2, 3, 4].every(i => isHit(i, 4 - i))) count++;
  } else if (gameMode === "quina") {
    for (let r = 0; r < 5; r++) {
      if ([0, 1, 2, 3, 4].every(c => isHit(r, c))) count++;
    }
    for (let c = 0; c < 5; c++) {
      if ([0, 1, 2, 3, 4].every(r => isHit(r, c))) count++;
    }
    if ([0, 1, 2, 3, 4].every(i => isHit(i, i))) count++;
    if ([0, 1, 2, 3, 4].every(i => isHit(i, 4 - i))) count++;
  } else {
    // Modos de resultado único (full_card, esquinas, cruz, x_doble): 0 o 1
    count = validateBingo(card, gameMode, calledNumbers) ? 1 : 0;
  }
  return count;
}

function validateBingo(card: typeof cardsTable.$inferSelect, gameMode: string, calledNumbers: number[]): boolean {
  const matrix = card.numbers as number[][];
  const calledSet = new Set(calledNumbers);

  const isHit = (row: number, col: number) => {
    const n = matrix[row][col];
    return n === 0 || calledSet.has(n);
  };

  // Cartón completo: todos los 24 números marcados
  if (gameMode === "full_card") {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (!isHit(r, c)) return false;
      }
    }
    return true;
  }

  // Línea horizontal: cualquier fila completa
  if (gameMode === "horizontal") {
    for (let r = 0; r < 5; r++) {
      if ([0, 1, 2, 3, 4].every(c => isHit(r, c))) return true;
    }
    return false;
  }

  // Línea vertical: cualquier columna completa
  if (gameMode === "vertical") {
    for (let c = 0; c < 5; c++) {
      if ([0, 1, 2, 3, 4].every(r => isHit(r, c))) return true;
    }
    return false;
  }

  // Diagonal: una de las dos diagonales
  if (gameMode === "diagonal") {
    if ([0, 1, 2, 3, 4].every(i => isHit(i, i))) return true;
    if ([0, 1, 2, 3, 4].every(i => isHit(i, 4 - i))) return true;
    return false;
  }

  // Quina: cualquier línea completa (fila, columna O diagonal)
  if (gameMode === "quina") {
    for (let r = 0; r < 5; r++) {
      if ([0, 1, 2, 3, 4].every(c => isHit(r, c))) return true;
    }
    for (let c = 0; c < 5; c++) {
      if ([0, 1, 2, 3, 4].every(r => isHit(r, c))) return true;
    }
    if ([0, 1, 2, 3, 4].every(i => isHit(i, i))) return true;
    if ([0, 1, 2, 3, 4].every(i => isHit(i, 4 - i))) return true;
    return false;
  }

  // Esquinas: las 4 esquinas del cartón
  if (gameMode === "esquinas") {
    return isHit(0, 0) && isHit(0, 4) && isHit(4, 0) && isHit(4, 4);
  }

  // Cruz: fila central (fila 2) + columna central (col 2)
  if (gameMode === "cruz") {
    const rowOk = [0, 1, 2, 3, 4].every(c => isHit(2, c));
    const colOk = [0, 1, 2, 3, 4].every(r => isHit(r, 2));
    return rowOk && colOk;
  }

  // X doble: ambas diagonales simultáneamente
  if (gameMode === "x_doble") {
    const diag1 = [0, 1, 2, 3, 4].every(i => isHit(i, i));
    const diag2 = [0, 1, 2, 3, 4].every(i => isHit(i, 4 - i));
    return diag1 && diag2;
  }

  return false;
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const query = ListMyCardsQueryParams.safeParse(req.query);
  const conditions = [
    eq(cardsTable.userId, req.userId!),
    // Excluir cartones expirados de sesiones anteriores (juegos reseteados).
    // Se preservan en la DB para historial financiero pero no se muestran al jugador.
    sql`${cardsTable.status} != 'expired'`,
  ];
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

  // --- Pay with wallet balance (bonus_balance used first, then regular balance) ---
  if (payWithBalance) {
    const currentBalance = parseFloat(user.balance as unknown as string);
    const bonusExpired = user.bonusExpiresAt != null && new Date(user.bonusExpiresAt) < new Date();
    const currentBonus = bonusExpired ? 0 : parseFloat(user.bonusBalance as unknown as string);
    const pendingRows = await db.execute(
      sql`SELECT COALESCE(SUM(amount), 0) AS total FROM withdrawals WHERE user_id = ${req.userId!} AND status = 'pending'`
    );
    const pendingAmount = parseFloat((pendingRows.rows[0]?.total as string | undefined) ?? "0");
    // bonus_balance is not withdrawable so pending withdrawals only reduce regular balance
    const availableBalance = currentBalance - pendingAmount;
    const totalAvailable = availableBalance + currentBonus;
    if (totalAvailable < totalAmount) {
      res.status(400).json({ error: `Saldo insuficiente. Disponible: Bs ${totalAvailable.toFixed(2)} (saldo Bs ${currentBalance.toFixed(2)} + bono Bs ${currentBonus.toFixed(2)} menos retiros pendientes Bs ${pendingAmount.toFixed(2)})` });
      return;
    }
    // Lock row, re-read both balances under lock, deduct bonus first then regular balance.
    const newCards: (typeof cardsTable.$inferSelect)[] = [];
    let insufficient = false;
    await db.transaction(async (tx) => {
      const locked = await tx.execute(
        sql`SELECT balance, bonus_balance, bonus_expires_at FROM users WHERE id = ${req.userId!} FOR UPDATE`
      );
      const lockedBalance = parseFloat((locked.rows[0]?.balance as string | undefined) ?? "0");
      const lockedBonusExpiresAt = locked.rows[0]?.bonus_expires_at as Date | string | null | undefined;
      const lockedBonusExpired = lockedBonusExpiresAt != null && new Date(lockedBonusExpiresAt) < new Date();
      const lockedBonus = lockedBonusExpired ? 0 : parseFloat((locked.rows[0]?.bonus_balance as string | undefined) ?? "0");
      const pend = await tx.execute(
        sql`SELECT COALESCE(SUM(amount), 0) AS total FROM withdrawals WHERE user_id = ${req.userId!} AND status = 'pending'`
      );
      const lockedPending = parseFloat((pend.rows[0]?.total as string | undefined) ?? "0");
      if (lockedBalance - lockedPending + lockedBonus < totalAmount) { insufficient = true; return; }
      // Use bonus first, then regular balance
      const fromBonus = Math.min(lockedBonus, totalAmount);
      const fromBalance = totalAmount - fromBonus;
      if (fromBonus > 0) {
        await tx.execute(
          sql`UPDATE users SET bonus_balance = bonus_balance - ${fromBonus} WHERE id = ${req.userId!}`
        );
      }
      if (fromBalance > 0) {
        await tx.execute(
          sql`UPDATE users SET balance = balance - ${fromBalance} WHERE id = ${req.userId!}`
        );
      }
      for (let i = 0; i < quantity; i++) {
        const numbers = generateBingoCard();
        const [card] = await tx.insert(cardsTable).values({
          gameId: game_id,
          userId: req.userId!,
          numbers,
          paymentStatus: "paid",
          status: "active",
          bonusAmountUsed: String(parseFloat((fromBonus / quantity).toFixed(2))),
        }).returning();
        newCards.push(card);
      }
      await tx.execute(
        sql`UPDATE games SET participant_count = participant_count + ${newCards.length} WHERE id = ${game_id}`
      );
      await tx.insert(auditLogsTable).values({
        action: "card_purchase_wallet",
        userId: req.userId,
        gameId: game_id,
        details: { card_ids: newCards.map(c => c.id), amount: totalAmount, from_bonus: fromBonus, from_balance: fromBalance, method: fromBonus > 0 ? "wallet+bonus" : "wallet" },
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

  // Call new QR payment API
  let transactionId = `tx-${orderId}`;
  let qrImage = "";
  try {
    const apiKey = await getPaymentApiKey();
    const response = await fetch(`${PAYMENT_API_URL}/generate-qr`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: totalAmount }),
    });
    if (response.ok) {
      const data = await response.json() as { qrImage: string; transactionId: string };
      transactionId = data.transactionId;
      // API returns raw base64 — prefix it so browsers can render it as <img src>
      qrImage = data.qrImage.startsWith("data:")
        ? data.qrImage
        : `data:image/png;base64,${data.qrImage}`;
    } else {
      req.log.error({ status: response.status }, "generate-qr API error");
    }
  } catch (err) {
    req.log.error({ err }, "generate-qr API error");
  }

  // Update cards with transaction ID
  for (const card of newCards) {
    await db.update(cardsTable).set({ checkoutId: transactionId }).where(eq(cardsTable.id, card.id));
  }

  // Log audit
  await db.insert(auditLogsTable).values({
    action: "card_purchase",
    userId: req.userId,
    gameId: game_id,
    details: { card_ids: cardIds, amount: totalAmount, order_id: orderId, transaction_id: transactionId },
    ipAddress: req.ip,
  });

  const updatedCards = await db.select().from(cardsTable).where(and(...cardIds.map(id => eq(cardsTable.id, id))));

  res.status(201).json({
    cards: updatedCards.map(formatCard),
    qr_image: qrImage,
    checkout_id: transactionId,
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
  const currentRound = game.currentRound ?? 1;
  const roundCfg = getCurrentRoundConfig(game);

  const isValid = validateBingo(card, roundCfg.game_mode, calledNumbers);

  if (!isValid) {
    const modeNames: Record<string, string> = {
      horizontal: "línea horizontal (fila completa)",
      vertical: "línea vertical (columna completa)",
      diagonal: "diagonal completa",
      quina: "quina (cualquier línea: fila, columna o diagonal)",
      full_card: "cartón lleno",
      esquinas: "cuatro esquinas",
      cruz: "cruz (fila + columna central)",
      x_doble: "X doble (ambas diagonales)",
    };
    const modeName = modeNames[roundCfg.game_mode] ?? roundCfg.game_mode;
    res.json({ valid: false, message: `Tu cartón no tiene un ${modeName} válido con los números cantados. ¡Sigue jugando!` });
    return;
  }

  // ── Número pisado: el bingo ya era válido ANTES del último bolillo cantado
  // Y el último bolillo no formó ninguna línea nueva e independiente.
  // Si el jugador ya tenía una línea pero el último bolillo completó una línea
  // distinta, el reclamo es válido (nueva oportunidad ganadora).
  if (calledNumbers.length > 1) {
    const prevNumbers = calledNumbers.slice(0, -1);
    const linesBefore = countValidLines(card, roundCfg.game_mode, prevNumbers);
    if (linesBefore > 0) {
      const linesNow = countValidLines(card, roundCfg.game_mode, calledNumbers);
      if (linesNow <= linesBefore) {
        res.json({
          valid: false,
          pisado: true,
          message: "¡Número pisado! Ya tenías bingo antes del último bolillo. Debías reclamar en cuanto se cantó tu número ganador.",
        });
        return;
      }
    }
  }

  // ── Pre-compute referral commission BEFORE entering the serializable tx ─────
  // We look up settings outside the tx to keep the critical section short.
  let preCommPct = 0;
  let preActivatorId: number | null = null;
  let preApplyCommission = false;
  try {
    const winnerUserRow = await db.select({ referredByCode: usersTable.referredByCode })
      .from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
    const refCode = winnerUserRow[0]?.referredByCode;
    if (refCode) {
      const codeRow = await db.select({ userId: referralCodesTable.userId })
        .from(referralCodesTable)
        .where(and(eq(referralCodesTable.code, refCode), eq(referralCodesTable.isActive, true)))
        .limit(1);
      if (codeRow.length) {
        const settings = await db.select().from(activatorSettingsTable)
          .where(eq(activatorSettingsTable.id, 1)).limit(1);
        const pct = parseFloat(settings[0]?.commissionPercentage ?? "5");
        const duration = settings[0]?.commissionDuration ?? "indefinite";
        const durationMonths = settings[0]?.commissionDurationMonths ?? null;
        preActivatorId = codeRow[0].userId;
        preCommPct = pct;
        preApplyCommission = true;

        if (duration === "once") {
          const prev = await db.select({ id: referralTransactionsTable.id })
            .from(referralTransactionsTable)
            .where(and(
              eq(referralTransactionsTable.type, "commission"),
              eq(referralTransactionsTable.activatorId, preActivatorId),
              eq(referralTransactionsTable.referredUserId, req.userId!),
            )).limit(1);
          if (prev.length) preApplyCommission = false;
        } else if (duration === "monthly" && durationMonths) {
          const refTxRow = await db.select({ createdAt: referralTransactionsTable.createdAt })
            .from(referralTransactionsTable)
            .where(and(
              eq(referralTransactionsTable.type, "welcome_bonus"),
              eq(referralTransactionsTable.referredUserId, req.userId!),
            )).limit(1);
          if (refTxRow.length) {
            const monthsElapsed = (Date.now() - refTxRow[0].createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
            if (monthsElapsed > durationMonths) preApplyCommission = false;
          }
        }
      }
    }
  } catch { /* commission lookup errors must not block the claim */ }

  // Dedupe, max-winners cap, place assignment, winner insert and audit all run
  // inside ONE transaction that locks the game row (SELECT ... FOR UPDATE).
  // This serializes concurrent valid claims so two players cannot both pass the
  // cap check or collide on the same place. The DB unique constraint on
  // (card_id, round) is the final guard against a same-card double claim per round.
  let winner: typeof winnersTable.$inferSelect | undefined;
  let dupCard = false;
  let capReached = false;
  let notActive = false;
  try {
    await db.transaction(async (tx) => {
      const lockedRows = await tx.execute(
        sql`SELECT status FROM games WHERE id = ${game.id} FOR UPDATE`
      );
      if ((lockedRows.rows[0]?.status as string | undefined) !== "active") { notActive = true; return; }

      // Check duplicate claim for THIS round (same card can win different rounds).
      // Only non-historical winners count — historical ones belong to a previous session.
      const cardWinner = await tx.select().from(winnersTable)
        .where(and(
          eq(winnersTable.cardId, card.id),
          eq(winnersTable.round, currentRound),
          eq(winnersTable.isHistorical, false),
        )).limit(1);
      if (cardWinner.length) { dupCard = true; return; }

      // Count active (non-historical) winners for THIS round only
      const existingWinners = await tx.select().from(winnersTable)
        .where(and(
          eq(winnersTable.gameId, game.id),
          eq(winnersTable.round, currentRound),
          eq(winnersTable.isHistorical, false),
        ));
      if (existingWinners.length >= roundCfg.max_winners) { capReached = true; return; }

      const nextPlace = existingWinners.length + 1;
      const prizeAmount = roundCfg.prize_amount;

      [winner] = await tx.insert(winnersTable).values({
        gameId: game.id,
        userId: req.userId!,
        cardId: card.id,
        round: currentRound,
        place: nextPlace,
        prizeAmount: String(prizeAmount),
        claimedAtMs: String(b.data.claimed_at_ms),
        validated: true,
      }).returning();

      // Deduct commission from prize — winner receives net amount, activator gets the rest
      const commAmountTx = (preApplyCommission && preCommPct > 0)
        ? parseFloat((parseFloat(String(prizeAmount)) * preCommPct / 100).toFixed(2))
        : 0;
      const netPrize = parseFloat((parseFloat(String(prizeAmount)) - commAmountTx).toFixed(2));

      // Credit net prize (full prize minus activator commission) to winner
      await tx.execute(
        sql`UPDATE users SET balance = balance + ${netPrize} WHERE id = ${req.userId!}`
      );

      await tx.insert(auditLogsTable).values({
        action: "bingo_claim",
        userId: req.userId,
        gameId: game.id,
        cardId: card.id,
        details: {
          round: currentRound,
          claimed_at_ms: b.data.claimed_at_ms,
          server_timestamp_ms: claimTimestamp,
          marked_numbers: b.data.marked_numbers,
          called_numbers: calledNumbers,
          prize_amount: prizeAmount,
          net_prize: netPrize,
          commission_amount: commAmountTx,
          commission_pct: preCommPct,
          place: nextPlace,
        },
        ipAddress: req.ip,
      });
    });
  } catch (err) {
    req.log.warn({ err, cardId: card.id }, "Reclamo de bingo duplicado o en conflicto bloqueado");
    res.json({ valid: false, message: "Ya reclamaste BINGO con este cartón en esta ronda." });
    return;
  }

  if (notActive) {
    res.json({ valid: false, message: "El juego ya no está activo. Tu reclamo no pudo ser registrado." });
    return;
  }
  if (dupCard) {
    res.json({ valid: false, message: "Ya reclamaste BINGO con este cartón en esta ronda." });
    return;
  }
  if (capReached) {
    res.json({ valid: false, message: "Ya se alcanzó el número máximo de ganadores para este juego" });
    return;
  }
  if (!winner) { res.status(500).json({ error: "No se pudo registrar el reclamo" }); return; }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  const userName = users[0]?.fullName?.split(" ")[0] ?? "Un jugador";

  // ── Activator commission: credit activator with the amount already deducted from winner ──
  // preApplyCommission/preCommPct/preActivatorId were resolved before the tx above.
  if (preApplyCommission && preActivatorId && preCommPct > 0) {
    try {
      const commAmount = parseFloat((parseFloat(String(winner.prizeAmount)) * preCommPct / 100).toFixed(2));
      if (commAmount > 0) {
        await db.execute(
          sql`UPDATE users SET balance = balance + ${commAmount} WHERE id = ${preActivatorId}`
        );
        await db.insert(referralTransactionsTable).values({
          type: "commission",
          activatorId: preActivatorId,
          referredUserId: req.userId!,
          gameId: game.id,
          winnerId: winner.id,
          amount: String(commAmount),
          commissionPercentage: String(preCommPct),
          description: `Comisión ${preCommPct}% por ganancia de ${userName} — Premio: Bs ${parseFloat(String(winner.prizeAmount)).toFixed(2)}`,
        });
      }
    } catch { /* commission errors must not block winner registration */ }
  }

  // ── Add to public feed ────────────────────────────────────────────────────
  try {
    await db.insert(feedItemsTable).values({
      type: "winner",
      message: `¡${userName} ganó Bs ${parseFloat(String(winner.prizeAmount)).toFixed(0)}!`,
      amount: String(winner.prizeAmount),
      userDisplayName: userName,
    });
  } catch { /* feed errors must not block winner registration */ }

  res.json({
    valid: true,
    message: `¡BINGO! ¡Felicitaciones! Ganaste Bs ${parseFloat(String(winner.prizeAmount)).toFixed(0)} en el puesto #${winner.place}. El saldo ya fue acreditado a tu billetera.`,
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
