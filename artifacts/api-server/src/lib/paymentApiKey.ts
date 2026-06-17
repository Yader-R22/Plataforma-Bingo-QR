import { db, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function getPaymentApiKey(): Promise<string> {
  try {
    const rows = await db.select({ key: siteSettingsTable.paymentApiKey })
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.id, 1))
      .limit(1);
    if (rows[0]?.key) return rows[0].key;
  } catch {}
  return process.env.PAYMENT_API_KEY || "";
}
