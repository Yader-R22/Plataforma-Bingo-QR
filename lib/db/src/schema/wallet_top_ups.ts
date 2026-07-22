import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const walletTopUpsTable = pgTable("wallet_top_ups", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  checkoutId: text("checkout_id"),
  status: text("status", {
    enum: ["generated", "downloaded", "pending", "approved", "rejected", "refunded"],
  }).notNull().default("pending"),
  receiptUrl: text("receipt_url"),
  adminNotes: text("admin_notes"),
  reviewedById: integer("reviewed_by_id").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WalletTopUp = typeof walletTopUpsTable.$inferSelect;
