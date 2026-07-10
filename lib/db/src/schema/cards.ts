import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  numeric,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { gamesTable } from "./games";

export const cardsTable = pgTable("cards", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull().references(() => gamesTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  numbers: integer("numbers").array().array().notNull(),
  markedNumbers: integer("marked_numbers").array().notNull().default([]),
  status: text("status", {
    enum: ["pending_payment", "active", "winner", "expired"],
  }).notNull().default("pending_payment"),
  paymentStatus: text("payment_status", {
    enum: ["pending", "paid", "failed"],
  }).notNull().default("pending"),
  checkoutId: text("checkout_id"),
  bonusAmountUsed: numeric("bonus_amount_used", { precision: 10, scale: 2 }).notNull().default("0"),
  adminCreditAmountUsed: numeric("admin_credit_amount_used", { precision: 10, scale: 2 }).notNull().default("0"),
  isPredefined: boolean("is_predefined").notNull().default(false),
  predefinedRound: integer("predefined_round"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCardSchema = createInsertSchema(cardsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  markedNumbers: true,
  status: true,
  paymentStatus: true,
});

export type InsertCard = z.infer<typeof insertCardSchema>;
export type Card = typeof cardsTable.$inferSelect;
