import { Router } from "express";
import { db, gamesTable, winnersTable, usersTable, cardsTable, feedItemsTable, auditLogsTable, manualPaymentRequestsTable, activatorCardSalesTable, referralTransactionsTable, gameAuthorizedActivatorsTable } from "@workspace/db";
import { sendPushToAll, sendPushToUsers } from "../lib/push";
import type { RoundConfig, RoundHistoryEntry } from "@workspace/db";
import { eq, desc, asc, and, ne, sql, inArray } from "drizzle-orm";
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

// Periodically purge stale user entries from active presence maps (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [gameId, userMap] of presenceMap) {
    for (const [userId, ts] of userMap) {
      if (now - ts > PRESENCE_TTL_MS * 4) userMap.delete(userId);
    }
    if (userMap.size === 0) presenceMap.delete(gameId);
  }
}, 5 * 60 * 1000).unref();

function getOnlineCount(gameId: number): number {
  const m = presenceMap.get(gameId);
  if (!m) return 0;
  const now = Date.now();
  let count = 0;
  for (const [, ts] of m) { if (now - ts < PRESENCE_TTL_MS) count++; }
  return count;
}

function computeGameType(drawDate: Date): "daily" | "weekly" | "monthly" {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (drawDate < tomorrowStart) return "daily";
  if (drawDate < weekEnd) return "weekly";
  return "monthly";
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
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

// Transforma rounds JSONB: reemplaza base64 prize_image_url por endpoint URL
function serializeRounds(
  gameId: number,
  rounds: RoundConfig[] | null | undefined,
  updatedAtMs: number
): RoundConfig[] | null {
  if (!rounds?.length) return null;
  return rounds.map((r, i) => ({
    ...r,
    prize_image_url: r.prize_image_url
      ? `/api/games/${gameId}/rounds/${i}/prize-image?v=${updatedAtMs}`
      : undefined,
  }));
}

function computePrizeAmount(storedAmount: string, rounds: RoundConfig[] | null | undefined): number {
  const stored = parseFloat(storedAmount);
  const roundsTotal = (rounds ?? []).reduce((s, r) => s + (r.prize_amount ?? 0), 0);
  return roundsTotal > stored ? roundsTotal : stored;
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
    type: computeGameType(new Date(game.drawDate)),
    status: game.status,
    prize_amount: computePrizeAmount(game.prizeAmount, rounds),
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
    rounds: serializeRounds(game.id, rounds, game.updatedAt.getTime()) ?? null,
    current_round: currentRound,
    total_rounds: totalRounds,
    round_history: (game.roundHistory as RoundHistoryEntry[] | null) ?? [],
    slug: game.slug ?? null,
    cover_image_url: game.coverImageUrl ? `/api/games/${game.id}/cover-image?v=${game.updatedAt.getTime()}` : null,
    prize_type: game.prizeType ?? "cash",
    prize_physical_name: game.prizePhysicalName ?? null,
    prize_physical_description: game.prizePhysicalDescription ?? null,
    prize_image_url: game.prizeImageUrl ? `/api/games/${game.id}/prize-image?v=${game.updatedAt.getTime()}` : null,
    is_private: game.isPrivate ?? false,
    called_numbers: game.calledNumbers ?? [],
    created_at: game.createdAt,
  };
}

