import { Router } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { startBroadcastJob, getJobStatus, sendPushToUserByCi } from "../lib/push";
import { objectStorageClient } from "../lib/objectStorage";
import { randomUUID } from "crypto";
import multer from "multer";
import { z } from "zod";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const SubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// POST /api/push/subscribe — guardar suscripción del usuario autenticado
router.post("/subscribe", requireAuth, async (req: AuthRequest, res) => {
  const parsed = SubscribeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos de suscripción inválidos" }); return; }
  const { endpoint, keys } = parsed.data;
  const userId = req.userId!;

  await db.insert(pushSubscriptionsTable)
    .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { userId, p256dh: keys.p256dh, auth: keys.auth },
    });

  res.json({ ok: true });
});

// DELETE /api/push/subscribe — eliminar suscripción del usuario
router.delete("/subscribe", requireAuth, async (req: AuthRequest, res) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) { res.status(400).json({ error: "endpoint requerido" }); return; }
  await db.delete(pushSubscriptionsTable)
    .where(and(
      eq(pushSubscriptionsTable.userId, req.userId!),
      eq(pushSubscriptionsTable.endpoint, endpoint),
    ));
  res.json({ ok: true });
});

// GET /api/push/vapid-public-key — clave pública VAPID para el frontend
router.get("/vapid-public-key", (_req, res) => {
  const key = process.env["VAPID_PUBLIC_KEY"];
  if (!key) { res.status(503).json({ error: "Push no configurado" }); return; }
  res.json({ key });
});

// GET /api/push/subscribers/count — cuántos dispositivos suscritos hay (solo admin)
router.get("/subscribers/count", requireAuth, requireAdmin, async (_req, res) => {
  const rows = await db.select().from(pushSubscriptionsTable);
  res.json({ count: rows.length });
});

const VALID_DEPARTMENTS = ["Beni","Chuquisaca","Cochabamba","La Paz","Oruro","Pando","Potosí","Santa Cruz","Tarija"];

// POST /api/push/broadcast — fire-and-forget, devuelve jobId inmediatamente
router.post("/broadcast", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const { title, body, url, image, department, ci } = req.body as {
    title?: string; body?: string; url?: string; image?: string; department?: string; ci?: string;
  };
  if (!title?.trim() || !body?.trim()) {
    res.status(400).json({ error: "title y body son requeridos" });
    return;
  }
  if (department && !VALID_DEPARTMENTS.includes(department)) {
    res.status(400).json({ error: "Departamento inválido" });
    return;
  }

  const fwdProto = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto)?.split(",")[0]?.trim() ?? req.protocol;
  const host = req.get("host") ?? "elbingote.com";
  const icon = `${proto}://${host}/api/site-settings/logo`;

  const payload = {
    title: title.trim(),
    body: body.trim(),
    url: url?.trim() ?? "/",
    icon,
    ...(image?.trim() ? { image: image.trim() } : {}),
  };

  // Envío directo a un usuario por CI (no usa jobs)
  if (ci?.trim()) {
    const result = await sendPushToUserByCi(ci.trim(), payload);
    if (!result.found) {
      res.status(404).json({ error: "Usuario no encontrado con esa CI" });
      return;
    }
    res.json({ sent: result.sent, failed: 0, done: true, total: result.sent, ci: true });
    return;
  }

  // Broadcast a todos o por departamento — fire and forget
  const jobId = randomUUID();
  const total = await startBroadcastJob(jobId, payload, department);
  res.json({ jobId, total });
});

// GET /api/push/broadcast/status/:jobId — consultar progreso de un job
router.get("/broadcast/status/:jobId", requireAuth, requireAdmin, (req, res) => {
  const status = getJobStatus(req.params["jobId"] as string);
  if (!status) { res.status(404).json({ error: "Job no encontrado o expirado" }); return; }
  res.json(status);
});

// POST /api/push/upload-image — sube imagen comprimida para usar en push notifications
router.post("/upload-image", requireAuth, requireAdmin, upload.single("image"), async (req: AuthRequest, res) => {
  if (!req.file) { res.status(400).json({ error: "Imagen requerida" }); return; }

  const pathsStr = process.env["PUBLIC_OBJECT_SEARCH_PATHS"] ?? "";
  const firstPath = pathsStr.split(",")[0]?.trim().replace(/^\//, "");
  if (!firstPath) { res.status(503).json({ error: "Object storage no configurado" }); return; }

  const parts = firstPath.split("/");
  const bucketName = parts[0];
  const folderPrefix = parts.slice(1).join("/");
  const mime = req.file.mimetype ?? "image/jpeg";
  const ext = mime === "image/webp" ? "webp" : mime === "image/png" ? "png" : "jpg";
  const filename = `${randomUUID()}.${ext}`;
  const objectName = folderPrefix ? `${folderPrefix}/push-images/${filename}` : `push-images/${filename}`;

  try {
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    await file.save(req.file.buffer, { contentType: mime, resumable: false });

    const fwdProto2 = req.headers["x-forwarded-proto"];
    const proto = (Array.isArray(fwdProto2) ? fwdProto2[0] : fwdProto2)?.split(",")[0]?.trim() ?? req.protocol;
    const host = req.get("host") ?? "elbingote.com";
    const publicUrl = `${proto}://${host}/api/storage/public-objects/push-images/${filename}`;
    res.json({ url: publicUrl });
  } catch (err) {
    req.log.error({ err }, "Error subiendo imagen push");
    res.status(500).json({ error: "Error al subir la imagen" });
  }
});

export { router as pushRouter };
