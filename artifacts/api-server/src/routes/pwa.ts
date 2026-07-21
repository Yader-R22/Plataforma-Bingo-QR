import { createHash } from "crypto";
import { Router } from "express";
import { db, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

// ── Settings cache (slim — sin datos binarios) ────────────────────────────────
// getSettings() es llamado por /manifest.json, /cache-version y los endpoints admin.
// La caché almacena solo campos pequeños; los campos binarios (base64) se cargan bajo
// demanda en /icon/512 e /icon/192 para no acumular megas en el heap del proceso.
type PwaManifestSettings = {
  siteName: string;
  siteTagline: string;
  pwaShortName: string;
  pwaCacheVersion: number;
  pwaDisplayMode: string;
  pwaOrientation: string;
  pwaThemeColor: string | null;
  pwaBgColor: string | null;
  primaryColor: string;
  pwaStartUrl: string;
  pwaCategories: string;
  /** Cabecera del data: URL (ej. "data:image/png;base64") o URL externa completa o null */
  pwaIconHeader: string | null;
  pwaIcon192Header: string | null;
  /** Solo URLs externas — null si es data: URL o no hay imagen */
  logoFallbackUrl: string | null;
  faviconFallbackUrl: string | null;
};

let settingsCache: PwaManifestSettings | null = null;
let settingsCacheAt = 0;
const SETTINGS_TTL_MS = 60_000;

export function invalidatePwaSettingsCache(): void {
  settingsCache = null;
  settingsCacheAt = 0;
}

/** Para data: URLs devuelve solo la cabecera (sin los datos binarios); para URLs externas devuelve la URL completa. */
function extractIconHeader(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) {
    const commaIdx = url.indexOf(",");
    return commaIdx > 0 ? url.slice(0, commaIdx) : url.slice(0, 50);
  }
  return url;
}

/** Devuelve la URL solo si es externa — las data: URL son demasiado grandes para usarse como fallback en el manifest. */
function externalOnly(url: string | null | undefined): string | null {
  if (!url || url.startsWith("data:")) return null;
  return url;
}

async function getSettings(): Promise<PwaManifestSettings> {
  const now = Date.now();
  if (settingsCache && now - settingsCacheAt < SETTINGS_TTL_MS) return settingsCache;

  const rows = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
  let full: typeof siteSettingsTable.$inferSelect;
  if (rows.length === 0) {
    await db.insert(siteSettingsTable).values({ id: 1 });
    const fresh = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
    full = fresh[0]!;
  } else {
    full = rows[0]!;
  }

  // Construir caché slim: excluye todos los campos binarios grandes.
  // La fila completa (full) queda elegible para GC inmediatamente.
  settingsCache = {
    siteName: full.siteName,
    siteTagline: full.siteTagline,
    pwaShortName: full.pwaShortName,
    pwaCacheVersion: full.pwaCacheVersion,
    pwaDisplayMode: full.pwaDisplayMode,
    pwaOrientation: full.pwaOrientation,
    pwaThemeColor: full.pwaThemeColor,
    pwaBgColor: full.pwaBgColor,
    primaryColor: full.primaryColor,
    pwaStartUrl: full.pwaStartUrl,
    pwaCategories: full.pwaCategories,
    pwaIconHeader: extractIconHeader(full.pwaIconUrl),
    pwaIcon192Header: extractIconHeader(full.pwaIcon192Url),
    logoFallbackUrl: externalOnly(full.logoUrl),
    faviconFallbackUrl: externalOnly(full.faviconUrl),
  };
  settingsCacheAt = now;
  return settingsCache;
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

// Serve PWA icon as binary with ETag — Chrome uses ETag to confirm icon unchanged
// (no-store caused Chrome to re-download and compare on every launch → false "icon changed" warnings)
function serveIcon(raw: string | null | undefined, req: import("express").Request, res: import("express").Response, fallback: string) {
  if (raw && raw.startsWith("data:")) {
    const { buf, mime } = dataUrlToBuffer(raw);
    const etag = `"${createHash("md5").update(buf).digest("hex")}"`;
    if (req.headers["if-none-match"] === etag) { res.status(304).end(); return; }
    res.setHeader("Content-Type", mime);
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "no-cache"); // revalidate with ETag, don't force re-download
    res.send(buf);
    return;
  }
  res.redirect(raw || fallback);
}

