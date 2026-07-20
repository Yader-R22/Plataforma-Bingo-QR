import { Router } from "express";
import { db, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

// ── Settings cache ────────────────────────────────────────────────────────────
// getSettings() es llamado por /manifest.json, /icon/512, /icon/192, /cache-version.
// Sin caché, cada request hace un SELECT * completo (incluye iconos en base64 de
// hasta 500 KB). Con TTL de 60 s prácticamente eliminamos esas queries repetidas.
type SiteSettings = typeof siteSettingsTable.$inferSelect;
let settingsCache: SiteSettings | null = null;
let settingsCacheAt = 0;
const SETTINGS_TTL_MS = 60_000;

export function invalidatePwaSettingsCache(): void {
  settingsCache = null;
  settingsCacheAt = 0;
}

async function getSettings(): Promise<SiteSettings> {
  const now = Date.now();
  if (settingsCache && now - settingsCacheAt < SETTINGS_TTL_MS) return settingsCache;

  const rows = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
  if (rows.length === 0) {
    await db.insert(siteSettingsTable).values({ id: 1 });
    const fresh = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
    settingsCache = fresh[0]!;
  } else {
    settingsCache = rows[0]!;
  }
  settingsCacheAt = now;
  return settingsCache!;
}

function iconType(src: string): string {
  if (src.includes("data:image/png") || src.toLowerCase().endsWith(".png")) return "image/png";
  if (src.includes("data:image/webp") || src.toLowerCase().endsWith(".webp")) return "image/webp";
  return "image/svg+xml";
}

function dataUrlToBuffer(dataUrl: string): { buf: Buffer; mime: string } {
  const commaIdx = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, commaIdx);
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = mimeMatch?.[1] ?? "image/png";
  const buf = Buffer.from(dataUrl.slice(commaIdx + 1), "base64");
  return { buf, mime };
}

// Serve PWA icon as binary — Chrome on Android rejects data: URLs in manifests
router.get("/icon/512", async (_req, res) => {
  const s = await getSettings();
  const raw = s.pwaIconUrl;
  if (raw && raw.startsWith("data:")) {
    const { buf, mime } = dataUrlToBuffer(raw);
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(buf);
    return;
  }
  res.redirect(raw || "/favicon.svg");
});

router.get("/icon/192", async (_req, res) => {
  const s = await getSettings();
  const raw = s.pwaIcon192Url || s.pwaIconUrl;
  if (raw && raw.startsWith("data:")) {
    const { buf, mime } = dataUrlToBuffer(raw);
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(buf);
    return;
  }
  res.redirect(raw || "/favicon.svg");
});

// Dynamic manifest served from DB — no-cache so admin changes reflect immediately
router.get("/manifest.json", async (req, res) => {
  const s = await getSettings();

  // Build absolute base URL so icons work from any origin
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) || "https";
  const rawHost = (req.headers["x-forwarded-host"] as string | undefined) || req.headers["host"] || "";
  const host = rawHost && !rawHost.startsWith("localhost") && !rawHost.startsWith("127.") ? rawHost : "elbingote.com";
  const base = `${proto}://${host}`;

  const icons: { src: string; sizes: string; type: string; purpose: string }[] = [];

  if (s.pwaIconUrl) {
    const src = s.pwaIconUrl.startsWith("data:") ? `${base}/api/pwa/icon/512` : s.pwaIconUrl;
    icons.push({ src, sizes: "512x512", type: "image/png", purpose: "any maskable" });
  }
  if (s.pwaIcon192Url) {
    const src = s.pwaIcon192Url.startsWith("data:") ? `${base}/api/pwa/icon/192` : s.pwaIcon192Url;
    icons.push({ src, sizes: "192x192", type: "image/png", purpose: "any maskable" });
  } else if (s.pwaIconUrl) {
    // Reuse 512 icon at 192 slot if no separate 192 uploaded
    const src = s.pwaIconUrl.startsWith("data:") ? `${base}/api/pwa/icon/192` : s.pwaIconUrl;
    icons.push({ src, sizes: "192x192", type: "image/png", purpose: "any maskable" });
  }
  if (icons.length === 0) {
    const fallback = s.logoUrl || s.faviconUrl || "/favicon.svg";
    icons.push({ src: fallback, sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" });
    icons.push({ src: fallback, sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" });
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
      ...(pwa_categories !== undefined && { pwaCategories: pwa_categories ?? "" }),
      updatedAt: new Date(),
      updatedById: req.userId!,
    })
    .where(eq(siteSettingsTable.id, 1));

  req.log.info({ admin_id: req.userId }, "PWA settings updated");

  invalidatePwaSettingsCache();
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
