import { Router } from "express";
import { db, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";
import { invalidateSiteNameCache } from "../lib/getSiteName";

const router = Router();

async function ensureSettings() {
  const rows = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
  if (rows.length === 0) {
    await db.insert(siteSettingsTable).values({ id: 1 });
    const fresh = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
    return fresh[0]!;
  }
  return rows[0]!;
}

router.get("/", async (_req, res) => {
  const s = await ensureSettings();
  res.json({
    site_name: s.siteName,
    site_tagline: s.siteTagline,
    site_emoji: s.siteEmoji,
    favicon_url: s.faviconUrl,
    logo_url: s.logoUrl,
    seo_title: s.seoTitle,
    seo_description: s.seoDescription,
    seo_keywords: s.seoKeywords,
    primary_color: s.primaryColor,
    qr_background_url: s.qrBackgroundUrl,
    banner_interval: s.bannerInterval,
    support_whatsapp: s.supportWhatsapp,
    payment_api_key_configured: !!s.paymentApiKey,
    pwa_short_name: s.pwaShortName,
    pwa_cache_version: s.pwaCacheVersion,
    pwa_icon_url: s.pwaIconUrl,
    pwa_icon_192_url: s.pwaIcon192Url,
    pwa_display_mode: s.pwaDisplayMode,
    pwa_orientation: s.pwaOrientation,
    pwa_theme_color: s.pwaThemeColor,
    pwa_bg_color: s.pwaBgColor,
    pwa_start_url: s.pwaStartUrl,
    pwa_categories: s.pwaCategories,
    terms_and_conditions: s.termsAndConditions ?? null,
  });
});

router.put("/", requireAdmin, async (req: AuthRequest, res) => {
  const {
    site_name,
    site_tagline,
    site_emoji,
    favicon_url,
    logo_url,
    seo_title,
    seo_description,
    seo_keywords,
    primary_color,
    qr_background_url,
    banner_interval,
    support_whatsapp,
    payment_api_key,
    pwa_short_name,
    pwa_icon_url,
    terms_and_conditions,
  } = req.body as Record<string, string | null | undefined>;

  await ensureSettings();

  await db
    .update(siteSettingsTable)
    .set({
      ...(site_name !== undefined && { siteName: site_name ?? undefined }),
      ...(site_tagline !== undefined && { siteTagline: site_tagline ?? undefined }),
      ...(site_emoji !== undefined && { siteEmoji: site_emoji ?? undefined }),
      ...(favicon_url !== undefined && { faviconUrl: favicon_url ?? undefined }),
      ...(logo_url !== undefined && { logoUrl: logo_url ?? undefined }),
      ...(seo_title !== undefined && { seoTitle: seo_title ?? undefined }),
      ...(seo_description !== undefined && { seoDescription: seo_description ?? undefined }),
      ...(seo_keywords !== undefined && { seoKeywords: seo_keywords ?? undefined }),
      ...(primary_color !== undefined && { primaryColor: primary_color ?? undefined }),
      ...(qr_background_url !== undefined && { qrBackgroundUrl: qr_background_url }),
      ...(banner_interval !== undefined && banner_interval !== null && { bannerInterval: Number(banner_interval) }),
      ...(support_whatsapp !== undefined && { supportWhatsapp: support_whatsapp }),
      ...(payment_api_key !== undefined && payment_api_key !== null && payment_api_key !== "" && { paymentApiKey: payment_api_key }),
      ...(pwa_short_name !== undefined && { pwaShortName: pwa_short_name ?? undefined }),
      ...(pwa_icon_url !== undefined && { pwaIconUrl: pwa_icon_url }),
      ...(terms_and_conditions !== undefined && { termsAndConditions: terms_and_conditions }),
      updatedAt: new Date(),
      updatedById: req.userId!,
    })
    .where(eq(siteSettingsTable.id, 1));

  const updated = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
  const s = updated[0]!;

  if (site_name !== undefined) invalidateSiteNameCache();

  req.log.info({ admin_id: req.userId }, "site settings updated");

  res.json({
    site_name: s.siteName,
    site_tagline: s.siteTagline,
    site_emoji: s.siteEmoji,
    favicon_url: s.faviconUrl,
    logo_url: s.logoUrl,
    seo_title: s.seoTitle,
    seo_description: s.seoDescription,
    seo_keywords: s.seoKeywords,
    primary_color: s.primaryColor,
    qr_background_url: s.qrBackgroundUrl,
    support_whatsapp: s.supportWhatsapp,
    payment_api_key_configured: !!s.paymentApiKey,
    pwa_short_name: s.pwaShortName,
    pwa_cache_version: s.pwaCacheVersion,
    pwa_icon_url: s.pwaIconUrl,
    pwa_icon_192_url: s.pwaIcon192Url,
    pwa_display_mode: s.pwaDisplayMode,
    pwa_orientation: s.pwaOrientation,
    pwa_theme_color: s.pwaThemeColor,
    pwa_bg_color: s.pwaBgColor,
    pwa_start_url: s.pwaStartUrl,
    pwa_categories: s.pwaCategories,
    terms_and_conditions: s.termsAndConditions ?? null,
  });
});

export { router as siteSettingsRouter };
