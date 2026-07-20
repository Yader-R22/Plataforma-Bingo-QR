import { Router } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { sendPushToAll, sendPushToDepartment } from "../lib/push";
import { z } from "zod";

const router = Router();

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

// POST /api/push/broadcast — enviar push a todos o por departamento (solo admin)
router.post("/broadcast", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const { title, body, url, image, department } = req.body as {
    title?: string; body?: string; url?: string; image?: string; department?: string;
  };
  if (!title?.trim() || !body?.trim()) {
    res.status(400).json({ error: "title y body son requeridos" });
    return;
  }
  if (department && !VALID_DEPARTMENTS.includes(department)) {
    res.status(400).json({ error: "Departamento inválido" });
    return;
  }

  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() ?? req.protocol;
  const host = req.get("host") ?? "elbingote.com";
  const icon = `${proto}://${host}/api/site-settings/logo`;

  const payload = {
    title: title.trim(),
    body: body.trim(),
    url: url?.trim() ?? "/",
    icon,
    ...(image?.trim() ? { image: image.trim() } : {}),
  };

  const result = department
    ? await sendPushToDepartment(department, payload)
    : await sendPushToAll(payload);
  res.json(result);
});

export { router as pushRouter };
