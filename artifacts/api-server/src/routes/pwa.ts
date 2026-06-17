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

// Dynamic manifest — served from DB so admin changes reflect immediately
router.get("/manifest.json", async (_req, res) => {
  const s = await getSettings();

  const icons: { src: string; sizes: string; type: string; purpose: string }[] = [];
  const iconSrc = s.pwaIconUrl || s.logoUrl || s.faviconUrl || "/favicon.svg";
  const isDataUrl = iconSrc.startsWith("data:");
  const isPng = iconSrc.includes("data:image/png") || iconSrc.toLowerCase().endsWith(".png");

  if (isDataUrl) {
    icons.push({ src: iconSrc, sizes: "512x512", type: isPng ? "image/png" : "image/svg+xml", purpose: "any maskable" });
  } else {
    icons.push({ src: iconSrc, sizes: "any", type: "image/svg+xml", purpose: "any maskable" });
    icons.push({ src: iconSrc, sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" });
  }

  const manifest = {
    name: s.siteName,
    short_name: s.pwaShortName || s.siteName.split(" ")[0],
    description: s.siteTagline,
    start_url: "/",
    display: "standalone",
    background_color: s.primaryColor || "#1a0050",
    theme_color: s.primaryColor || "#1a0050",
    orientation: "portrait",
    icons,
    categories: ["games", "entertainment"],
    lang: "es",
  };

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.json(manifest);
});

// Returns current cache version so the SW knows when to bust its cache
router.get("/cache-version", async (_req, res) => {
  const s = await getSettings();
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.json({ version: s.pwaCacheVersion ?? 1 });
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