router.get("/icon/512", async (req, res) => {
  const [row] = await db.select({ url: siteSettingsTable.pwaIconUrl })
    .from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
  serveIcon(row?.url ?? null, req, res, "/favicon.svg");
});

router.get("/icon/192", async (req, res) => {
  const [row] = await db.select({ url: siteSettingsTable.pwaIcon192Url, fallback: siteSettingsTable.pwaIconUrl })
    .from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
  serveIcon((row?.url || row?.fallback) ?? null, req, res, "/favicon.svg");
});

// Dynamic manifest served from DB — no-cache so admin changes reflect immediately
router.get("/manifest.json", async (req, res) => {
  const s = await getSettings();

  // Use root-relative paths — never absolute URLs built from request headers.
  // Absolute URLs constructed from x-forwarded-host can vary between Chrome's
  // background manifest checks and normal page loads, making Chrome think the
  // icon changed → spurious "icon identity" security warnings on Android.
  const icons: { src: string; sizes: string; type: string; purpose: string }[] = [];
  const cv = s.pwaCacheVersion ?? 1;
  const vq = `?v=${cv}`; // appended to icon URLs so Chrome re-downloads when version bumps

  if (s.pwaIconHeader) {
    const base = s.pwaIconHeader.startsWith("data:") ? "/api/pwa/icon/512" : s.pwaIconHeader;
    icons.push({ src: `${base}${vq}`, sizes: "512x512", type: iconType(s.pwaIconHeader), purpose: "any" });
  }
  if (s.pwaIcon192Header) {
    const base = s.pwaIcon192Header.startsWith("data:") ? "/api/pwa/icon/192" : s.pwaIcon192Header;
    icons.push({ src: `${base}${vq}`, sizes: "192x192", type: iconType(s.pwaIcon192Header), purpose: "any" });
  } else if (s.pwaIconHeader) {
    // Reuse 512 icon at 192 slot if no separate 192 uploaded
    const base = s.pwaIconHeader.startsWith("data:") ? "/api/pwa/icon/192" : s.pwaIconHeader;
    icons.push({ src: `${base}${vq}`, sizes: "192x192", type: iconType(s.pwaIconHeader), purpose: "any" });
  }
  if (icons.length === 0) {
    const fallback = s.logoFallbackUrl || s.faviconFallbackUrl || "/favicon.svg";
    icons.push({ src: `${fallback}${vq}`, sizes: "512x512", type: "image/svg+xml", purpose: "any" });
    icons.push({ src: `${fallback}${vq}`, sizes: "192x192", type: "image/svg+xml", purpose: "any" });
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
  const [s, icons] = await Promise.all([
    getSettings(),
    db.select({ pwaIconUrl: siteSettingsTable.pwaIconUrl, pwaIcon192Url: siteSettingsTable.pwaIcon192Url })
      .from(siteSettingsTable).where(eq(siteSettingsTable.id, 1)),
  ]);
  res.json({
    pwa_name: s.siteName,
    pwa_short_name: s.pwaShortName,
    pwa_tagline: s.siteTagline,
    pwa_start_url: s.pwaStartUrl,
    pwa_display_mode: s.pwaDisplayMode,
    pwa_orientation: s.pwaOrientation,
    pwa_theme_color: s.pwaThemeColor,
    pwa_bg_color: s.pwaBgColor,
    pwa_icon_512: icons[0]?.pwaIconUrl ?? null,
    pwa_icon_192: icons[0]?.pwaIcon192Url ?? null,
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
  const [updated, updIcons] = await Promise.all([
    getSettings(),
    db.select({ pwaIconUrl: siteSettingsTable.pwaIconUrl, pwaIcon192Url: siteSettingsTable.pwaIcon192Url })
      .from(siteSettingsTable).where(eq(siteSettingsTable.id, 1)),
  ]);
  res.json({
    pwa_name: updated.siteName,
    pwa_short_name: updated.pwaShortName,
    pwa_tagline: updated.siteTagline,
    pwa_start_url: updated.pwaStartUrl,
    pwa_display_mode: updated.pwaDisplayMode,
    pwa_orientation: updated.pwaOrientation,
    pwa_theme_color: updated.pwaThemeColor,
    pwa_bg_color: updated.pwaBgColor,
    pwa_icon_512: updIcons[0]?.pwaIconUrl ?? null,
    pwa_icon_192: updIcons[0]?.pwaIcon192Url ?? null,
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
