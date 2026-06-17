import { db, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

let cached: string | null = null;
let cachedAt = 0;
const TTL_MS = 60_000;

export async function getSiteName(): Promise<string> {
  const now = Date.now();
  if (cached && now - cachedAt < TTL_MS) return cached;
  try {
    const rows = await db.select({ siteName: siteSettingsTable.siteName })
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.id, 1));
    cached = rows[0]?.siteName ?? "Tu Bingazo";
    cachedAt = now;
  } catch {
    cached = cached ?? "Tu Bingazo";
  }
  return cached;
}

export function invalidateSiteNameCache(): void {
  cached = null;
  cachedAt = 0;
}
