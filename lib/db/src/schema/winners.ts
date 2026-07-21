import {
  pgTable,
  serial,
  integer,
  numeric,
  boolean,
  timestamp,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { gamesTable } from "./games";
import { cardsTable } from "./cards";

export const winnersTable = pgTable("winners", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").references(() => gamesTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  cardId: integer("card_id").references(() => cardsTable.id),
  round: integer("round").notNull().default(1),
  place: integer("place").notNull().default(1),
  prizeAmount: numeric("prize_amount", { precision: 10, scale: 2 }).notNull(),
  claimedAtMs: text("claimed_at_ms").notNull(),
  validated: boolean("validated").notNull().default(false),
  isHistorical: boolean("is_historical").notNull().default(false),
  adminNotes: text("admin_notes"),
  prizeType: text("prize_type", { enum: ["cash", "physical", "mixed"] }),
  prizePhysicalName: text("prize_physical_name"),
  deliveryStatus: text("delivery_status", { enum: ["pending", "address_submitted", "shipped", "delivered"] }),
  deliveryAddress: text("delivery_address"),
  deliveryPhone: text("delivery_phone"),
  deliveryReceiptUrl: text("delivery_receipt_url"),
  deliveryNotes: text("delivery_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("winners_card_round_uniq").on(table.cardId, table.round),
]);

export const insertWinnerSchema = createInsertSchema(winnersTable).omit({
  id: true,
  createdAt: true,
  validated: true,
});

export type InsertWinner = z.infer<typeof insertWinnerSchema>;
export type Winner = typeof winnersTable.$inferSelect;
