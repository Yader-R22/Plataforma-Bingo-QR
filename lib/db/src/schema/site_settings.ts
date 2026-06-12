import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const siteSettingsTable = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  siteName: text("site_name").notNull().default("Tu Bingazo"),
  siteTagline: text("site_tagline").notNull().default("Bingo en Vivo Bolivia"),
  siteEmoji: text("site_emoji").notNull().default("🎱"),
  faviconUrl: text("favicon_url"),
  logoUrl: text("logo_url"),
  seoTitle: text("seo_title").notNull().default("Tu Bingazo — Bingo en Vivo Bolivia"),
  seoDescription: text("seo_description").notNull().default("La plataforma de bingo en vivo más grande de Bolivia. Gana premios en efectivo desde tu celular."),
  seoKeywords: text("seo_keywords").notNull().default("bingo, bolivia, bingo en vivo, premios, dinero"),
  primaryColor: text("primary_color").notNull().default("#1a0050"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedById: integer("updated_by_id").references(() => usersTable.id),
});

export type SiteSettings = typeof siteSettingsTable.$inferSelect;
