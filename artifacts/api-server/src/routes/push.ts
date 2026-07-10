import { Router } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { sendPushToAll } from "../lib/push";
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

// POST /api/push/broadcast — enviar push a todos los usuarios (solo admin)
router.post("/broadcast", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const { title, body, url } = req.body as { title?: string; body?: string; url?: string };
  if (!title?.trim() || !body?.trim()) {
    res.status(400).json({ error: "title y body son requeridos" });
    return;
  }
  const result = await sendPushToAll({
    title: title.trim(),
    body: body.trim(),
    url: url?.trim() ?? "/",
  });
  res.json(result);
});

export { router as pushRouter };
