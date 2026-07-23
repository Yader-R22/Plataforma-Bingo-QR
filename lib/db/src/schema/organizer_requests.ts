import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const organizerRequestsTable = pgTable("organizer_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  status: text("status", { enum: ["pending", "approved", "rejected", "completed"] }).notNull().default("pending"),
  adminNotes: text("admin_notes"),
  reviewedById: integer("reviewed_by_id").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  commissionPercentage: numeric("commission_percentage", { precision: 5, scale: 2 }),
  commissionPaidAt: timestamp("commission_paid_at", { withTimezone: true }),
  commissionAmount: numeric("commission_amount", { precision: 10, scale: 2 }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrganizerRequest = typeof organizerRequestsTable.$inferSelect;
