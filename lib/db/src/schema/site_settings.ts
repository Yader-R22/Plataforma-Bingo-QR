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
  qrBackgroundUrl: text("qr_background_url"),
  bannerInterval: integer("banner_interval").notNull().default(5),
  paymentApiKey: text("payment_api_key"),
  // PWA-specific fields
  pwaShortName: text("pwa_short_name").notNull().default("Bingazo"),
  pwaCacheVersion: integer("pwa_cache_version").notNull().default(1),
  pwaIconUrl: text("pwa_icon_url"),
  pwaIcon192Url: text("pwa_icon_192_url"),
  pwaIcon512Url: text("pwa_icon_512_url"),
  pwaIconMaskableUrl: text("pwa_icon_maskable_url"),
  pwaThemeColor: text("pwa_theme_color"),
  pwaBgColor: text("pwa_bg_color"),
  pwaDisplayMode: text("pwa_display_mode").notNull().default("standalone"),
  pwaOrientation: text("pwa_orientation").notNull().default("portrait"),
  pwaStartUrl: text("pwa_start_url").notNull().default("/"),
  pwaScreenshotUrl: text("pwa_screenshot_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedById: integer("updated_by_id").references(() => usersTable.id),
});

export type SiteSettings = typeof siteSettingsTable.$inferSelect;
