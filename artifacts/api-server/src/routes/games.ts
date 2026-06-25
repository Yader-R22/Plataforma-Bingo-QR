import { Router } from "express";
import { db, gamesTable, winnersTable, usersTable, cardsTable, feedItemsTable, auditLogsTable } from "@workspace/db";
import type { RoundConfig, RoundHistoryEntry } from "@workspace/db";
import { eq, desc, asc, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import {
  ListGamesQueryParams,
  CreateGameBody,
  UpdateGameParams,
  UpdateGameBody,
  GetGameParams,
  GetGameSessionParams,
  GetGameWinnersParams,
  CallNumberParams,
  CallNumberBody,
  StartGameParams,
  FinishGameParams,
  DeleteGameParams,
  NextRoundParams,
} from "@workspace/api-zod";

const router = Router();

// In-memory presence: gameId → userId → lastSeen ms
const presenceMap = new Map<number, Map<number, number>>();
const PRESENCE_TTL_MS = 30_000;

function getOnlineCount(gameId: number): number {
  const m = presenceMap.get(gameId);
  if (!m) return 0;
  const now = Date.now();
  let count = 0;
  for (const [, ts] of m) { if (now - ts < PRESENCE_TTL_MS) count++; }
  return count;
}

function getCurrentRoundConfig(game: typeof gamesTable.$inferSelect) {
  const rounds = game.rounds as RoundConfig[] | null | undefined;
  if (rounds?.length) {
    const r = rounds[(game.currentRound ?? 1) - 1];
    if (r) {
      return {
        game_mode: r.game_mode as "horizontal" | "vertical" | "diagonal" | "quina" | "full_card",
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

function formatGame(
  game: typeof gamesTable.$inferSelect,
  extras: { uniqueParticipants?: number; onlineCount?: number } = {}
) {
  const rounds = game.rounds as RoundConfig[] | null | undefined;
  const totalRounds = rounds?.length ?? 1;
  const currentRound = game.currentRound ?? 1;
  const roundCfg = getCurrentRoundConfig(game);

  return {
    id: game.id,
    title: game.title,
    type: game.type,
    status: game.status,
    prize_amount: parseFloat(game.prizeAmount),
    card_price: parseFloat(game.cardPrice),
    draw_date: game.drawDate,
    participant_count: game.participantCount,
    unique_participants: extras.uniqueParticipants ?? game.participantCount,
    online_count: extras.onlineCount ?? 0,
    stream_url_youtube: game.streamUrlYoutube ?? null,
    stream_url_tiktok: game.streamUrlTiktok ?? null,
    stream_url_facebook: game.streamUrlFacebook ?? null,
    game_mode: roundCfg.game_mode,
    max_winners: roundCfg.max_winners,
    prizes: (game.prizes as Array<{ place: number; amount: number }>) ?? [],
    rounds: rounds ?? null,
    current_round: currentRound,
    total_rounds: totalRounds,
    round_history: (game.roundHistory as RoundHistoryEntry[] | null) ?? [],
    is_featured: game.isFeatured,
    cover_image_url: game.coverImageUrl ?? null,
    called_numbers: game.calledNumbers ?? [],
    created_at: game.createdAt,
  };
}

router.get("/", async (req: AuthRequest, res) => {
  const query = ListGamesQueryParams.safeParse(req.query);
  let conditions = [];
  if (query.success) {
    if (query.data.type) conditions.push(eq(gamesTable.type, query.data.type as "daily" | "weekly" | "monthly"));
    if (query.data.status) conditions.push(eq(gamesTable.status, query.data.status as "upcoming" | "active" | "finished"));
  }
  const games = conditions.length
    ? await db.select().from(gamesTable).where(and(...conditions)).orderBy(desc(gamesTable.drawDate))
    : await db.select().from(gamesTable).orderBy(desc(gamesTable.drawDate));

  // Unique participants per game (one query for all games)
  const uniqueRows = await db.execute(
    sql`SELECT game_id, COUNT(DISTINCT user_id)::int AS cnt FROM cards WHERE payment_status = 'paid' AND status = 'active' GROUP BY game_id`
  );
  const uniqueMap = new Map<number, number>();
  for (const row of uniqueRows.rows) uniqueMap.set(row.game_id as number, row.cnt as number);

  res.json(games.map(g => formatGame(g, {
    uniqueParticipants: uniqueMap.get(g.id) ?? 0,
    onlineCount: getOnlineCount(g.id),
  })));
});

router.post("/", requireAdmin, async (req: AuthRequest, res) => {
  const parsed = CreateGameBody.safeParse(req.body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    res.status(400).json({ error: `Datos inválidos — ${issues}` });
    return;
  }
  const data = parsed.data;
  const rounds = (data.rounds as RoundConfig[] | undefined) ?? null;

  const [game] = await db.insert(gamesTable).values({
    title: data.title,
    type: data.type as "daily" | "weekly" | "monthly",
    prizeAmount: String(data.prize_amount),
    cardPrice: String(data.card_price),
    drawDate: new Date(data.draw_date),
    streamUrlYoutube: data.stream_url_youtube ?? null,
    streamUrlTiktok: data.stream_url_tiktok ?? null,
    streamUrlFacebook: data.stream_url_facebook ?? null,
    gameMode: (data.game_mode ?? "full_card") as "horizontal" | "vertical" | "diagonal" | "quina" | "full_card",
    maxWinners: data.max_winners ?? 1,
    prizes: (data.prizes as Array<{ place: number; amount: number }>) ?? [],
    rounds,
    currentRound: 1,
    coverImageUrl: data.cover_image_url ?? null,
  }).returning();
  res.status(201).json(formatGame(game));
});

router.get("/:id", async (req: AuthRequest, res) => {
  const p = GetGameParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const games = await db.select().from(gamesTable).where(eq(gamesTable.id, p.data.id)).limit(1);
  if (!games.length) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  const uniq = await db.execute(
    sql`SELECT COUNT(DISTINCT user_id)::int AS cnt FROM cards WHERE game_id = ${p.data.id} AND payment_status = 'paid' AND status = 'active'`
  );
  const uniqueParticipants = (uniq.rows[0]?.cnt as number) ?? 0;
  res.json(formatGame(games[0], { uniqueParticipants, onlineCount: getOnlineCount(p.data.id) }));
});

router.patch("/:id", requireAdmin, async (req: AuthRequest, res) => {
  const p = UpdateGameParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const parsed = UpdateGameBody.safeParse(req.body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    res.status(400).json({ error: `Datos inválidos — ${issues}` });
    return;
  }
  const data = parsed.data;
  const updateData: Partial<typeof gamesTable.$inferInsert> = {};
  if (data.title) updateData.title = data.title;
  if (data.prize_amount !== undefined) updateData.prizeAmount = String(data.prize_amount);
  if (data.card_price !== undefined) updateData.cardPrice = String(data.card_price);
  if (data.draw_date) updateData.drawDate = new Date(data.draw_date);
  if (data.stream_url_youtube !== undefined) updateData.streamUrlYoutube = data.stream_url_youtube;
  if (data.stream_url_tiktok !== undefined) updateData.streamUrlTiktok = data.stream_url_tiktok;
  if (data.stream_url_facebook !== undefined) updateData.streamUrlFacebook = data.stream_url_facebook;
  if (data.game_mode) updateData.gameMode = data.game_mode as "horizontal" | "vertical" | "diagonal" | "quina" | "full_card";
  if (data.max_winners !== undefined) updateData.maxWinners = data.max_winners;
  if (data.status) updateData.status = data.status as "upcoming" | "active" | "finished";
  if (data.cover_image_url !== undefined) updateData.coverImageUrl = data.cover_image_url ?? null;
  if (data.rounds !== undefined) updateData.rounds = (data.rounds as RoundConfig[]) ?? null;
  const [game] = await db.update(gamesTable).set(updateData).where(eq(gamesTable.id, p.data.id)).returning();
  if (!game) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  res.json(formatGame(game));
});

router.get("/:id/session", requireAuth, async (req: AuthRequest, res) => {
  const p = GetGameSessionParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const games = await db.select().from(gamesTable).where(eq(gamesTable.id, p.data.id)).limit(1);
  if (!games.length) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  const game = games[0];

  // Record presence
  if (req.userId) {
    let gm = presenceMap.get(p.data.id);
    if (!gm) { gm = new Map(); presenceMap.set(p.data.id, gm); }
    gm.set(req.userId, Date.now());
  }

  const called = game.status === "active" ? (game.calledNumbers ?? []) : [];
  const rounds = game.rounds as RoundConfig[] | null | undefined;
  const totalRounds = rounds?.length ?? 1;
  const currentRound = game.currentRound ?? 1;
  const roundCfg = getCurrentRoundConfig(game);
  res.json({
    game_id: game.id,
    game_status: game.status,
    called_numbers: called,
    last_called_number: called.length ? called[called.length - 1] : null,
    game_mode: roundCfg.game_mode,
    current_round: currentRound,
    total_rounds: totalRounds,
    updated_at: game.updatedAt,
  });
});

router.get("/:id/winners", async (req: AuthRequest, res) => {
  const p = GetGameWinnersParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const winners = await db
    .select({
      id: winnersTable.id,
      game_id: winnersTable.gameId,
      user_id: winnersTable.userId,
      card_id: winnersTable.cardId,
      round: winnersTable.round,
      place: winnersTable.place,
      prize_amount: winnersTable.prizeAmount,
      claimed_at_ms: winnersTable.claimedAtMs,
      validated: winnersTable.validated,
      user_name: usersTable.fullName,
      user_department: usersTable.department,
      created_at: winnersTable.createdAt,
    })
    .from(winnersTable)
    .innerJoin(usersTable, eq(winnersTable.userId, usersTable.id))
    .where(and(
      eq(winnersTable.gameId, p.data.id),
      eq(winnersTable.validated, true),
      eq(winnersTable.isHistorical, false),
    ))
    .orderBy(winnersTable.round, winnersTable.place);

  res.json(winners.map(w => ({
    ...w,
    prize_amount: parseFloat(w.prize_amount),
    claimed_at_ms: parseInt(w.claimed_at_ms),
  })));
});

router.post("/:id/call-number", requireAdmin, async (req: AuthRequest, res) => {
  const p = CallNumberParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const b = CallNumberBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Número inválido (1-75)" }); return; }
  const games = await db.select().from(gamesTable).where(eq(gamesTable.id, p.data.id)).limit(1);
  if (!games.length) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  const game = games[0];
  if (game.status !== "active") { res.status(400).json({ error: "El juego no está activo" }); return; }
  const appended = await db.execute(
    sql`UPDATE games SET called_numbers = array_append(called_numbers, ${b.data.number})
        WHERE id = ${p.data.id} AND status = 'active' AND NOT (${b.data.number} = ANY(called_numbers))`
  );
  if (appended.rowCount === 0) {
    res.status(409).json({ error: `El número ${b.data.number} ya fue cantado` });
    return;
  }
  const [updated] = await db.select().from(gamesTable).where(eq(gamesTable.id, p.data.id)).limit(1);
  const rounds = updated.rounds as RoundConfig[] | null | undefined;
  const totalRounds = rounds?.length ?? 1;
  const currentRound = updated.currentRound ?? 1;
  const roundCfg = getCurrentRoundConfig(updated);
  res.json({
    game_id: updated.id,
    called_numbers: updated.calledNumbers,
    last_called_number: b.data.number,
    game_mode: roundCfg.game_mode,
    current_round: currentRound,
    total_rounds: totalRounds,
    updated_at: updated.updatedAt,
  });
});

router.post("/:id/start", requireAdmin, async (req: AuthRequest, res) => {
  const p = StartGameParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const [game] = await db.update(gamesTable)
    .set({ status: "active", calledNumbers: [], currentRound: 1, roundHistory: [] })
    .where(eq(gamesTable.id, p.data.id))
    .returning();
  if (!game) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  res.json(formatGame(game));
});

router.post("/:id/next-round", requireAdmin, async (req: AuthRequest, res) => {
  const p = NextRoundParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const games = await db.select().from(gamesTable).where(eq(gamesTable.id, p.data.id)).limit(1);
  if (!games.length) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  const game = games[0];

  if (game.status !== "active") {
    res.status(400).json({ error: "El juego no está activo" });
    return;
  }

  const rounds = game.rounds as RoundConfig[] | null | undefined;
  const totalRounds = rounds?.length ?? 1;
  const currentRound = game.currentRound ?? 1;

  if (currentRound >= totalRounds) {
    res.status(400).json({ error: "Ya estás en la última ronda. Finaliza el juego." });
    return;
  }

  // Save current round's numbers to history before resetting
  const existingHistory = (game.roundHistory as RoundHistoryEntry[] | null) ?? [];
  const newHistory: RoundHistoryEntry[] = [
    ...existingHistory.filter(h => h.round !== currentRound),
    { round: currentRound, called_numbers: game.calledNumbers ?? [] },
  ];

  const [updated] = await db.update(gamesTable)
    .set({ currentRound: currentRound + 1, calledNumbers: [], roundHistory: newHistory })
    .where(eq(gamesTable.id, p.data.id))
    .returning();

  // Reset all active cards' marked numbers so players start with a blank card
  await db.update(cardsTable)
    .set({ markedNumbers: [] })
    .where(and(eq(cardsTable.gameId, p.data.id), eq(cardsTable.status, "active")));

  req.log.info({ gameId: p.data.id, newRound: currentRound + 1 }, "Ronda avanzada por admin");
  res.json(formatGame(updated));
});

router.post("/:id/finish", requireAdmin, async (req: AuthRequest, res) => {
  const p = FinishGameParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const [game] = await db.update(gamesTable).set({ status: "finished" }).where(eq(gamesTable.id, p.data.id)).returning();
  if (!game) { res.status(404).json({ error: "Juego no encontrado" }); return; }

  await db.update(cardsTable).set({ status: "expired" })
    .where(and(eq(cardsTable.gameId, p.data.id), eq(cardsTable.status, "active")));

  res.json(formatGame(game));
});

router.post("/:id/reset", requireAdmin, async (req: AuthRequest, res) => {
  const gameId = parseInt(String(req.params.id));
  if (!gameId || isNaN(gameId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const games = await db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).limit(1);
  if (!games.length) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  const game = games[0];

  if (game.status !== "finished") {
    res.status(400).json({ error: "Solo se pueden resetear juegos finalizados" }); return;
  }

  await db.transaction(async (tx) => {
    // Marcar ganadores como históricos (preserva estadísticas del usuario)
    // NO anulamos cardId porque los cartones se conservan como registro histórico
    await tx.update(winnersTable)
      .set({ isHistorical: true })
      .where(eq(winnersTable.gameId, gameId));
    // Marcar cartones como expirados — preserva historial de compras, pagos y ganadores
    // en vez de borrarlos. Las consultas de finanzas siguen contándolos (payment_status='paid').
    // Las queries de sesión de juego ya filtran status='active', así que no interfieren.
    await tx.update(cardsTable)
      .set({ status: "expired" })
      .where(eq(cardsTable.gameId, gameId));
    // Resetear estado del juego para que pueda volver a jugarse como nueva sesión
    await tx.update(gamesTable)
      .set({ status: "upcoming", calledNumbers: [], currentRound: 1, roundHistory: [], participantCount: 0 })
      .where(eq(gamesTable.id, gameId));
    await tx.insert(auditLogsTable).values({
      action: "game_reset",
      userId: req.userId!,
      gameId,
      details: { title: game.title, preserved_cards: true },
      ipAddress: req.ip,
    });
  });

  const [updated] = await db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).limit(1);
  req.log.info({ gameId }, "Juego reseteado por admin");
  res.json(formatGame(updated));
});

router.delete("/:id", requireAdmin, async (req: AuthRequest, res) => {
  const p = DeleteGameParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const gameId = p.data.id;

  const games = await db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).limit(1);
  if (!games.length) { res.status(404).json({ error: "Juego no encontrado" }); return; }

  const game = games[0];

  if (game.status !== "finished") {
    const paidCards = await db.select({ id: cardsTable.id }).from(cardsTable)
      .where(and(eq(cardsTable.gameId, gameId), eq(cardsTable.paymentStatus, "paid")))
      .limit(1);
    if (paidCards.length) {
      res.status(409).json({ error: "No se puede eliminar: este juego tiene cartones pagados. Finalízalo primero antes de eliminar." });
      return;
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(winnersTable).where(eq(winnersTable.gameId, gameId));
    await tx.delete(cardsTable).where(eq(cardsTable.gameId, gameId));
    await tx.delete(gamesTable).where(eq(gamesTable.id, gameId));
    await tx.insert(auditLogsTable).values({
      action: "game_deleted",
      userId: req.userId!,
      gameId,
      details: { title: games[0].title, status: games[0].status },
      ipAddress: req.ip,
    });
  });

  req.log.info({ gameId }, "Juego eliminado por admin");
  res.json({ id: gameId, deleted: true });
});

export { router as gamesRouter };
