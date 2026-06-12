import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const bannersTable = pgTable("banners", {
  id: serial("id").primaryKey(),
  imageUrl: text("image_url").notNull(),
  mediaType: text("media_type").notNull().default("image"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Banner = typeof bannersTable.$inferSelect;
