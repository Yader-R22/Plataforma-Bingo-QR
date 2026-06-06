import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gameCategoriesTable = pgTable("game_categories", {
  id: serial("id").primaryKey(),
  type: text("type", { enum: ["daily", "weekly", "monthly"] }).notNull().unique(),
  label: text("label").notNull(),
  emoji: text("emoji").notNull().default("🎱"),
  description: text("description").notNull().default(""),
  colorFrom: text("color_from").notNull().default("#1a0050"),
  colorTo: text("color_to").notNull().default("#3b00b8"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  streamUrlYoutube: text("stream_url_youtube"),
  streamUrlTiktok: text("stream_url_tiktok"),
  streamUrlFacebook: text("stream_url_facebook"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGameCategorySchema = createInsertSchema(gameCategoriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGameCategory = z.infer<typeof insertGameCategorySchema>;
export type GameCategory = typeof gameCategoriesTable.$inferSelect;
