import { db, gamesTable, winnersTable, cardsTable, auditLogsTable } from "@workspace/db";
import { and, eq, lte, isNotNull } from "drizzle-orm";
import { logger } from "./logger";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

async function deleteStaleFinishedGames() {
  const cutoff = new Date(Date.now() - FOUR_HOURS_MS);
  try {
    const stale = await db
      .select({ id: gamesTable.id, title: gamesTable.title })
      .from(gamesTable)
      .where(and(
        eq(gamesTable.status, "finished"),
        isNotNull(gamesTable.finishedAt),
        lte(gamesTable.finishedAt, cutoff),
      ));

    for (const game of stale) {
      await db.transaction(async (tx) => {
        await tx.delete(winnersTable).where(eq(winnersTable.gameId, game.id));
        await tx.delete(cardsTable).where(eq(cardsTable.gameId, game.id));
        await tx.insert(auditLogsTable).values({
          action: "game_auto_deleted",
          userId: null,
          gameId: null,
          details: { gameId: game.id, title: game.title, reason: "finished_4h_ago" },
          ipAddress: "system",
        });
        await tx.delete(gamesTable).where(eq(gamesTable.id, game.id));
      });
      logger.info({ gameId: game.id, title: game.title }, "Auto-deleted stale finished game (4h)");
    }
  } catch (err) {
    logger.error({ err }, "Error during stale game cleanup");
  }
}

export function startFinishedGameCleanup() {
  void deleteStaleFinishedGames();
  setInterval(() => void deleteStaleFinishedGames(), CHECK_INTERVAL_MS);
  logger.info("Finished game auto-cleanup scheduled (every 15 min, 4h TTL)");
}
