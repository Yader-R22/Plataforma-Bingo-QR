import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { logger } from "./logger";

const CONFIG_PATH = join(process.cwd(), "auto-restart-config.json");
const CHECK_INTERVAL_MS = 60_000; // check every 60 seconds

interface AutoRestartConfig {
  enabled: boolean;
  threshold: number; // heap % (0-100)
}

const DEFAULT_CONFIG: AutoRestartConfig = { enabled: true, threshold: 80 };

let config: AutoRestartConfig = { ...DEFAULT_CONFIG };

function loadConfig(): void {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AutoRestartConfig>;
    config = {
      enabled:   typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_CONFIG.enabled,
      threshold: typeof parsed.threshold === "number" && parsed.threshold >= 50 && parsed.threshold <= 99
        ? parsed.threshold
        : DEFAULT_CONFIG.threshold,
    };
    logger.info({ config }, "Auto-restart config loaded");
  } catch {
    config = { ...DEFAULT_CONFIG };
  }
}

function saveConfig(): void {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Could not save auto-restart config");
  }
}

export function getAutoRestartConfig(): AutoRestartConfig {
  return { ...config };
}

export function setAutoRestartConfig(updates: Partial<AutoRestartConfig>): AutoRestartConfig {
  if (typeof updates.enabled === "boolean") config.enabled = updates.enabled;
  if (typeof updates.threshold === "number" && updates.threshold >= 50 && updates.threshold <= 99) {
    config.threshold = updates.threshold;
  }
  saveConfig();
  logger.info({ config }, "Auto-restart config updated");
  return { ...config };
}

export function startAutoRestartWatcher(): void {
  loadConfig();

  const timer = setInterval(() => {
    if (!config.enabled) return;

    const mem = process.memoryUsage();
    const heapPct  = Math.round((mem.heapUsed / mem.heapTotal) * 100);
    // RSS vs memoria total del sistema (más representativo en producción)
    const totalMem = (process as NodeJS.Process & { constrainedMemory?: () => number }).constrainedMemory?.() ?? 0;
    const rssPct   = totalMem > 0 ? Math.round((mem.rss / totalMem) * 100) : 0;

    const triggered = heapPct >= config.threshold || (rssPct > 0 && rssPct >= config.threshold);

    if (triggered) {
      logger.warn(
        { heapPct, rssPct, threshold: config.threshold },
        "Auto-restart triggered: memory threshold exceeded"
      );
      // Exit cleanly — pm2 will restart the process
      setTimeout(() => process.exit(0), 500);
    }
  }, CHECK_INTERVAL_MS);

  timer.unref();
  logger.info({ intervalMs: CHECK_INTERVAL_MS }, "Auto-restart watcher started");
}
