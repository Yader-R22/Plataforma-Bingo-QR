import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { gamesTable } from "./games";

export const manualPaymentRequestsTable = pgTable("manual_payment_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  gameId: integer("game_id").notNull().references(() => gamesTable.id),
  quantity: integer("quantity").notNull(),
  expectedAmount: numeric("expected_amount", { precision: 10, scale: 2 }).notNull(),
  receiptUrl: text("receipt_url"),
  status: text("status", {
    enum: ["pending", "approved", "rejected"],
  }).notNull().default("pending"),
  adminNotes: text("admin_notes"),
  reviewedById: integer("reviewed_by_id").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ManualPaymentRequest = typeof manualPaymentRequestsTable.$inferSelect;
