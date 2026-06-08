import {
  pgTable,
  text,
  serial,
  timestamp,
  numeric,
  integer,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gamesTable = pgTable("games", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type", { enum: ["daily", "weekly", "monthly"] }).notNull(),
  status: text("status", { enum: ["upcoming", "active", "finished"] }).notNull().default("upcoming"),
  prizeAmount: numeric("prize_amount", { precision: 10, scale: 2 }).notNull(),
  cardPrice: numeric("card_price", { precision: 10, scale: 2 }).notNull(),
  drawDate: timestamp("draw_date", { withTimezone: true }).notNull(),
  streamUrlYoutube: text("stream_url_youtube"),
  streamUrlTiktok: text("stream_url_tiktok"),
  streamUrlFacebook: text("stream_url_facebook"),
  gameMode: text("game_mode", {
    enum: ["horizontal", "vertical", "diagonal", "quina", "full_card"],
  }).notNull().default("full_card"),
  maxWinners: integer("max_winners").notNull().default(1),
  prizes: jsonb("prizes").$type<Array<{ place: number; amount: number }>>().default([]),
  calledNumbers: integer("called_numbers").array().notNull().default([]),
  participantCount: integer("participant_count").notNull().default(0),
  coverImageUrl: text("cover_image_url"),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGameSchema = createInsertSchema(gamesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  calledNumbers: true,
  participantCount: true,
});

export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof gamesTable.$inferSelect;
