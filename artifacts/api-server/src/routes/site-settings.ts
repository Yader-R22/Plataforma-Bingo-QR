import { Router } from "express";
import { db, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";

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
  } = req.body as Record<string, string | null | undefined>;

  await ensureSettings();

  await db
    .update(siteSettingsTable)
    .set({
      ...(site_name !== undefined && { siteName: site_name }),
      ...(site_tagline !== undefined && { siteTagline: site_tagline }),
      ...(site_emoji !== undefined && { siteEmoji: site_emoji }),
      ...(favicon_url !== undefined && { faviconUrl: favicon_url }),
      ...(logo_url !== undefined && { logoUrl: logo_url }),
      ...(seo_title !== undefined && { seoTitle: seo_title }),
      ...(seo_description !== undefined && { seoDescription: seo_description }),
      ...(seo_keywords !== undefined && { seoKeywords: seo_keywords }),
      ...(primary_color !== undefined && { primaryColor: primary_color }),
      updatedAt: new Date(),
      updatedById: req.user!.id,
    })
    .where(eq(siteSettingsTable.id, 1));

  const updated = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
  const s = updated[0]!;

  req.log.info({ admin_id: req.user!.id }, "site settings updated");

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
  });
});

export { router as siteSettingsRouter };
