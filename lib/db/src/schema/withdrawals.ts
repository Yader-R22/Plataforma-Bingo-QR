import {
  pgTable,
  serial,
  integer,
  numeric,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const withdrawalsTable = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method", { enum: ["cash", "bank_transfer", "admin_credit", "admin_debit"] }).notNull(),
  status: text("status", { enum: ["pending", "paid", "rejected"] }).notNull().default("pending"),
  bankQrUrl: text("bank_qr_url"),
  bankAccountInfo: text("bank_account_info"),
  notes: text("notes"),
  paymentProofUrl: text("payment_proof_url"),
  withdrawalPin: text("withdrawal_pin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export const insertWithdrawalSchema = createInsertSchema(withdrawalsTable).omit({
  id: true,
  createdAt: true,
  paidAt: true,
  status: true,
});

export type InsertWithdrawal = z.infer<typeof insertWithdrawalSchema>;
export type Withdrawal = typeof withdrawalsTable.$inferSelect;
