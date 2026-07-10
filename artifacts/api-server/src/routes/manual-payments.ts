import { Router } from "express";
import { db, manualPaymentRequestsTable, cardsTable, gamesTable, usersTable, feedItemsTable, siteSettingsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

// ── POST /api/manual-payments — create a manual payment request ────────────
// Creates cards in pending_payment status and records the manual payment request
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { game_id, quantity, card_ids } = req.body as {
    game_id?: number;
    quantity?: number;
    card_ids?: number[];
  };

  if (!game_id || !quantity || quantity < 1) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  // Verify game exists and is upcoming/active
  const games = await db.select().from(gamesTable).where(eq(gamesTable.id, game_id)).limit(1);
  if (!games.length) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  const game = games[0];
  if (game.status === "finished") { res.status(400).json({ error: "El juego ya terminó" }); return; }

  // card_ids must be provided (frontend creates the cards first via /api/cards/buy, then calls this with the IDs)
  if (!card_ids || !card_ids.length) {
    res.status(400).json({ error: "IDs de cartones requeridos" });
    return;
  }

  // Verify these cards belong to this user and game and are still pending
  const cards = await db.select().from(cardsTable)
    .where(and(
      eq(cardsTable.userId, req.userId!),
      eq(cardsTable.gameId, game_id),
    ));

  const validCards = cards.filter(c => card_ids.includes(c.id) && c.status === "pending_payment");
  if (validCards.length !== card_ids.length) {
    res.status(400).json({ error: "Cartones inválidos o ya pagados" });
    return;
  }

  const expectedAmount = parseFloat(game.cardPrice as string) * quantity;

  const [request] = await db.insert(manualPaymentRequestsTable).values({
    userId: req.userId!,
    gameId: game_id,
    quantity,
    expectedAmount: expectedAmount.toFixed(2),
  }).returning();

  req.log.info({ user_id: req.userId, game_id, quantity, request_id: request.id }, "manual payment request created");

  res.status(201).json({
    id: request.id,
    game_id: request.gameId,
    quantity: request.quantity,
    expected_amount: parseFloat(request.expectedAmount),
    status: request.status,
    created_at: request.createdAt,
  });
});

// ── POST /api/manual-payments/:id/receipt — upload receipt URL ─────────────
router.post("/:id/receipt", requireAuth, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { receipt_url } = req.body as { receipt_url?: string };
  if (!receipt_url?.trim()) { res.status(400).json({ error: "URL del comprobante requerida" }); return; }

  const rows = await db.select().from(manualPaymentRequestsTable)
    .where(and(eq(manualPaymentRequestsTable.id, id), eq(manualPaymentRequestsTable.userId, req.userId!)))
    .limit(1);

  if (!rows.length) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  if (rows[0].status !== "pending") { res.status(400).json({ error: "Solicitud ya procesada" }); return; }

  const [updated] = await db.update(manualPaymentRequestsTable)
    .set({ receiptUrl: receipt_url.trim() })
    .where(eq(manualPaymentRequestsTable.id, id))
    .returning();

  req.log.info({ user_id: req.userId, request_id: id }, "manual payment receipt uploaded");

  res.json({
    id: updated.id,
    status: updated.status,
    receipt_url: updated.receiptUrl,
  });
});

// ── GET /api/manual-payments/my — get current user's manual payment requests ─
router.get("/my", requireAuth, async (req: AuthRequest, res) => {
  const rows = await db
    .select({
      r: manualPaymentRequestsTable,
      gameTitle: gamesTable.title,
    })
    .from(manualPaymentRequestsTable)
    .leftJoin(gamesTable, eq(manualPaymentRequestsTable.gameId, gamesTable.id))
    .where(eq(manualPaymentRequestsTable.userId, req.userId!))
    .orderBy(desc(manualPaymentRequestsTable.createdAt))
    .limit(50);

  res.json(rows.map(({ r, gameTitle }) => ({
    id: r.id,
    game_id: r.gameId,
    game_title: gameTitle ?? null,
    quantity: r.quantity,
    expected_amount: parseFloat(r.expectedAmount),
    receipt_url: r.receiptUrl ?? null,
    status: r.status,
    admin_notes: r.adminNotes ?? null,
    created_at: r.createdAt,
  })));
});

// ── GET /api/manual-payments — admin list ─────────────────────────────────
router.get("/", requireAdmin, async (req: AuthRequest, res) => {
  const statusFilter = req.query.status as string | undefined;

  let query = db
    .select({
      r: manualPaymentRequestsTable,
      userName: usersTable.fullName,
      userCi: usersTable.ci,
      gameTitle: gamesTable.title,
    })
    .from(manualPaymentRequestsTable)
    .leftJoin(usersTable, eq(manualPaymentRequestsTable.userId, usersTable.id))
    .leftJoin(gamesTable, eq(manualPaymentRequestsTable.gameId, gamesTable.id))
    .orderBy(desc(manualPaymentRequestsTable.createdAt))
    .$dynamic();

  if (statusFilter && ["pending", "approved", "rejected"].includes(statusFilter)) {
    query = query.where(eq(manualPaymentRequestsTable.status, statusFilter as "pending" | "approved" | "rejected"));
  }

  const rows = await query.limit(200);

  res.json(rows.map(({ r, userName, userCi, gameTitle }) => ({
    id: r.id,
    user_id: r.userId,
    user_name: userName ?? null,
    user_ci: userCi ?? null,
    game_id: r.gameId,
    game_title: gameTitle ?? null,
    quantity: r.quantity,
    expected_amount: parseFloat(r.expectedAmount),
    receipt_url: r.receiptUrl ?? null,
    status: r.status,
    admin_notes: r.adminNotes ?? null,
    reviewed_at: r.reviewedAt ?? null,
    created_at: r.createdAt,
  })));
});