// ── List formatter ────────────────────────────────────────────────────────────
// Usa un select parcial que excluye coverImageUrl (base64, hasta ~100KB/juego)
// y roundHistory (JSON que crece). La cover se sirve como URL via /cover-image.
// El endpoint de lista se consulta cada 5 s desde el frontend — sin esto la heap
// se llena rápidamente y dispara el auto-restart antes de que corra el GC.
function formatGameForList(
  game: {
    id: number; title: string;
    status: typeof gamesTable.$inferSelect["status"];
    prizeAmount: string; cardPrice: string; drawDate: Date; participantCount: number;
    streamUrlYoutube: string | null; streamUrlTiktok: string | null; streamUrlFacebook: string | null;
    gameMode: typeof gamesTable.$inferSelect["gameMode"]; maxWinners: number;
    prizes: typeof gamesTable.$inferSelect["prizes"];
    rounds: typeof gamesTable.$inferSelect["rounds"];
    currentRound: number | null; slug: string | null;
    hasCoverImage: boolean; hasPrizeImage: boolean; isPrivate: boolean | null;
    calledNumbers: number[] | null; createdAt: Date; updatedAt: Date | null;
    prizeType: typeof gamesTable.$inferSelect["prizeType"];
    prizePhysicalName: string | null;
  },
  extras: { uniqueParticipants?: number; onlineCount?: number } = {}
) {
  const rounds = game.rounds as RoundConfig[] | null | undefined;
  const totalRounds = rounds?.length ?? 1;
  const currentRound = game.currentRound ?? 1;
  let gameModeOut = game.gameMode as string;
  let maxWinnersOut = game.maxWinners;
  if (rounds?.length) {
    const r = rounds[(currentRound - 1)];
    if (r) {
      gameModeOut = r.game_mode as string;
      maxWinnersOut = r.max_winners;
    }
  }
  return {
    id: game.id,
    title: game.title,
    type: computeGameType(new Date(game.drawDate)),
    status: game.status,
    prize_amount: computePrizeAmount(game.prizeAmount, rounds),
    card_price: parseFloat(game.cardPrice),
    draw_date: game.drawDate,
    participant_count: game.participantCount,
    unique_participants: extras.uniqueParticipants ?? game.participantCount,
    online_count: extras.onlineCount ?? 0,
    stream_url_youtube: game.streamUrlYoutube ?? null,
    stream_url_tiktok: game.streamUrlTiktok ?? null,
    stream_url_facebook: game.streamUrlFacebook ?? null,
    game_mode: gameModeOut,
    max_winners: maxWinnersOut,
    prizes: (game.prizes as Array<{ place: number; amount: number }>) ?? [],
    rounds: serializeRounds(game.id, rounds, (game.updatedAt ?? game.createdAt).getTime()) ?? null,
    current_round: currentRound,
    total_rounds: totalRounds,
    round_history: [],
    slug: game.slug ?? null,
    cover_image_url: game.hasCoverImage ? `/api/games/${game.id}/cover-image?v=${(game.updatedAt ?? game.createdAt).getTime()}` : null,
    prize_image_url: game.hasPrizeImage ? `/api/games/${game.id}/prize-image?v=${(game.updatedAt ?? game.createdAt).getTime()}` : null,
    prize_type: game.prizeType ?? "cash",
    prize_physical_name: game.prizePhysicalName ?? null,
    is_private: game.isPrivate ?? false,
    called_numbers: game.calledNumbers ?? [],
    created_at: game.createdAt,
  };
}

