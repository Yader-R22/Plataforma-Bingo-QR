import {
  pgTable,
  serial,
  integer,
  numeric,
  boolean,
  timestamp,
  text,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { gamesTable } from "./games";
import { cardsTable } from "./cards";

export const winnersTable = pgTable("winners", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => gamesTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  cardId: integer("card_id").notNull().unique().references(() => cardsTable.id),
  place: integer("place").notNull().default(1),
  prizeAmount: numeric("prize_amount", { precision: 10, scale: 2 }).notNull(),
  claimedAtMs: text("claimed_at_ms").notNull(),
  validated: boolean("validated").notNull().default(false),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWinnerSchema = createInsertSchema(winnersTable).omit({
  id: true,
  createdAt: true,
  validated: true,
});

export type InsertWinner = z.infer<typeof insertWinnerSchema>;
export type Winner = typeof winnersTable.$inferSelect;
