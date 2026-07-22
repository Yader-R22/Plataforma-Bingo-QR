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

export const activatorCardSalesTable = pgTable("activator_card_sales", {
  id: serial("id").primaryKey(),
  activatorUserId: integer("activator_user_id").notNull().references(() => usersTable.id),
  targetUserId: integer("target_user_id").notNull().references(() => usersTable.id),
  gameId: integer("game_id").notNull().references(() => gamesTable.id),
  quantity: integer("quantity").notNull(),
  originalPrice: numeric("original_price", { precision: 10, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  finalPrice: numeric("final_price", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method", { enum: ["enlazo", "static_qr"] }).notNull(),
  checkoutId: text("checkout_id"),
  receiptUrl: text("receipt_url"),
  cardIds: text("card_ids"),
  status: text("status", {
    enum: ["pending_payment", "paid", "pending_approval", "approved", "rejected"],
  }).notNull().default("pending_payment"),
  adminNotes: text("admin_notes"),
  reviewedById: integer("reviewed_by_id").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ActivatorCardSale = typeof activatorCardSalesTable.$inferSelect;