router.get("/", async (req: AuthRequest, res) => {
  const query = ListGamesQueryParams.safeParse(req.query);
  let statusConditions = [];
  const filterType = query.success && query.data.type ? query.data.type : null;
  if (query.success) {
    if (query.data.status) statusConditions.push(eq(gamesTable.status, query.data.status as "upcoming" | "active" | "finished"));
  }

  // Select solo los campos necesarios — excluye coverImageUrl/prizeImageUrl (base64) y roundHistory
  const listCols = {
    id: gamesTable.id,
    title: gamesTable.title,
    status: gamesTable.status,
    prizeAmount: gamesTable.prizeAmount,
    cardPrice: gamesTable.cardPrice,
    drawDate: gamesTable.drawDate,
    participantCount: gamesTable.participantCount,
    streamUrlYoutube: gamesTable.streamUrlYoutube,
    streamUrlTiktok: gamesTable.streamUrlTiktok,
    streamUrlFacebook: gamesTable.streamUrlFacebook,
    gameMode: gamesTable.gameMode,
    maxWinners: gamesTable.maxWinners,
    prizes: gamesTable.prizes,
    rounds: gamesTable.rounds,
    currentRound: gamesTable.currentRound,
    slug: gamesTable.slug,
    hasCoverImage: sql<boolean>`(cover_image_url IS NOT NULL)`,
    hasPrizeImage: sql<boolean>`(prize_image_url IS NOT NULL)`,
    isPrivate: gamesTable.isPrivate,
    calledNumbers: gamesTable.calledNumbers,
    createdAt: gamesTable.createdAt,
    updatedAt: gamesTable.updatedAt,
    prizeType: gamesTable.prizeType,
    prizePhysicalName: gamesTable.prizePhysicalName,
  };

  const games = statusConditions.length
    ? await db.select(listCols).from(gamesTable).where(and(...statusConditions)).orderBy(desc(gamesTable.drawDate))
    : await db.select(listCols).from(gamesTable).orderBy(desc(gamesTable.drawDate));

  // Strip base64 prize images from rounds immediately after DB load.
  // serializeRounds() only checks truthiness of prize_image_url to build the URL endpoint,
  // so replacing the large base64 string with "1" is safe and saves significant heap memory
  // (each round image can be 100 KB–2 MB; the list is polled every few seconds by the admin).
  for (const g of games) {
    if (!g.rounds) continue;
    for (const r of g.rounds as RoundConfig[]) {
      if (r.prize_image_url && r.prize_image_url.length > 10) r.prize_image_url = "1";
    }
  }

  // Unique participants per game (one query for all games)
  const uniqueRows = await db.execute(
    sql`SELECT game_id, COUNT(DISTINCT user_id)::int AS cnt FROM cards WHERE payment_status = 'paid' AND status = 'active' GROUP BY game_id`
  );
  const uniqueMap = new Map<number, number>();
  for (const row of uniqueRows.rows) uniqueMap.set(row.game_id as number, row.cnt as number);

  let result = games.map(g => formatGameForList(g, {
    uniqueParticipants: uniqueMap.get(g.id) ?? 0,
    onlineCount: getOnlineCount(g.id),
  }));
  if (filterType) result = result.filter(g => g.type === filterType);
  res.json(result);
});

async function syncPredefinedCards(gameId: number, rounds: RoundConfig[]) {
  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i];
    const roundNum = i + 1;
    const userId = round.predefined_winner_user_id;
    if (!userId) continue;

    const existing = await db.select().from(cardsTable)
      .where(and(
        eq(cardsTable.gameId, gameId),
        eq(cardsTable.isPredefined, true),
        eq(cardsTable.predefinedRound, roundNum),
      )).limit(1);

    if (!existing.length) {
      const numbers: number[][] = [];
      const ranges = [[1,15],[16,30],[31,45],[46,60],[61,75]];
      for (let col = 0; col < 5; col++) {
        const [min, max] = ranges[col];
        const pool = Array.from({ length: max - min + 1 }, (_, k) => k + min);
        const picked: number[] = [];
        for (let row = 0; row < 5; row++) {
          const idx = Math.floor(Math.random() * pool.length);
          picked.push(pool.splice(idx, 1)[0]);
        }
        numbers.push(picked);
      }
      const transposed: number[][] = [];
      for (let row = 0; row < 5; row++) {
        transposed.push([]);
        for (let col = 0; col < 5; col++) transposed[row].push(numbers[col][row]);
      }
      transposed[2][2] = 0;
      await db.insert(cardsTable).values({
        gameId,
        userId,
        numbers: transposed,
        status: "active",
        paymentStatus: "paid",
        isPredefined: true,
        predefinedRound: roundNum,
      });
    }
  }
}