// ── PUT /api/manual-payments/:id/approve — admin approves ─────────────────
router.put("/:id/approve", requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const rows = await db.select().from(manualPaymentRequestsTable)
    .where(eq(manualPaymentRequestsTable.id, id)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  const request = rows[0];
  if (request.status !== "pending") { res.status(400).json({ error: "Solicitud ya procesada" }); return; }

  if (!request.receiptUrl) {
    res.status(400).json({ error: "El comprobante aún no fue subido" });
    return;
  }

  const { notes } = req.body as { notes?: string };

  // Atomic: mark approved + activate the user's pending_payment cards for this game
  let alreadyDone = false;
  await db.transaction(async (tx) => {
    const flipped = await tx.update(manualPaymentRequestsTable)
      .set({
        status: "approved",
        adminNotes: notes?.trim() ?? null,
        reviewedById: req.userId!,
        reviewedAt: new Date(),
      })
      .where(and(
        eq(manualPaymentRequestsTable.id, id),
        eq(manualPaymentRequestsTable.status, "pending"),
      ))
      .returning();

    if (!flipped.length) { alreadyDone = true; return; }

    // Activate the latest pending_payment cards for this user+game (up to quantity)
    const pendingCards = await tx.select({ id: cardsTable.id })
      .from(cardsTable)
      .where(and(
        eq(cardsTable.userId, request.userId),
        eq(cardsTable.gameId, request.gameId),
        eq(cardsTable.status, "pending_payment"),
      ))
      .limit(request.quantity);

    if (pendingCards.length) {
      for (const card of pendingCards) {
        await tx.update(cardsTable)
          .set({ status: "active", paymentStatus: "paid" })
          .where(eq(cardsTable.id, card.id));
      }

      // Update participant count
      const game = await tx.select({ participantCount: gamesTable.participantCount })
        .from(gamesTable).where(eq(gamesTable.id, request.gameId)).limit(1);
      if (game.length) {
        await tx.update(gamesTable)
          .set({ participantCount: game[0].participantCount + pendingCards.length })
          .where(eq(gamesTable.id, request.gameId));
      }
    }
  });

  if (alreadyDone) { res.status(400).json({ error: "Solicitud ya procesada" }); return; }

  // Feed item
  const buyer = await db.select({ fullName: usersTable.fullName, department: usersTable.department })
    .from(usersTable).where(eq(usersTable.id, request.userId)).limit(1);
  const game = await db.select({ title: gamesTable.title })
    .from(gamesTable).where(eq(gamesTable.id, request.gameId)).limit(1);

  if (buyer.length && game.length) {
    const parts = buyer[0].fullName.trim().split(/\s+/);
    const displayName = parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0];
    const dept = buyer[0].department ?? "";
    const qty = request.quantity;
    db.insert(feedItemsTable).values({
      type: "card_purchase",
      message: `${displayName}${dept ? ` de ${dept}` : ""} compró ${qty} cartón${qty !== 1 ? "es" : ""} en ${game[0].title}`,
      userDisplayName: displayName,
    }).catch(() => {});
  }

  req.log.info({ admin_id: req.userId, request_id: id }, "manual payment approved");
  res.json({ id, status: "approved" });
});

// ── PUT /api/manual-payments/:id/reject — admin rejects ───────────────────
router.put("/:id/reject", requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { notes } = req.body as { notes?: string };
  if (!notes?.trim()) { res.status(400).json({ error: "El motivo de rechazo es obligatorio" }); return; }

  const rows = await db.select().from(manualPaymentRequestsTable)
    .where(eq(manualPaymentRequestsTable.id, id)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  if (rows[0].status !== "pending") { res.status(400).json({ error: "Solicitud ya procesada" }); return; }

  const [updated] = await db.update(manualPaymentRequestsTable)
    .set({
      status: "rejected",
      adminNotes: notes.trim(),
      reviewedById: req.userId!,
      reviewedAt: new Date(),
    })
    .where(and(
      eq(manualPaymentRequestsTable.id, id),
      eq(manualPaymentRequestsTable.status, "pending"),
    ))
    .returning();

  if (!updated) { res.status(400).json({ error: "No se pudo rechazar" }); return; }

  req.log.info({ admin_id: req.userId, request_id: id }, "manual payment rejected");
  res.json({ id, status: "rejected", admin_notes: updated.adminNotes });
});

export { router as manualPaymentsRouter };
