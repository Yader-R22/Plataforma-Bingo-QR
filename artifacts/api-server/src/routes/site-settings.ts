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
    payment_api_key_configured: !!s.paymentApiKey,
    pwa_short_name: s.pwaShortName,
    pwa_cache_version: s.pwaCacheVersion,
    pwa_icon_url: s.pwaIconUrl,
    pwa_icon_192_url: s.pwaIcon192Url,
    pwa_icon_512_url: s.pwaIcon512Url,
    pwa_icon_maskable_url: s.pwaIconMaskableUrl,
    pwa_theme_color: s.pwaThemeColor,
    pwa_bg_color: s.pwaBgColor,
    pwa_display_mode: s.pwaDisplayMode,
    pwa_orientation: s.pwaOrientation,
    pwa_start_url: s.pwaStartUrl,
    pwa_screenshot_url: s.pwaScreenshotUrl,
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
    payment_api_key,
    pwa_short_name,
    pwa_icon_url,
    pwa_icon_192_url,
    pwa_icon_512_url,
    pwa_icon_maskable_url,
    pwa_theme_color,
    pwa_bg_color,
    pwa_display_mode,
    pwa_orientation,
    pwa_start_url,
    pwa_screenshot_url,
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
      ...(payment_api_key !== undefined && payment_api_key !== null && payment_api_key !== "" && { paymentApiKey: payment_api_key }),
      ...(pwa_short_name !== undefined && { pwaShortName: pwa_short_name ?? undefined }),
      ...(pwa_icon_url !== undefined && { pwaIconUrl: pwa_icon_url }),
      ...(pwa_icon_192_url !== undefined && { pwaIcon192Url: pwa_icon_192_url }),
      ...(pwa_icon_512_url !== undefined && { pwaIcon512Url: pwa_icon_512_url }),
      ...(pwa_icon_maskable_url !== undefined && { pwaIconMaskableUrl: pwa_icon_maskable_url }),
      ...(pwa_theme_color !== undefined && { pwaThemeColor: pwa_theme_color }),
      ...(pwa_bg_color !== undefined && { pwaBgColor: pwa_bg_color }),
      ...(pwa_display_mode !== undefined && { pwaDisplayMode: pwa_display_mode ?? undefined }),
      ...(pwa_orientation !== undefined && { pwaOrientation: pwa_orientation ?? undefined }),
      ...(pwa_start_url !== undefined && { pwaStartUrl: pwa_start_url ?? undefined }),
      ...(pwa_screenshot_url !== undefined && { pwaScreenshotUrl: pwa_screenshot_url }),
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
    payment_api_key_configured: !!s.paymentApiKey,
    pwa_short_name: s.pwaShortName,
    pwa_cache_version: s.pwaCacheVersion,
    pwa_icon_url: s.pwaIconUrl,
    pwa_icon_192_url: s.pwaIcon192Url,
    pwa_icon_512_url: s.pwaIcon512Url,
    pwa_icon_maskable_url: s.pwaIconMaskableUrl,
    pwa_theme_color: s.pwaThemeColor,
    pwa_bg_color: s.pwaBgColor,
    pwa_display_mode: s.pwaDisplayMode,
    pwa_orientation: s.pwaOrientation,
    pwa_start_url: s.pwaStartUrl,
    pwa_screenshot_url: s.pwaScreenshotUrl,
  });
});

export { router as siteSettingsRouter };