router.post("/", requireAdmin, async (req: AuthRequest, res) => {
  const parsed = CreateGameBody.safeParse(req.body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    res.status(400).json({ error: `Datos inválidos — ${issues}` });
    return;
  }
  const data = parsed.data;
  const rounds = (data.rounds as RoundConfig[] | undefined) ?? null;

  const isPrivate = Boolean((req.body as any).is_private ?? false);
  const authorizedActivatorIds: number[] = Array.isArray((req.body as any).authorized_activator_ids)
    ? (req.body as any).authorized_activator_ids.map(Number).filter(Boolean)
    : [];

  const bodyAny = req.body as any;
  const [game] = await db.insert(gamesTable).values({
    title: data.title,
    type: computeGameType(new Date(data.draw_date)),
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
    prizeType: (bodyAny.prize_type ?? "cash") as "cash" | "physical" | "mixed",
    prizePhysicalName: bodyAny.prize_physical_name ?? null,
    prizePhysicalDescription: bodyAny.prize_physical_description ?? null,
    prizeImageUrl: bodyAny.prize_image_url ?? null,
    isPrivate,
  }).returning();
  const [gameWithSlug] = await db.update(gamesTable)
    .set({ slug: generateSlug(game.title) })
    .where(eq(gamesTable.id, game.id))
    .returning();

  if (rounds?.length) {
    await syncPredefinedCards(game.id, rounds);
  }

  // Guardar activadores autorizados para juegos privados
  if (isPrivate && authorizedActivatorIds.length) {
    await db.insert(gameAuthorizedActivatorsTable).values(
      authorizedActivatorIds.map(uid => ({ gameId: game.id, activatorUserId: uid }))
    );
  }

  // Push automático a todos los usuarios sobre el nuevo juego
  const drawDate = new Date(data.draw_date);
  const dateStr = drawDate.toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long" });
  const finalGame = gameWithSlug ?? game;
  // Calcular etiqueta de premio correcta según tipo y rondas
  const pushPrizeType = bodyAny.prize_type ?? "cash";
  const pushPhysicalName: string | null = bodyAny.prize_physical_name ?? null;
  let prizeLabel: string;
  if (rounds?.length) {
    const totalCash = rounds.reduce((s: number, r: RoundConfig) => s + (r.prize_amount ?? 0), 0);
    const physicalCount = rounds.filter((r: RoundConfig) => r.prize_type !== "cash").length;
    if (totalCash > 0 && physicalCount > 0) prizeLabel = `Bs ${totalCash.toFixed(0)} + ${physicalCount} premio${physicalCount > 1 ? "s" : ""} físico${physicalCount > 1 ? "s" : ""}`;
    else if (totalCash > 0) prizeLabel = `Premio Bs ${totalCash.toFixed(0)}`;
    else prizeLabel = `${physicalCount} premio${physicalCount > 1 ? "s" : ""} físico${physicalCount > 1 ? "s" : ""}`;
  } else if (pushPrizeType === "physical") {
    prizeLabel = pushPhysicalName ? `Premio: ${pushPhysicalName}` : "Premio físico";
  } else if (pushPrizeType === "mixed") {
    prizeLabel = `Bs ${data.prize_amount.toFixed(0)} + ${pushPhysicalName ?? "objeto físico"}`;
  } else {
    prizeLabel = `Premio Bs ${data.prize_amount.toFixed(0)}`;
  }
  sendPushToAll({
    title: "🎱 ¡Nuevo bingo disponible!",
    body: `${data.title} — ${prizeLabel}. El ${dateStr}. ¡Compra tu cartón ahora!`,
    url: `/juego/${finalGame.slug ?? finalGame.id}`,
  }).catch(() => {});

  res.status(201).json(formatGame(finalGame));
});

router.get("/:id", async (req: AuthRequest, res) => {
  const rawId = String(req.params.id);
  const numericId = parseInt(rawId);
  let games: (typeof gamesTable.$inferSelect)[];

  if (!isNaN(numericId)) {
    games = await db.select().from(gamesTable).where(eq(gamesTable.id, numericId)).limit(1);
  } else {
    games = await db.select().from(gamesTable).where(eq(gamesTable.slug, rawId)).limit(1);
  }
  if (!games.length) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  const gameId = games[0].id;
  const uniq = await db.execute(
    sql`SELECT COUNT(DISTINCT user_id)::int AS cnt FROM cards WHERE game_id = ${gameId} AND payment_status = 'paid' AND status = 'active'`
  );
  const uniqueParticipants = (uniq.rows[0]?.cnt as number) ?? 0;
  res.json(formatGame(games[0], { uniqueParticipants, onlineCount: getOnlineCount(gameId) }));
});

