import { db, activatorCardSalesTable } from "@workspace/db";
import { and, eq, lt, or } from "drizzle-orm";
import { logger } from "./logger";

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // cada 24 horas
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;      // 90 días

async function cleanupOldActivatorSales(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - MAX_AGE_MS);
    const result = await db.delete(activatorCardSalesTable)
      .where(
        and(
          or(
            eq(activatorCardSalesTable.status, "rejected"),
            eq(activatorCardSalesTable.status, "pending_payment"),
          ),
          lt(activatorCardSalesTable.createdAt, cutoff),
        )
      );
    const deleted = result.rowCount ?? 0;
    if (deleted > 0) {
      logger.info({ deleted, cutoffDays: 90 }, "Cleanup: removed old activator sales (rejected/pending_payment)");
    }
  } catch (err) {
    logger.warn({ err }, "Cleanup: error removing old activator sales");
  }
}

export function startCleanupJobs(): void {
  // Ejecutar al arrancar y luego cada 24 horas
  void cleanupOldActivatorSales();
  const job = setInterval(() => void cleanupOldActivatorSales(), CLEANUP_INTERVAL_MS);
  job.unref();
  logger.info("Cleanup jobs started (activator sales: 90-day retention for rejected/pending_payment)");
}
