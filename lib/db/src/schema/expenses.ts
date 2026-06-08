import {
  pgTable,
  serial,
  numeric,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const operatingExpensesTable = pgTable("operating_expenses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  frequency: text("frequency", {
    enum: ["daily", "weekly", "monthly", "yearly", "one_time"],
  }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OperatingExpense = typeof operatingExpensesTable.$inferSelect;