// ── Cover image — sirve el binario sin pasar la base64 por JSON ───────────────
router.get("/:id/cover-image", async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).end(); return; }
  const rows = await db.select({ coverImageUrl: gamesTable.coverImageUrl })
    .from(gamesTable).where(eq(gamesTable.id, id)).limit(1);
  const raw = rows[0]?.coverImageUrl;
  if (!raw) { res.status(404).end(); return; }
  if (raw.startsWith("data:")) {
    const commaIdx = raw.indexOf(",");
    const mimeMatch = raw.slice(0, commaIdx).match(/data:([^;]+)/);
    const mime = mimeMatch?.[1] ?? "image/webp";
    const buf = Buffer.from(raw.slice(commaIdx + 1), "base64");
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(buf);
    return;
  }
  if (raw.startsWith("http")) { res.redirect(raw); return; }
  res.status(404).end();
});

// ── Prize image por ronda ─────────────────────────────────────────────────────
router.get("/:id/rounds/:index/prize-image", async (req, res) => {
  const id = parseInt(String(req.params.id));
  const index = parseInt(String(req.params.index));
  if (isNaN(id) || isNaN(index)) { res.status(400).end(); return; }
  const rows = await db.select({ rounds: gamesTable.rounds })
    .from(gamesTable).where(eq(gamesTable.id, id)).limit(1);
  const rounds = rows[0]?.rounds as RoundConfig[] | null | undefined;
  const raw = (rounds?.[index] as any)?.prize_image_url as string | undefined;
  if (!raw) { res.status(404).end(); return; }
  if (raw.startsWith("data:")) {
    const commaIdx = raw.indexOf(",");
    const mimeMatch = raw.slice(0, commaIdx).match(/data:([^;]+)/);
    const mime = mimeMatch?.[1] ?? "image/webp";
    const buf = Buffer.from(raw.slice(commaIdx + 1), "base64");
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(buf);
    return;
  }
  if (raw.startsWith("http")) { res.redirect(raw); return; }
  res.status(404).end();
});

