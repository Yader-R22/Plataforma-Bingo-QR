import { Router } from "express";
import { db, manualPaymentRequestsTable, cardsTable, gamesTable, usersTable, feedItemsTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { Readable } from "stream";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { UPLOADS_DIR } from "../config";

const router = Router();
const objectStorageService = new ObjectStorageService();

// ── Local disk multer for receipt uploads ─────────────────────────────────
const receiptStorage = multer.diskStorage({
  destination: path.join(UPLOADS_DIR, "receipts"),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const receiptUpload = multer({
  storage: receiptStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max (client compresses before sending)
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Solo se permiten imágenes"));
  },
});

// ── POST /api/manual-payments/upload-receipt — direct image upload ─────────
// Returns a local URL served from /api/uploads/receipts/<filename>
router.post("/upload-receipt", requireAuth, receiptUpload.single("receipt"), (req: AuthRequest, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No se recibió ningún archivo" });
    return;
  }
  const url = `/api/uploads/receipts/${req.file.filename}`;
  res.json({ url });
});

// ── POST /api/manual-payments — create or reuse a manual payment request ────
// If there is already a REJECTED request for this user+game, it is reused
// (reset to pending with the new card_ids) so retries never create duplicates.
// If there is already a PENDING request, 409 is returned.
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { game_id, card_ids } = req.body as {
    game_id?: number;
    card_ids?: number[];
  };

  if (!game_id) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  if (!card_ids || !card_ids.length) {
    res.status(400).json({ error: "IDs de cartones requeridos" });
    return;
  }

  const games = await db.select().from(gamesTable).where(eq(gamesTable.id, game_id)).limit(1);
  if (!games.length) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  const game = games[0];
  if (game.status === "finished") { res.status(400).json({ error: "El juego ya terminó" }); return; }

  // Verify these cards belong to this user and game and are still pending_payment
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

  // Derive quantity and amount from validated cards — never trust client-supplied values
  const quantity = validCards.length;
  const expectedAmount = parseFloat(game.cardPrice as string) * quantity;

  // Check for existing request for this user+game
  const existing = await db.select().from(manualPaymentRequestsTable)
    .where(and(
      eq(manualPaymentRequestsTable.userId, req.userId!),
      eq(manualPaymentRequestsTable.gameId, game_id),
    ))
    .orderBy(desc(manualPaymentRequestsTable.createdAt))
    .limit(1);

  if (existing.length) {
    const prev = existing[0];
    if (prev.status === "pending") {
      // Already has an active (unreviewed) request — return it so the client can attach the receipt
      res.status(200).json({
        id: prev.id,
        game_id: prev.gameId,
        quantity: prev.quantity,
        expected_amount: parseFloat(prev.expectedAmount),
        status: prev.status,
        created_at: prev.createdAt,
      });
      return;
    }
    if (prev.status === "rejected") {
      // Reuse the rejected slot: reset to pending with fresh card_ids and clear old receipt/notes
      const [updated] = await db.update(manualPaymentRequestsTable)
        .set({
          cardIds: JSON.stringify(card_ids),
          quantity,
          expectedAmount: expectedAmount.toFixed(2),
          status: "pending",
          receiptUrl: null,
          adminNotes: null,
          reviewedAt: null,
          reviewedById: null,
          createdAt: new Date(),
        })
        .where(eq(manualPaymentRequestsTable.id, prev.id))
        .returning();

      req.log.info({ user_id: req.userId, game_id, quantity, request_id: updated.id }, "manual payment request reopened after rejection");
      res.status(200).json({
        id: updated.id,
        game_id: updated.gameId,
        quantity: updated.quantity,
        expected_amount: parseFloat(updated.expectedAmount),
        status: updated.status,
        created_at: updated.createdAt,
      });
      return;
    }
    // approved — this shouldn't normally happen (cards would be active), but fall through to create new
  }

  const [request] = await db.insert(manualPaymentRequestsTable).values({
    userId: req.userId!,
    gameId: game_id,
    quantity,
    expectedAmount: expectedAmount.toFixed(2),
    cardIds: JSON.stringify(card_ids),
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

// ── POST /api/manual-payments/:id/receipt — attach receipt URL ─────────────
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

// ── GET /api/manual-payments/my — player's own requests ───────────────────
// Returns only the most recent request per game to avoid showing old rejected
// duplicates that were created before the idempotent POST was deployed.
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
    .limit(200);

  // Deduplicate: keep only the most recent entry per game_id.
  // Rows are already sorted newest-first so the first occurrence per game wins.
  const seenGames = new Set<number>();
  const deduped = rows.filter(({ r }) => {
    if (seenGames.has(r.gameId)) return false;
    seenGames.add(r.gameId);
    return true;
  });

  res.json(deduped.map(({ r, gameTitle }) => ({
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

// ── GET /api/manual-payments/:id/receipt-image — admin proxy for receipt ──
// Allows admin panel to display receipt images without exposing auth tokens in URLs
router.get("/:id/receipt-image", requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const rows = await db.select().from(manualPaymentRequestsTable)
    .where(eq(manualPaymentRequestsTable.id, id)).limit(1);
  if (!rows.length || !rows[0].receiptUrl) {
    res.status(404).json({ error: "Comprobante no encontrado" });
    return;
  }

  const receiptUrl = rows[0].receiptUrl;

  try {
    // Extract objectPath from the stored URL and fetch from object storage
    // URL format: /api/storage/objects/<path>
    const match = receiptUrl.match(/\/api\/storage\/objects\/(.+)$/);
    if (match) {
      const objectPath = `/objects/${match[1]}`;
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const response = await objectStorageService.downloadObject(objectFile);
      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } else {
      // Fallback: redirect to the stored URL directly
      res.redirect(receiptUrl);
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Imagen no encontrada" });
      return;
    }
    req.log.error({ err: error }, "Error serving receipt image");
    res.status(500).json({ error: "Error al servir imagen" });
  }
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

  // Parse saved card IDs; fall back to oldest pending cards if missing (legacy compat)
  let savedCardIds: number[] = [];
  if (request.cardIds) {
    try { savedCardIds = JSON.parse(request.cardIds); } catch {}
  }

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

    // Activate exactly the reserved cards (by saved IDs) or fall back to oldest pending_payment
    let cardsToActivate: { id: number }[];
    if (savedCardIds.length > 0) {
      cardsToActivate = await tx.select({ id: cardsTable.id })
        .from(cardsTable)
        .where(and(
          inArray(cardsTable.id, savedCardIds),
          eq(cardsTable.userId, request.userId),
          eq(cardsTable.status, "pending_payment"),
        ));
    } else {
      cardsToActivate = await tx.select({ id: cardsTable.id })
        .from(cardsTable)
        .where(and(
          eq(cardsTable.userId, request.userId),
          eq(cardsTable.gameId, request.gameId),
          eq(cardsTable.status, "pending_payment"),
        ))
        .limit(request.quantity);
    }

    if (cardsToActivate.length) {
      await tx.update(cardsTable)
        .set({ status: "active", paymentStatus: "paid" })
        .where(inArray(cardsTable.id, cardsToActivate.map(c => c.id)));

      const game = await tx.select({ participantCount: gamesTable.participantCount })
        .from(gamesTable).where(eq(gamesTable.id, request.gameId)).limit(1);
      if (game.length) {
        await tx.update(gamesTable)
          .set({ participantCount: game[0].participantCount + cardsToActivate.length })
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

// ── PUT /api/manual-payments/:id/reject — admin rejects + releases cards ──
router.put("/:id/reject", requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { notes } = req.body as { notes?: string };
  if (!notes?.trim()) { res.status(400).json({ error: "El motivo de rechazo es obligatorio" }); return; }

  const rows = await db.select().from(manualPaymentRequestsTable)
    .where(eq(manualPaymentRequestsTable.id, id)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  const request = rows[0];
  if (request.status !== "pending") { res.status(400).json({ error: "Solicitud ya procesada" }); return; }

  // Parse saved card IDs for release
  let savedCardIds: number[] = [];
  if (request.cardIds) {
    try { savedCardIds = JSON.parse(request.cardIds); } catch {}
  }

  let updated: typeof manualPaymentRequestsTable.$inferSelect | undefined;
  await db.transaction(async (tx) => {
    const [row] = await tx.update(manualPaymentRequestsTable)
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

    if (!row) return;
    updated = row;

    // Release the reserved cards (expire them so they don't block future purchases)
    if (savedCardIds.length > 0) {
      await tx.update(cardsTable)
        .set({ status: "expired", paymentStatus: "failed" })
        .where(and(
          inArray(cardsTable.id, savedCardIds),
          eq(cardsTable.userId, request.userId),
          eq(cardsTable.status, "pending_payment"),
        ));
    } else {
      // Fallback: release the oldest pending_payment cards for this user+game up to quantity
      const pendingCards = await tx.select({ id: cardsTable.id })
        .from(cardsTable)
        .where(and(
          eq(cardsTable.userId, request.userId),
          eq(cardsTable.gameId, request.gameId),
          eq(cardsTable.status, "pending_payment"),
        ))
        .limit(request.quantity);
      if (pendingCards.length) {
        await tx.update(cardsTable)
          .set({ status: "expired", paymentStatus: "failed" })
          .where(inArray(cardsTable.id, pendingCards.map(c => c.id)));
      }
    }
  });

  if (!updated) { res.status(400).json({ error: "No se pudo rechazar" }); return; }

  req.log.info({ admin_id: req.userId, request_id: id }, "manual payment rejected, cards released");
  res.json({ id, status: "rejected", admin_notes: updated.adminNotes });
});

export { router as manualPaymentsRouter };
