import {
  pgTable,
  serial,
  integer,
  numeric,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { gamesTable } from "./games";
import { winnersTable } from "./winners";

export const referralTransactionsTable = pgTable("referral_transactions", {
  id: serial("id").primaryKey(),
  type: text("type", { enum: ["welcome_bonus", "commission"] }).notNull(),
  activatorId: integer("activator_id").notNull().references(() => usersTable.id),
  referredUserId: integer("referred_user_id").notNull().references(() => usersTable.id),
  gameId: integer("game_id").references(() => gamesTable.id),
  winnerId: integer("winner_id").references(() => winnersTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  commissionPercentage: numeric("commission_percentage", { precision: 5, scale: 2 }),
  description: text("description").notNull(),
  deductedFromPrize: boolean("deducted_from_prize").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReferralTransaction = typeof referralTransactionsTable.$inferSelect;
