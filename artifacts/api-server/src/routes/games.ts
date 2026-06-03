import { Router } from "express";
import { db, gamesTable, winnersTable, usersTable, cardsTable, feedItemsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
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
} from "@workspace/api-zod";

const router = Router();

function formatGame(game: typeof gamesTable.$inferSelect) {
  return {
    id: game.id,
    title: game.title,
    type: game.type,
    status: game.status,
    prize_amount: parseFloat(game.prizeAmount),
    card_price: parseFloat(game.cardPrice),
    draw_date: game.drawDate,
    participant_count: game.participantCount,
    stream_url_youtube: game.streamUrlYoutube ?? null,
    stream_url_tiktok: game.streamUrlTiktok ?? null,
    stream_url_facebook: game.streamUrlFacebook ?? null,
    game_mode: game.gameMode,
    max_winners: game.maxWinners,
    prizes: (game.prizes as Array<{ place: number; amount: number }>) ?? [],
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
  res.json(games.map(formatGame));
});

router.post("/", requireAdmin, async (req: AuthRequest, res) => {
  const parsed = CreateGameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos del juego inválidos" });
    return;
  }
  const data = parsed.data;
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
  }).returning();
  res.status(201).json(formatGame(game));
});

router.get("/:id", async (req: AuthRequest, res) => {
  const p = GetGameParams.safeParse({ id: parseInt(req.params.id) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const games = await db.select().from(gamesTable).where(eq(gamesTable.id, p.data.id)).limit(1);
  if (!games.length) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  res.json(formatGame(games[0]));
});

router.patch("/:id", requireAdmin, async (req: AuthRequest, res) => {
  const p = UpdateGameParams.safeParse({ id: parseInt(req.params.id) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const parsed = UpdateGameBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }
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
  const [game] = await db.update(gamesTable).set(updateData).where(eq(gamesTable.id, p.data.id)).returning();
  if (!game) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  res.json(formatGame(game));
});

router.get("/:id/session", requireAuth, async (req: AuthRequest, res) => {
  const p = GetGameSessionParams.safeParse({ id: parseInt(req.params.id) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const games = await db.select().from(gamesTable).where(eq(gamesTable.id, p.data.id)).limit(1);
  if (!games.length) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  const game = games[0];
  const called = game.calledNumbers ?? [];
  res.json({
    game_id: game.id,
    called_numbers: called,
    last_called_number: called.length ? called[called.length - 1] : null,
    game_mode: game.gameMode,
    updated_at: game.updatedAt,
  });
});

router.get("/:id/winners", async (req: AuthRequest, res) => {
  const p = GetGameWinnersParams.safeParse({ id: parseInt(req.params.id) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const winners = await db
    .select({
      id: winnersTable.id,
      game_id: winnersTable.gameId,
      user_id: winnersTable.userId,
      card_id: winnersTable.cardId,
      place: winnersTable.place,
      prize_amount: winnersTable.prizeAmount,
      claimed_at_ms: winnersTable.claimedAtMs,
      validated: winnersTable.validated,
      user_name: usersTable.fullName,
      created_at: winnersTable.createdAt,
    })
    .from(winnersTable)
    .innerJoin(usersTable, eq(winnersTable.userId, usersTable.id))
    .where(and(eq(winnersTable.gameId, p.data.id), eq(winnersTable.validated, true)))
    .orderBy(winnersTable.place);

  res.json(winners.map(w => ({
    ...w,
    prize_amount: parseFloat(w.prize_amount),
    claimed_at_ms: parseInt(w.claimed_at_ms),
  })));
});

router.post("/:id/call-number", requireAdmin, async (req: AuthRequest, res) => {
  const p = CallNumberParams.safeParse({ id: parseInt(req.params.id) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const b = CallNumberBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Número inválido (1-75)" }); return; }
  const games = await db.select().from(gamesTable).where(eq(gamesTable.id, p.data.id)).limit(1);
  if (!games.length) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  const game = games[0];
  const called = [...(game.calledNumbers ?? []), b.data.number];
  const [updated] = await db.update(gamesTable).set({ calledNumbers: called }).where(eq(gamesTable.id, p.data.id)).returning();
  res.json({
    game_id: updated.id,
    called_numbers: updated.calledNumbers,
    last_called_number: b.data.number,
    game_mode: updated.gameMode,
    updated_at: updated.updatedAt,
  });
});

router.post("/:id/start", requireAdmin, async (req: AuthRequest, res) => {
  const p = StartGameParams.safeParse({ id: parseInt(req.params.id) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const [game] = await db.update(gamesTable).set({ status: "active", calledNumbers: [] }).where(eq(gamesTable.id, p.data.id)).returning();
  if (!game) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  res.json(formatGame(game));
});

router.post("/:id/finish", requireAdmin, async (req: AuthRequest, res) => {
  const p = FinishGameParams.safeParse({ id: parseInt(req.params.id) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const [game] = await db.update(gamesTable).set({ status: "finished" }).where(eq(gamesTable.id, p.data.id)).returning();
  if (!game) { res.status(404).json({ error: "Juego no encontrado" }); return; }

  // Expire all pending cards for this game
  await db.update(cardsTable).set({ status: "expired" })
    .where(and(eq(cardsTable.gameId, p.data.id), eq(cardsTable.status, "active")));

  res.json(formatGame(game));
});

export { router as gamesRouter };
