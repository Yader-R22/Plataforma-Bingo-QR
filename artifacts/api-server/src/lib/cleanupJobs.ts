import {
  db,
  activatorCardSalesTable,
  auditLogsTable,
  nameChangeRequestsTable,
  ciChangeRequestsTable,
  activatorRequestsTable,
} from "@workspace/db";
import { and, eq, lt, or, ne } from "drizzle-orm";
import { logger } from "./logger";

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const AGE_90_DAYS  = 90  * 24 * 60 * 60 * 1000;
const AGE_180_DAYS = 180 * 24 * 60 * 60 * 1000;

// Ventas de activadores: borrar rejected/pending_payment con más de 90 días
async function cleanupOldActivatorSales(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - AGE_90_DAYS);
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
      logger.info({ deleted, cutoffDays: 90 }, "Cleanup: activator sales (rejected/pending_payment)");
    }
  } catch (err) {
    logger.warn({ err }, "Cleanup: error in activator sales cleanup");
  }
}

// Logs de auditoría: borrar entradas con más de 90 días
async function cleanupOldAuditLogs(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - AGE_90_DAYS);
    const result = await db.delete(auditLogsTable)
      .where(lt(auditLogsTable.createdAt, cutoff));
    const deleted = result.rowCount ?? 0;
    if (deleted > 0) {
      logger.info({ deleted, cutoffDays: 90 }, "Cleanup: audit logs");
    }
  } catch (err) {
    logger.warn({ err }, "Cleanup: error in audit logs cleanup");
  }
}

// Solicitudes de cambio de nombre: borrar aprobadas/rechazadas con más de 90 días
async function cleanupOldNameChangeRequests(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - AGE_90_DAYS);
    const result = await db.delete(nameChangeRequestsTable)
      .where(
        and(
          ne(nameChangeRequestsTable.status, "pending"),
          lt(nameChangeRequestsTable.createdAt, cutoff),
        )
      );
    const deleted = result.rowCount ?? 0;
    if (deleted > 0) {
      logger.info({ deleted, cutoffDays: 90 }, "Cleanup: name change requests");
    }
  } catch (err) {
    logger.warn({ err }, "Cleanup: error in name change requests cleanup");
  }
}

// Solicitudes de cambio de CI: borrar aprobadas/rechazadas con más de 90 días
async function cleanupOldCiChangeRequests(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - AGE_90_DAYS);
    const result = await db.delete(ciChangeRequestsTable)
      .where(
        and(
          ne(ciChangeRequestsTable.status, "pending"),
          lt(ciChangeRequestsTable.createdAt, cutoff),
        )
      );
    const deleted = result.rowCount ?? 0;
    if (deleted > 0) {
      logger.info({ deleted, cutoffDays: 90 }, "Cleanup: CI change requests");
    }
  } catch (err) {
    logger.warn({ err }, "Cleanup: error in CI change requests cleanup");
  }
}

// Solicitudes de activador: borrar rejected/banned con más de 180 días
async function cleanupOldActivatorRequests(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - AGE_180_DAYS);
    const result = await db.delete(activatorRequestsTable)
      .where(
        and(
          or(
            eq(activatorRequestsTable.status, "rejected"),
            eq(activatorRequestsTable.status, "banned"),
          ),
          lt(activatorRequestsTable.createdAt, cutoff),
        )
      );
    const deleted = result.rowCount ?? 0;
    if (deleted > 0) {
      logger.info({ deleted, cutoffDays: 180 }, "Cleanup: activator requests (rejected/banned)");
    }
  } catch (err) {
    logger.warn({ err }, "Cleanup: error in activator requests cleanup");
  }
}

async function runAllCleanups(): Promise<void> {
  await Promise.allSettled([
    cleanupOldActivatorSales(),
    cleanupOldAuditLogs(),
    cleanupOldNameChangeRequests(),
    cleanupOldCiChangeRequests(),
    cleanupOldActivatorRequests(),
  ]);
}

export function startCleanupJobs(): void {
  void runAllCleanups();
  const job = setInterval(() => void runAllCleanups(), CLEANUP_INTERVAL_MS);
  job.unref();
  logger.info("Cleanup jobs started (90-day retention: audit logs, name/CI changes, activator sales; 180-day: activator requests)");
}
