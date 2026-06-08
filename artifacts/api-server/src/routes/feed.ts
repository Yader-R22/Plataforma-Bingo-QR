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
  const [winnersResult, activePlayers, upcomingGames] = await Promise.all([
    db.select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(prize_amount), 0)`,
    }).from(winnersTable),
    db.select({ count: sql<number>`count(*)` })
      .from(usersTable).where(eq(usersTable.status, "active")),
    db.select({ count: sql<number>`count(*)` })
      .from(gamesTable).where(eq(gamesTable.status, "upcoming")),
  ]);

  res.json({
    total_winners: Number(winnersResult[0]?.count ?? 0),
    total_prizes_paid: parseFloat(winnersResult[0]?.total ?? "0"),
    active_players: Number(activePlayers[0]?.count ?? 0),
    upcoming_games: Number(upcomingGames[0]?.count ?? 0),
  });
});

export { router as feedRouter };
