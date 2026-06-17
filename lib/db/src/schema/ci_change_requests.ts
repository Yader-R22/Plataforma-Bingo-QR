import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const ciChangeRequestsTable = pgTable("ci_change_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  currentCi: text("current_ci").notNull(),
  requestedCi: text("requested_ci").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const insertCiChangeRequestSchema = createInsertSchema(ciChangeRequestsTable).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
  status: true,
  adminNotes: true,
});

export type InsertCiChangeRequest = z.infer<typeof insertCiChangeRequestSchema>;
export type CiChangeRequest = typeof ciChangeRequestsTable.$inferSelect;
