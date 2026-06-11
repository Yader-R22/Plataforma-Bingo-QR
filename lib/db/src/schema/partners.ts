import {
  pgTable,
  serial,
  numeric,
  text,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const partnersTable = pgTable("partners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  identifier: text("identifier"),
  phone: text("phone"),
  sharePercentage: numeric("share_percentage", { precision: 5, scale: 2 }).notNull(),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partnerPaymentsTable = pgTable("partner_payments", {
  id: serial("id").primaryKey(),
  periodLabel: text("period_label").notNull(),
  periodFrom: timestamp("period_from", { withTimezone: true }).notNull(),
  periodTo: timestamp("period_to", { withTimezone: true }).notNull(),
  grossRevenue: numeric("gross_revenue", { precision: 10, scale: 2 }).notNull(),
  netProfit: numeric("net_profit", { precision: 10, scale: 2 }).notNull(),
  totalPaid: numeric("total_paid", { precision: 10, scale: 2 }).notNull(),
  partnersSnapshot: jsonb("partners_snapshot")
    .$type<Array<{ partner_id: number; name: string; identifier?: string; share_percentage: number; amount: number }>>()
    .notNull()
    .default([]),
  financeSnapshot: jsonb("finance_snapshot")
    .$type<{
      period: string;
      prizes_paid: number;
      prizes_count: number;
      withdrawals_paid: number;
      withdrawals_count: number;
      balance_in_circulation: number;
      users_with_balance: number;
      pending_withdrawals: number;
      pending_withdrawals_count: number;
      cards_sold: number;
      total_expenses: number;
      committed_prizes: number;
      distributable_profit: number;
      expenses_detail: any[];
      committed_prizes_detail: any[];
      games: any[];
    } | null>(),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Partner = typeof partnersTable.$inferSelect;
export type PartnerPayment = typeof partnerPaymentsTable.$inferSelect;
