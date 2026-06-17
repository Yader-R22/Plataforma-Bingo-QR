import { Router } from "express";
import { db, feedItemsTable, winnersTable, withdrawalsTable, usersTable, gamesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { desc, sql } from "drizzle-orm";
import { getSiteName } from "../lib/getSiteName";

const router = Router();

router.get("/recent", async (req, res) => {
  const [items, siteName] = await Promise.all([
    db.select().from(feedItemsTable).orderBy(desc(feedItemsTable.createdAt)).limit(20),
    getSiteName(),
  ]);

  res.json({
    items: items.map(item => ({
      id: item.id,
      type: item.type,
      message: item.message?.replace(/Tu Bingazo/gi, siteName) ?? item.message,
      amount: item.amount ? parseFloat(item.amount) : null,
      user_display_name: item.userDisplayName ?? null,
      created_at: item.createdAt,
    })),
  });
});

router.get("/stats", async (req, res) => {
  const [winnersResult, activePlayers, scheduledPrizes] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(winnersTable),
    db.select({ count: sql<number>`count(*)` })
      .from(usersTable).where(eq(usersTable.status, "active")),
    db.select({ total: sql<string>`coalesce(sum(prize_amount), 0)` })
      .from(gamesTable)
      .where(sql`${gamesTable.status} IN ('upcoming', 'active')`),
  ]);

  res.json({
    total_winners: Number(winnersResult[0]?.count ?? 0),
    total_prizes_paid: parseFloat(scheduledPrizes[0]?.total ?? "0"),
    active_players: Number(activePlayers[0]?.count ?? 0),
  });
});

export { router as feedRouter };
