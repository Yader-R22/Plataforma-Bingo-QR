import {
  pgTable,
  serial,
  text,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const feedItemsTable = pgTable("feed_items", {
  id: serial("id").primaryKey(),
  type: text("type", { enum: ["winner", "withdrawal"] }).notNull(),
  message: text("message").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }),
  userDisplayName: text("user_display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFeedItemSchema = createInsertSchema(feedItemsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertFeedItem = z.infer<typeof insertFeedItemSchema>;
export type FeedItem = typeof feedItemsTable.$inferSelect;
