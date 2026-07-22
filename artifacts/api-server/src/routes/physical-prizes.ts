import { Router } from "express";
import { db, winnersTable, usersTable, gamesTable } from "@workspace/db";
import { eq, and, desc, or } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";
import { sendPushToUsers } from "../lib/push";

const router = Router();

router.get("/", requireAdmin, async (_req: AuthRequest, res) => {
  const rows = await db
    .select({
      id: winnersTable.id,
      game_id: winnersTable.gameId,
      game_title: gamesTable.title,
      prize_type: winnersTable.prizeType,
      prize_amount: winnersTable.prizeAmount,
      prize_physical_name: winnersTable.prizePhysicalName,
      delivery_status: winnersTable.deliveryStatus,
      delivery_address: winnersTable.deliveryAddress,
      delivery_phone: winnersTable.deliveryPhone,
      delivery_receipt_url: winnersTable.deliveryReceiptUrl,
      delivery_notes: winnersTable.deliveryNotes,
      created_at: winnersTable.createdAt,
      user_id: winnersTable.userId,
      user_name: usersTable.fullName,
      user_ci: usersTable.ci,
      user_phone: usersTable.phone,
      user_department: usersTable.department,
    })
    .from(winnersTable)
    .leftJoin(gamesTable, eq(winnersTable.gameId, gamesTable.id))
    .leftJoin(usersTable, eq(winnersTable.userId, usersTable.id))
    .where(
      and(
        eq(winnersTable.validated, true),
        or(eq(winnersTable.prizeType, "physical"), eq(winnersTable.prizeType, "mixed")),
      ),
    )
    .orderBy(desc(winnersTable.createdAt));

  res.json(
    rows.map((r) => ({
      ...r,
      prize_amount: parseFloat(r.prize_amount),
    })),
  );
});

router.patch("/:id/ship", requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { delivery_receipt_url, delivery_notes } = req.body as {
    delivery_receipt_url?: string;
    delivery_notes?: string;
  };

  const updateData: Partial<typeof winnersTable.$inferInsert> = { deliveryStatus: "shipped" };
  if (delivery_receipt_url) updateData.deliveryReceiptUrl = delivery_receipt_url;
  if (delivery_notes) updateData.deliveryNotes = delivery_notes;

  const [updated] = await db
    .update(winnersTable)
    .set(updateData)
    .where(eq(winnersTable.id, id))
    .returning({ id: winnersTable.id, userId: winnersTable.userId, prizePhysicalName: winnersTable.prizePhysicalName });

  if (!updated) { res.status(404).json({ error: "Premio no encontrado" }); return; }
  res.json({ ok: true });

  // Notificar al ganador
  sendPushToUsers([updated.userId], {
    title: "🚚 ¡Tu premio está en camino!",
    body: `Tu premio físico${updated.prizePhysicalName ? ` "${updated.prizePhysicalName}"` : ""} fue enviado. Revisá los datos de entrega en tu billetera.`,
    url: "/wallet",
  }).catch(() => {});
});

router.patch("/:id/deliver", requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { delivery_notes } = req.body as { delivery_notes?: string };

  const updateData: Partial<typeof winnersTable.$inferInsert> = { deliveryStatus: "delivered" };
  if (delivery_notes) updateData.deliveryNotes = delivery_notes;

  const [updated] = await db
    .update(winnersTable)
    .set(updateData)
    .where(eq(winnersTable.id, id))
    .returning({ id: winnersTable.id, userId: winnersTable.userId, prizePhysicalName: winnersTable.prizePhysicalName });

  if (!updated) { res.status(404).json({ error: "Premio no encontrado" }); return; }
  res.json({ ok: true });

  // Notificar al ganador
  sendPushToUsers([updated.userId], {
    title: "✅ ¡Tu premio fue entregado!",
    body: `Tu premio físico${updated.prizePhysicalName ? ` "${updated.prizePhysicalName}"` : ""} fue marcado como entregado. ¡Felicitaciones!`,
    url: "/wallet",
  }).catch(() => {});
});

export { router as physicalPrizesRouter };
