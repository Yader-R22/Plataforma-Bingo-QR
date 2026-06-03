import { Router } from "express";
import { db, feedItemsTable, winnersTable, withdrawalsTable, usersTable, gamesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { desc, sql } from "drizzle-orm";

const router = Router();

router.get("/recent", async (req, res) => {
  const items = await db.select().from(feedItemsTable).orderBy(desc(feedItemsTable.createdAt)).limit(20);
  res.json({
    items: items.map(item => ({
      id: item.id,
      type: item.type,
      message: item.message,
      amount: item.amount ? parseFloat(item.amount) : null,
      user_display_name: item.userDisplayName ?? null,
      created_at: item.createdAt,
    })),
  });
});

router.get("/stats", async (req, res) => {
  const totalWinnersResult = await db.select({ count: sql<number>`count(*)` })
    .from(winnersTable).where(eq(winnersTable.validated, true));
  const totalPrizesResult = await db.select({ total: sql<string>`coalesce(sum(prize_amount), 0)` })
    .from(winnersTable).where(eq(winnersTable.validated, true));
  const activePlayers = await db.select({ count: sql<number>`count(*)` })
    .from(usersTable).where(eq(usersTable.status, "active"));
  const upcomingGames = await db.select({ count: sql<number>`count(*)` })
    .from(gamesTable).where(eq(gamesTable.status, "upcoming"));

  res.json({
    total_winners: Number(totalWinnersResult[0]?.count ?? 0),
    total_prizes_paid: parseFloat(totalPrizesResult[0]?.total ?? "0"),
    active_players: Number(activePlayers[0]?.count ?? 0),
    upcoming_games: Number(upcomingGames[0]?.count ?? 0),
  });
});

export { router as feedRouter };
