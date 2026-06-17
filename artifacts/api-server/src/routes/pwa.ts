import { Router } from "express";
import { db, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

async function getSettings() {
  const rows = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
  if (rows.length === 0) {
    await db.insert(siteSettingsTable).values({ id: 1 });
    const fresh = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
    return fresh[0]!;
  }
  return rows[0]!;
}

function iconType(src: string): string {
  if (src.includes("data:image/png") || src.toLowerCase().endsWith(".png")) return "image/png";
  if (src.includes("data:image/webp") || src.toLowerCase().endsWith(".webp")) return "image/webp";
  return "image/svg+xml";
}

// Dynamic manifest served from DB — no-cache so admin changes reflect immediately
router.get("/manifest.json", async (_req, res) => {
  const s = await getSettings();

  const icons: { src: string; sizes: string; type: string; purpose: string }[] = [];

  if (s.pwaIconUrl) {
    icons.push({ src: s.pwaIconUrl, sizes: "512x512", type: iconType(s.pwaIconUrl), purpose: "any maskable" });
  }
  if (s.pwaIcon192Url) {
    icons.push({ src: s.pwaIcon192Url, sizes: "192x192", type: iconType(s.pwaIcon192Url), purpose: "any" });
  }
  if (icons.length === 0) {
    const fallback = s.logoUrl || s.faviconUrl || "/favicon.svg";
    icons.push({ src: fallback, sizes: "any", type: "image/svg+xml", purpose: "any maskable" });
    icons.push({ src: fallback, sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" });
  }

  const manifest = {
    name: s.siteName,
    short_name: s.pwaShortName || s.siteName.split(" ")[0],
    description: s.siteTagline,
    start_url: s.pwaStartUrl || "/",
    scope: "/",
    display: s.pwaDisplayMode || "standalone",
    background_color: s.pwaBgColor || s.primaryColor || "#1a0050",
    theme_color: s.pwaThemeColor || s.primaryColor || "#1a0050",
    orientation: s.pwaOrientation || "portrait",
    icons,
    categories: (s.pwaCategories || "games,entertainment").split(",").map(c => c.trim()).filter(Boolean),
    lang: "es",
  };

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.json(manifest);
});

// Returns current cache version so SW knows when to bust its cache
router.get("/cache-version", async (_req, res) => {
  const s = await getSettings();
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.json({ version: s.pwaCacheVersion ?? 1 });
});

// Admin: read all PWA settings
router.get("/settings", requireAdmin, async (_req, res) => {
  const s = await getSettings();
  res.json({
    pwa_name: s.siteName,
    pwa_short_name: s.pwaShortName,
    pwa_tagline: s.siteTagline,
    pwa_start_url: s.pwaStartUrl,
    pwa_display_mode: s.pwaDisplayMode,
    pwa_orientation: s.pwaOrientation,
    pwa_theme_color: s.pwaThemeColor,
    pwa_bg_color: s.pwaBgColor,
    pwa_icon_512: s.pwaIconUrl,
    pwa_icon_192: s.pwaIcon192Url,
    pwa_categories: s.pwaCategories,
    pwa_cache_version: s.pwaCacheVersion,
  });
});

// Admin: update PWA settings
router.put("/settings", requireAdmin, async (req: AuthRequest, res) => {
  const {
    pwa_name,
    pwa_short_name,
    pwa_tagline,
    pwa_start_url,
    pwa_display_mode,
    pwa_orientation,
    pwa_theme_color,
    pwa_bg_color,
    pwa_icon_512,
    pwa_icon_192,
    pwa_categories,
  } = req.body as Record<string, string | null | undefined>;

  await getSettings();

  await db.update(siteSettingsTable)
    .set({
      ...(pwa_name !== undefined && pwa_name && { siteName: pwa_name }),
      ...(pwa_short_name !== undefined && pwa_short_name && { pwaShortName: pwa_short_name }),
      ...(pwa_tagline !== undefined && pwa_tagline && { siteTagline: pwa_tagline }),
      ...(pwa_start_url !== undefined && pwa_start_url && { pwaStartUrl: pwa_start_url }),
      ...(pwa_display_mode !== undefined && pwa_display_mode && { pwaDisplayMode: pwa_display_mode }),
      ...(pwa_orientation !== undefined && pwa_orientation && { pwaOrientation: pwa_orientation }),
      ...(pwa_theme_color !== undefined && { pwaThemeColor: pwa_theme_color }),
      ...(pwa_bg_color !== undefined && { pwaBgColor: pwa_bg_color }),
      ...(pwa_icon_512 !== undefined && { pwaIconUrl: pwa_icon_512 }),
      ...(pwa_icon_192 !== undefined && { pwaIcon192Url: pwa_icon_192 }),
      ...(pwa_categories !== undefined && pwa_categories && { pwaCategories: pwa_categories }),
      updatedAt: new Date(),
      updatedById: req.userId!,
    })
    .where(eq(siteSettingsTable.id, 1));

  req.log.info({ admin_id: req.userId }, "PWA settings updated");

  const updated = await getSettings();
  res.json({
    pwa_name: updated.siteName,
    pwa_short_name: updated.pwaShortName,
    pwa_tagline: updated.siteTagline,
    pwa_start_url: updated.pwaStartUrl,
    pwa_display_mode: updated.pwaDisplayMode,
    pwa_orientation: updated.pwaOrientation,
    pwa_theme_color: updated.pwaThemeColor,
    pwa_bg_color: updated.pwaBgColor,
    pwa_icon_512: updated.pwaIconUrl,
    pwa_icon_192: updated.pwaIcon192Url,
    pwa_categories: updated.pwaCategories,
    pwa_cache_version: updated.pwaCacheVersion,
  });
});

// Admin: increment cache version — forces all PWA clients to clear cache on next visit
router.post("/bump-cache", requireAdmin, async (req: AuthRequest, res) => {
  const s = await getSettings();
  const newVersion = (s.pwaCacheVersion ?? 1) + 1;
  await db.update(siteSettingsTable)
    .set({ pwaCacheVersion: newVersion, updatedAt: new Date(), updatedById: req.userId! })
    .where(eq(siteSettingsTable.id, 1));
  req.log.info({ admin_id: req.userId, new_version: newVersion }, "PWA cache version bumped");
  res.json({ version: newVersion });
});

export { router as pwaRouter };
