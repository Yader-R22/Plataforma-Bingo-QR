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

function guessType(src: string): string {
  if (src.includes("data:image/png") || src.toLowerCase().endsWith(".png")) return "image/png";
  if (src.includes("data:image/webp") || src.toLowerCase().endsWith(".webp")) return "image/webp";
  if (src.includes("data:image/jpeg") || /\.jpe?g$/i.test(src)) return "image/jpeg";
  return "image/svg+xml";
}

router.get("/manifest.json", async (_req, res) => {
  const s = await getSettings();

  const themeColor = s.pwaThemeColor || s.primaryColor || "#1a0050";
  const bgColor = s.pwaBgColor || s.primaryColor || "#1a0050";

  const icons: { src: string; sizes: string; type: string; purpose: string }[] = [];

  const fallback = s.pwaIconUrl || s.logoUrl || s.faviconUrl || "/favicon.svg";

  if (s.pwaIcon192Url) {
    icons.push({ src: s.pwaIcon192Url, sizes: "192x192", type: guessType(s.pwaIcon192Url), purpose: "any" });
  }
  if (s.pwaIcon512Url) {
    icons.push({ src: s.pwaIcon512Url, sizes: "512x512", type: guessType(s.pwaIcon512Url), purpose: "any" });
  }
  if (s.pwaIconMaskableUrl) {
    icons.push({ src: s.pwaIconMaskableUrl, sizes: "512x512", type: guessType(s.pwaIconMaskableUrl), purpose: "maskable" });
  }

  if (icons.length === 0) {
    const type = guessType(fallback);
    if (fallback.startsWith("data:") || fallback.toLowerCase().endsWith(".png") || fallback.toLowerCase().endsWith(".webp")) {
      icons.push({ src: fallback, sizes: "192x192", type, purpose: "any" });
      icons.push({ src: fallback, sizes: "512x512", type, purpose: "any maskable" });
    } else {
      icons.push({ src: fallback, sizes: "any", type: "image/svg+xml", purpose: "any maskable" });
    }
  }

  const screenshots: { src: string; sizes: string; type: string }[] = [];
  if (s.pwaScreenshotUrl) {
    screenshots.push({ src: s.pwaScreenshotUrl, sizes: "1080x1920", type: guessType(s.pwaScreenshotUrl) });
  }

  const manifest: Record<string, unknown> = {
    name: s.siteName,
    short_name: s.pwaShortName || s.siteName.split(" ")[0],
    description: s.siteTagline,
    start_url: s.pwaStartUrl || "/",
    scope: "/",
    display: s.pwaDisplayMode || "standalone",
    background_color: bgColor,
    theme_color: themeColor,
    orientation: s.pwaOrientation || "portrait",
    icons,
    categories: ["games", "entertainment"],
    lang: "es",
  };

  if (screenshots.length > 0) manifest.screenshots = screenshots;

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.json(manifest);
});

router.get("/cache-version", async (_req, res) => {
  const s = await getSettings();
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.json({ version: s.pwaCacheVersion ?? 1 });
});

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
