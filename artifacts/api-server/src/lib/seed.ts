import { db, gameCategoriesTable } from "@workspace/db";
import { logger } from "./logger";

const DEFAULT_CATEGORIES: (typeof gameCategoriesTable.$inferInsert)[] = [
  { type: "daily", label: "Bingo Diario", emoji: "🌅", description: "Sorteos todos los días", colorFrom: "#1a0050", colorTo: "#3b00b8", sortOrder: 1, isActive: true },
  { type: "weekly", label: "Bingo Semanal", emoji: "🏆", description: "Grandes premios cada semana", colorFrom: "#7b1900", colorTo: "#d44000", sortOrder: 2, isActive: true },
  { type: "monthly", label: "Bingo Mensual", emoji: "👑", description: "El premio mayor del mes", colorFrom: "#005c2e", colorTo: "#00a854", sortOrder: 3, isActive: true },
];

export async function seedGameCategories() {
  try {
    await db.insert(gameCategoriesTable).values(DEFAULT_CATEGORIES).onConflictDoNothing({ target: gameCategoriesTable.type });
    logger.info("Game categories seed verified");
  } catch (err) {
    logger.error({ err }, "Failed to seed game categories");
  }
}