// ── Prize image ───────────────────────────────────────────────────────────────
router.get("/:id/prize-image", async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).end(); return; }
  const rows = await db.select({ prizeImageUrl: gamesTable.prizeImageUrl })
    .from(gamesTable).where(eq(gamesTable.id, id)).limit(1);
  const raw = rows[0]?.prizeImageUrl;
  if (!raw) { res.status(404).end(); return; }
  if (raw.startsWith("data:")) {
    const commaIdx = raw.indexOf(",");
    const mimeMatch = raw.slice(0, commaIdx).match(/data:([^;]+)/);
    const mime = mimeMatch?.[1] ?? "image/webp";
    const buf = Buffer.from(raw.slice(commaIdx + 1), "base64");
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(buf);
    return;
  }
  if (raw.startsWith("http")) { res.redirect(raw); return; }
  res.status(404).end();
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
  if (data.title) { updateData.title = data.title; updateData.slug = generateSlug(data.title); }
  if (data.prize_amount !== undefined) updateData.prizeAmount = String(data.prize_amount);
  if (data.card_price !== undefined) updateData.cardPrice = String(data.card_price);
  if (data.draw_date) updateData.drawDate = new Date(data.draw_date);
  if (data.stream_url_youtube !== undefined) updateData.streamUrlYoutube = data.stream_url_youtube;
  if (data.stream_url_tiktok !== undefined) updateData.streamUrlTiktok = data.stream_url_tiktok;
  if (data.stream_url_facebook !== undefined) updateData.streamUrlFacebook = data.stream_url_facebook;
  if (data.game_mode) updateData.gameMode = data.game_mode as "horizontal" | "vertical" | "diagonal" | "quina" | "full_card";
  if (data.max_winners !== undefined) updateData.maxWinners = data.max_winners;
  if (data.status) updateData.status = data.status as "upcoming" | "active" | "finished";
  if (data.cover_image_url !== undefined) {
    // Si el frontend devuelve la URL del API (no base64), preservar la imagen existente
    if (data.cover_image_url?.startsWith("/api/")) {
      // no sobreescribir — mantener lo que hay en DB
    } else {
      updateData.coverImageUrl = data.cover_image_url ?? null;
    }
  }
  const patchAny = req.body as any;
  if (patchAny.prize_type !== undefined) updateData.prizeType = patchAny.prize_type as "cash" | "physical" | "mixed";
  if (patchAny.prize_physical_name !== undefined) updateData.prizePhysicalName = patchAny.prize_physical_name ?? null;
  if (patchAny.prize_physical_description !== undefined) updateData.prizePhysicalDescription = patchAny.prize_physical_description ?? null;
  if (patchAny.prize_image_url !== undefined) {
    // Si el frontend devuelve la URL del API (no base64), preservar la imagen existente
    if (!patchAny.prize_image_url?.startsWith("/api/")) {
      updateData.prizeImageUrl = patchAny.prize_image_url ?? null;
    }
  }
  if (data.rounds !== undefined) {
    let newRounds = (data.rounds as RoundConfig[] | null) ?? null;
    // Preservar imágenes existentes cuando el frontend devuelve la URL de la API
    if (newRounds?.some(r => r.prize_image_url?.startsWith("/api/"))) {
      const existingRows = await db.select({ rounds: gamesTable.rounds })
        .from(gamesTable).where(eq(gamesTable.id, p.data.id)).limit(1);
      const existingRounds = existingRows[0]?.rounds as RoundConfig[] | null | undefined;
      if (existingRounds) {
        newRounds = newRounds.map((r, i) => ({
          ...r,
          prize_image_url: r.prize_image_url?.startsWith("/api/")
            ? (existingRounds[i]?.prize_image_url ?? undefined)
            : r.prize_image_url ?? undefined,
        }));
      }
    }
    updateData.rounds = newRounds ?? null;
  }
  const patchIsPrivate = (req.body as any).is_private;
  if (patchIsPrivate !== undefined) updateData.isPrivate = Boolean(patchIsPrivate);
  const [game] = await db.update(gamesTable).set(updateData).where(eq(gamesTable.id, p.data.id)).returning();
  if (!game) { res.status(404).json({ error: "Juego no encontrado" }); return; }

  if (data.rounds !== undefined) {
    await db.execute(
      sql`DELETE FROM cards WHERE game_id = ${p.data.id} AND is_predefined = true AND status != 'winner'`
    );
    const newRounds = (data.rounds as RoundConfig[] | null) ?? [];
    if (newRounds.length) {
      await syncPredefinedCards(p.data.id, newRounds);
    }
  }

  // Sincronizar activadores autorizados si se enviaron
  const patchActivatorIds = (req.body as any).authorized_activator_ids;
  if (Array.isArray(patchActivatorIds)) {
    await db.delete(gameAuthorizedActivatorsTable).where(eq(gameAuthorizedActivatorsTable.gameId, p.data.id));
    const ids = patchActivatorIds.map(Number).filter(Boolean);
    if (ids.length) {
      await db.insert(gameAuthorizedActivatorsTable).values(
        ids.map(uid => ({ gameId: p.data.id, activatorUserId: uid }))
      );
    }
  }

  res.json(formatGame(game));
});

// ── Session cache ────────────────────────────────────────────────────────────
// Los jugadores hacen polling cada 3 s. Con N jugadores en un juego, sin caché
// habría N queries DB por cada ciclo de 3 s. Con caché de 2 s → siempre 1 query
// DB por juego activo, independientemente de cuántos jugadores estén conectados.
interface SessionCacheEntry {
  data: object;
  expiresAt: number;
}
const SESSION_CACHE = new Map<number, SessionCacheEntry>();
const SESSION_CACHE_TTL_MS = 2_000;

