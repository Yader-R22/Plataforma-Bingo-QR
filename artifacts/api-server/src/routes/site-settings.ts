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
    banner_version: s.bannerVersion,
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
    og_image_url: s.ogImageUrl ?? null,
    fallback_qr_image_url: s.fallbackQrImageUrl ?? null,
    fallback_qr_force_enabled: s.fallbackQrForceEnabled,
    organizer_default_commission: parseFloat(String(s.organizerDefaultCommission ?? "0")),
  });
});

// ── Logo served as proper binary (used as push notification icon) ────────────
router.get("/logo", async (_req, res) => {
  const s = await ensureSettings();
  const raw = s.logoUrl;
  if (raw && raw.startsWith("data:")) {
    const commaIdx = raw.indexOf(",");
    const header = raw.slice(0, commaIdx);
    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch?.[1] ?? "image/png";
    const buf = Buffer.from(raw.slice(commaIdx + 1), "base64");
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(buf);
    return;
  }
  if (raw && raw.startsWith("http")) {
    res.redirect(raw);
    return;
  }
  // Sin logo configurado — sirve el ícono estático de la app
  res.redirect("/notif-icon.png");
});

// ── OG image served as proper binary (required for og:image absolute URL) ───
router.get("/og-image", async (_req, res) => {
  const s = await ensureSettings();
  const raw = s.ogImageUrl;
  if (raw && raw.startsWith("data:")) {
    const commaIdx = raw.indexOf(",");
    const header = raw.slice(0, commaIdx);
    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch?.[1] ?? "image/png";
    const buf = Buffer.from(raw.slice(commaIdx + 1), "base64");
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.send(buf);
    return;
  }
  // No custom OG image — serve static fallback from public dir
  res.redirect("/opengraph.jpg");
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
    og_image_url,
    fallback_qr_image_url,
    fallback_qr_force_enabled,
    organizer_default_commission,
  } = req.body as Record<string, string | null | undefined | boolean | number>;

  await ensureSettings();

  await db
    .update(siteSettingsTable)
    .set({
      ...(site_name !== undefined ? { siteName: String(site_name) } : {}),
      ...(site_tagline !== undefined ? { siteTagline: String(site_tagline) } : {}),
      ...(site_emoji !== undefined ? { siteEmoji: String(site_emoji) } : {}),
      ...(favicon_url !== undefined ? { faviconUrl: favicon_url as string | null } : {}),
      ...(logo_url !== undefined ? { logoUrl: logo_url as string | null } : {}),
      ...(seo_title !== undefined ? { seoTitle: String(seo_title) } : {}),
      ...(seo_description !== undefined ? { seoDescription: String(seo_description) } : {}),
      ...(seo_keywords !== undefined ? { seoKeywords: String(seo_keywords) } : {}),
      ...(primary_color !== undefined ? { primaryColor: String(primary_color) } : {}),
      ...(qr_background_url !== undefined ? { qrBackgroundUrl: qr_background_url as string | null } : {}),
      ...(banner_interval !== undefined && banner_interval !== null ? { bannerInterval: Number(banner_interval) } : {}),
      ...(support_whatsapp !== undefined ? { supportWhatsapp: support_whatsapp as string | null } : {}),
      ...(payment_api_key !== undefined && payment_api_key !== null && payment_api_key !== "" ? { paymentApiKey: String(payment_api_key) } : {}),
      ...(pwa_short_name !== undefined && pwa_short_name ? { pwaShortName: String(pwa_short_name) } : {}),
      ...(pwa_icon_url !== undefined && pwa_icon_url !== null ? { pwaIconUrl: pwa_icon_url as string | null } : {}),
      ...(terms_and_conditions !== undefined ? { termsAndConditions: terms_and_conditions as string | null } : {}),
      ...(og_image_url !== undefined ? { ogImageUrl: og_image_url as string | null } : {}),
      ...(fallback_qr_image_url !== undefined ? { fallbackQrImageUrl: fallback_qr_image_url as string | null } : {}),
      ...(fallback_qr_force_enabled !== undefined ? { fallbackQrForceEnabled: fallback_qr_force_enabled === true || fallback_qr_force_enabled === "true" } : {}),
      ...(organizer_default_commission !== undefined && organizer_default_commission !== null ? { organizerDefaultCommission: String(Math.max(0, Math.min(100, parseFloat(String(organizer_default_commission)))).toFixed(2)) } : {}),
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
    og_image_url: s.ogImageUrl ?? null,
    fallback_qr_image_url: s.fallbackQrImageUrl ?? null,
    fallback_qr_force_enabled: s.fallbackQrForceEnabled,
    organizer_default_commission: parseFloat(String(s.organizerDefaultCommission ?? "0")),
  });
});

export { router as siteSettingsRouter };