// Invalida la caché de sesión para un juego (llamar tras cantar número, cambio de ronda, etc.)
export function invalidateSessionCache(gameId: number): void {
  SESSION_CACHE.delete(gameId);
}

router.get("/:id/session", requireAuth, async (req: AuthRequest, res) => {
  const p = GetGameSessionParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }

  // Registrar presencia siempre (antes de la caché)
  if (req.userId) {
    let gm = presenceMap.get(p.data.id);
    if (!gm) { gm = new Map(); presenceMap.set(p.data.id, gm); }
    gm.set(req.userId, Date.now());
  }

  // Caché hit → responde sin tocar la DB
  const cached = SESSION_CACHE.get(p.data.id);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  // Caché miss → query DB con solo los campos necesarios
  const games = await db
    .select({
      id: gamesTable.id,
      status: gamesTable.status,
      calledNumbers: gamesTable.calledNumbers,
      rounds: gamesTable.rounds,
      currentRound: gamesTable.currentRound,
      updatedAt: gamesTable.updatedAt,
      gameMode: gamesTable.gameMode,
      maxWinners: gamesTable.maxWinners,
      prizeAmount: gamesTable.prizeAmount,
      prizeType: gamesTable.prizeType,
      prizePhysicalName: gamesTable.prizePhysicalName,
    })
    .from(gamesTable)
    .where(eq(gamesTable.id, p.data.id))
    .limit(1);

  if (!games.length) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  const game = games[0];

  const called = game.status === "active" ? (game.calledNumbers ?? []) : [];
  const rounds = game.rounds as RoundConfig[] | null | undefined;
  const totalRounds = rounds?.length ?? 1;
  const currentRound = game.currentRound ?? 1;

  // getCurrentRoundConfig necesita el shape completo — reconstruimos lo mínimo
  let gameModeOut = game.gameMode as string;
  let roundPrizeAmount = parseFloat(game.prizeAmount);
  if (rounds?.length) {
    const r = rounds[(currentRound - 1)];
    if (r) {
      gameModeOut = r.game_mode as string;
      if (r.prize_amount !== undefined) roundPrizeAmount = parseFloat(String(r.prize_amount));
    }
  }

  const data = {
    game_id: game.id,
    game_status: game.status,
    called_numbers: called,
    last_called_number: called.length ? called[called.length - 1] : null,
    game_mode: gameModeOut,
    current_round: currentRound,
    total_rounds: totalRounds,
    updated_at: game.updatedAt,
    prize_type: game.prizeType ?? "cash",
    prize_physical_name: game.prizePhysicalName ?? null,
    prize_amount: roundPrizeAmount,
  };

  SESSION_CACHE.set(p.data.id, { data, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
  res.json(data);
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
      prize_type: winnersTable.prizeType,
      prize_physical_name: winnersTable.prizePhysicalName,
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
  invalidateSessionCache(p.data.id);
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
  invalidateSessionCache(p.data.id);
  res.json(formatGame(game));
  // Notify players who bought cards for this game
  const players = await db.selectDistinct({ userId: cardsTable.userId }).from(cardsTable)
    .where(and(eq(cardsTable.gameId, p.data.id), eq(cardsTable.status, "active")));
  const playerIds = players.map(r => r.userId);
  sendPushToUsers(playerIds, {
    title: "🎱 ¡El bingo empezó!",
    body: `${game.title} ya está en vivo. ¡Entrá a jugar ahora!`,
    url: `/juego/${game.id}/jugar`,
  }).catch(() => {});
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

  invalidateSessionCache(p.data.id);
  req.log.info({ gameId: p.data.id, newRound: currentRound + 1 }, "Ronda avanzada por admin");
  res.json(formatGame(updated));
  // Notify active players that the board reset
  const players = await db.selectDistinct({ userId: cardsTable.userId }).from(cardsTable)
    .where(and(eq(cardsTable.gameId, p.data.id), eq(cardsTable.status, "active")));
  sendPushToUsers(players.map(r => r.userId), {
    title: "🔄 Nueva ronda",
    body: `${updated.title} — Ronda ${currentRound + 1} comenzó. ¡Los números se reiniciaron!`,
    url: `/juego/${updated.id}/jugar`,
  }).catch(() => {});
});

router.post("/:id/finish", requireAdmin, async (req: AuthRequest, res) => {
  const p = FinishGameParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }

  // Collect players before expiring cards
  const players = await db.selectDistinct({ userId: cardsTable.userId }).from(cardsTable)
    .where(and(eq(cardsTable.gameId, p.data.id), eq(cardsTable.status, "active")));

  const [game] = await db.update(gamesTable).set({ status: "finished" }).where(eq(gamesTable.id, p.data.id)).returning();
  if (!game) { res.status(404).json({ error: "Juego no encontrado" }); return; }

  await db.update(cardsTable).set({ status: "expired" })
    .where(and(eq(cardsTable.gameId, p.data.id), eq(cardsTable.status, "active")));

  // Free in-memory presence data and session cache for this game
  presenceMap.delete(p.data.id);
  invalidateSessionCache(p.data.id);

  res.json(formatGame(game));
  const playerIds = players.map(r => r.userId);
  sendPushToUsers(playerIds, {
    title: "🏁 Juego finalizado",
    body: `${game.title} terminó. Revisá los resultados y tu billetera.`,
    url: `/juego/${game.id}`,
  }).catch(() => {});
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
    // Desvincular ganadores del juego — preserva historial para stats/billetera
    await tx.update(winnersTable).set({ gameId: null }).where(eq(winnersTable.gameId, gameId));
    // Marcar cartones como expirados — preserva historial de compras, pagos y ganadores
    await tx.update(cardsTable)
      .set({ status: "expired" })
      .where(eq(cardsTable.gameId, gameId));
    // Cancelar solicitudes de pago manual (pendientes y rechazadas) — el juego se reinicia
    await tx.update(manualPaymentRequestsTable)
      .set({ status: "cancelled", adminNotes: "Juego reseteado por el administrador" })
      .where(and(
        eq(manualPaymentRequestsTable.gameId, gameId),
        inArray(manualPaymentRequestsTable.status, ["pending", "rejected"]),
      ));
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
  invalidateSessionCache(gameId);
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
      .where(and(
        eq(cardsTable.gameId, gameId),
        eq(cardsTable.paymentStatus, "paid"),
        ne(cardsTable.status, "expired"),
      ))
      .limit(1);
    if (paidCards.length) {
      res.status(409).json({ error: "No se puede eliminar: este juego tiene cartones pagados activos. Finalízalo primero antes de eliminar." });
      return;
    }
  }

  await db.transaction(async (tx) => {
    // 1. Desvincular referral_transactions del juego Y de los ganadores antes de borrarlos
    await tx.update(referralTransactionsTable)
      .set({ gameId: null, winnerId: null })
      .where(eq(referralTransactionsTable.gameId, gameId));
    // 2. Desvincular ganadores del juego — preserva historial para stats/billetera
    await tx.update(winnersTable).set({ gameId: null }).where(eq(winnersTable.gameId, gameId));
    // 3. Borrar solicitudes de pago manual y ventas de activadores
    await tx.delete(manualPaymentRequestsTable).where(eq(manualPaymentRequestsTable.gameId, gameId));
    await tx.delete(activatorCardSalesTable).where(eq(activatorCardSalesTable.gameId, gameId));
    // 4. Borrar cartones y finalmente el juego
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

  // Free in-memory presence data for this game
  presenceMap.delete(gameId);

  req.log.info({ gameId }, "Juego eliminado por admin");
  res.json({ id: gameId, deleted: true });
});

export { router as gamesRouter };
