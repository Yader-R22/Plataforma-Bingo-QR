import { Router } from "express";
import type { Response, NextFunction } from "express";
import {
  db,
  cardsTable,
  gamesTable,
  usersTable,
  activatorRequestsTable,
  activatorSettingsTable,
  activatorCardSalesTable,
  auditLogsTable,
  withdrawalsTable,
  gameAuthorizedActivatorsTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { getPaymentApiKey } from "../lib/paymentApiKey";
import { sendPushToUser } from "../lib/push";

const PAYMENT_API_URL = "https://api.pay.enlazzo.com/functions/v1";
const router = Router();

async function requireActivator(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.userId) { res.status(401).json({ error: "No autorizado" }); return; }
  const rows = await db.select().from(activatorRequestsTable)
    .where(and(eq(activatorRequestsTable.userId, req.userId), eq(activatorRequestsTable.status, "accepted")))
    .limit(1);
  if (!rows.length) { res.status(403).json({ error: "Solo activadores aceptados pueden acceder" }); return; }
  next();
}

function generateBingoCard(): number[][] {
  const ranges: [number, number][] = [[1,15],[16,30],[31,45],[46,60],[61,75]];
  const card: number[][] = [];
  for (const [min, max] of ranges) {
    const pool = Array.from({ length: max - min + 1 }, (_, i) => i + min);
    const col: number[] = [];
    for (let r = 0; r < 5; r++) col.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    card.push(col);
  }
  const t: number[][] = Array.from({ length: 5 }, (_, r) => card.map(c => c[r]));
  t[2][2] = 0;
  return t;
}

// ── GET /api/activator-sales/settings ────────────────────────────────────────
router.get("/settings", requireAuth, async (_req: AuthRequest, res) => {
  const [settings] = await db.select().from(activatorSettingsTable).limit(1);
  res.json({
    card_sale_enabled: settings?.cardSaleEnabled ?? true,
    card_sale_discount_type: settings?.cardSaleDiscountType ?? "percentage",
    card_sale_discount_value: parseFloat(String(settings?.cardSaleDiscountValue ?? "10")),
  });
});

// ── PUT /api/activator-sales/settings (admin) ─────────────────────────────────
router.put("/settings", requireAdmin, async (req: AuthRequest, res) => {
  const { card_sale_enabled, card_sale_discount_type, card_sale_discount_value } = req.body as {
    card_sale_enabled?: boolean;
    card_sale_discount_type?: "percentage" | "fixed";
    card_sale_discount_value?: number;
  };
  const [existing] = await db.select({ id: activatorSettingsTable.id }).from(activatorSettingsTable).limit(1);
  const patch = {
    cardSaleEnabled: card_sale_enabled,
    cardSaleDiscountType: card_sale_discount_type,
    cardSaleDiscountValue: card_sale_discount_value != null ? String(card_sale_discount_value) : undefined,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(activatorSettingsTable).set(patch).where(eq(activatorSettingsTable.id, existing.id));
  } else {
    await db.insert(activatorSettingsTable).values(patch);
  }
  res.json({ ok: true });
});

// ── GET /api/activator-sales/games ────────────────────────────────────────────
router.get("/games", requireAuth, requireActivator, async (req: AuthRequest, res) => {
  const games = await db.select({
    id: gamesTable.id,
    title: gamesTable.title,
    status: gamesTable.status,
    cardPrice: gamesTable.cardPrice,
    drawDate: gamesTable.drawDate,
    isPrivate: gamesTable.isPrivate,
  }).from(gamesTable)
    .where(sql`${gamesTable.status} IN ('upcoming', 'active')`)
    .orderBy(gamesTable.drawDate);

  // Para juegos privados, solo mostrar aquellos donde el activador está autorizado
  const authorizedRows = await db.select({ gameId: gameAuthorizedActivatorsTable.gameId })
    .from(gameAuthorizedActivatorsTable)
    .where(eq(gameAuthorizedActivatorsTable.activatorUserId, req.userId!));
  const authorizedGameIds = new Set(authorizedRows.map(r => r.gameId));

  const visible = games.filter(g => !g.isPrivate || authorizedGameIds.has(g.id));

  res.json(visible.map(g => ({
    id: g.id,
    title: g.title,
    status: g.status,
    card_price: parseFloat(String(g.cardPrice)),
    scheduled_at: g.drawDate,
    is_private: g.isPrivate,
  })));
});

// ── GET /api/activator-sales/lookup-user?ci=xxx ───────────────────────────────
router.get("/lookup-user", requireAuth, requireActivator, async (req: AuthRequest, res) => {
  const ci = String(req.query.ci ?? "").trim();
  if (!ci) { res.status(400).json({ error: "CI requerido" }); return; }
  if (!/^\d{1,15}$/.test(ci)) { res.status(400).json({ error: "CI inválido: solo se permiten dígitos" }); return; }

  const users = await db.select({
    id: usersTable.id,
    fullName: usersTable.fullName,
    ci: usersTable.ci,
    status: usersTable.status,
  }).from(usersTable).where(eq(usersTable.ci, ci)).limit(1);

  if (!users.length) { res.status(404).json({ error: "Usuario no encontrado con ese CI" }); return; }
  const u = users[0];
  if (u.status !== "active") {
    res.status(400).json({ error: "El usuario no está verificado o activo" }); return;
  }
  res.json({ id: u.id, full_name: u.fullName, ci: u.ci });
});

// ── GET /api/activator-sales/my ───────────────────────────────────────────────
router.get("/my", requireAuth, requireActivator, async (req: AuthRequest, res) => {
  const MY_PAGE_SIZE = 50;
  const offset = Math.max(0, parseInt(String(req.query.offset ?? "0")) || 0);
  const fetchLimit = MY_PAGE_SIZE + 1;

  const rows = await db.execute(sql`
    SELECT
      acs.id,
      acs.quantity,
      acs.original_price::text AS original_price,
      acs.discount_amount::text AS discount_amount,
      acs.final_price::text AS final_price,
      acs.payment_method,
      acs.status,
      acs.receipt_url,
      acs.admin_notes,
      acs.created_at,
      g.title AS game_title,
      u.full_name AS target_name,
      u.ci AS target_ci
    FROM activator_card_sales acs
    LEFT JOIN games g ON g.id = acs.game_id
    LEFT JOIN users u ON u.id = acs.target_user_id
    WHERE acs.activator_user_id = ${req.userId!}
    ORDER BY acs.created_at DESC
    LIMIT ${fetchLimit} OFFSET ${offset}
  `);

  const allRows = rows.rows as any[];
  const hasMore = allRows.length > MY_PAGE_SIZE;
  const pageRows = hasMore ? allRows.slice(0, MY_PAGE_SIZE) : allRows;

  res.json({
    sales: pageRows.map(r => ({
      id: Number(r.id),
      game_title: r.game_title as string,
      target_name: r.target_name as string,
      target_ci: r.target_ci as string,
      quantity: Number(r.quantity),
      original_price: parseFloat(r.original_price),
      discount_amount: parseFloat(r.discount_amount),
      final_price: parseFloat(r.final_price),
      payment_method: r.payment_method as string,
      status: r.status as string,
      receipt_url: r.receipt_url as string | null,
      admin_notes: r.admin_notes as string | null,
      created_at: r.created_at as string,
    })),
    has_more: hasMore,
  });
});

// ── POST /api/activator-sales/purchase ───────────────────────────────────────
router.post("/purchase", requireAuth, requireActivator, async (req: AuthRequest, res) => {
  const { game_id, quantity, target_user_id, payment_method } = req.body as {
    game_id?: number;
    quantity?: number;
    target_user_id?: number;
    payment_method?: "enlazo" | "static_qr" | "wallet";
  };

  if (!game_id || !quantity || !target_user_id || !payment_method) {
    res.status(400).json({ error: "Datos incompletos" }); return;
  }
  if (quantity < 1 || quantity > 20) {
    res.status(400).json({ error: "Cantidad inválida (1–20)" }); return;
  }
  if (!["enlazo", "static_qr", "wallet"].includes(payment_method)) {
    res.status(400).json({ error: "Método de pago inválido" }); return;
  }

  const [game] = await db.select().from(gamesTable).where(eq(gamesTable.id, game_id)).limit(1);
  if (!game) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  if (game.status === "finished") { res.status(400).json({ error: "El juego ya finalizó" }); return; }

  // Verificar autorización para juegos privados
  if (game.isPrivate) {
    const auth = await db.select({ id: gameAuthorizedActivatorsTable.id })
      .from(gameAuthorizedActivatorsTable)
      .where(and(
        eq(gameAuthorizedActivatorsTable.gameId, game_id),
        eq(gameAuthorizedActivatorsTable.activatorUserId, req.userId!),
      )).limit(1);
    if (!auth.length) {
      res.status(403).json({ error: "No estás autorizado para vender cartones en este juego privado" });
      return;
    }
  }

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, target_user_id)).limit(1);
  if (!targetUser) { res.status(404).json({ error: "Usuario destino no encontrado" }); return; }
  if (targetUser.status !== "active") {
    res.status(400).json({ error: "El usuario destino no está activo/verificado" }); return;
  }

  const [settings] = await db.select().from(activatorSettingsTable).limit(1);
  if (settings && !settings.cardSaleEnabled) {
    res.status(403).json({ error: "La venta de cartones por activadores está desactivada" }); return;
  }

  const cardPrice = parseFloat(String(game.cardPrice));
  const originalPrice = cardPrice * quantity;
  const discountType = settings?.cardSaleDiscountType ?? "percentage";
  const discountValue = parseFloat(String(settings?.cardSaleDiscountValue ?? "10"));

  let discountAmount = 0;
  if (discountType === "percentage") {
    discountAmount = originalPrice * (discountValue / 100);
  } else {
    discountAmount = discountValue * quantity;
  }
  discountAmount = Math.min(parseFloat(discountAmount.toFixed(2)), originalPrice);
  const finalPrice = Math.max(0, parseFloat((originalPrice - discountAmount).toFixed(2)));

  // Create cards assigned to TARGET user
  const newCards: (typeof cardsTable.$inferSelect)[] = [];
  for (let i = 0; i < quantity; i++) {
    const numbers = generateBingoCard();
    const [card] = await db.insert(cardsTable).values({
      gameId: game_id,
      userId: target_user_id,
      numbers,
      paymentStatus: "pending",
      status: "pending_payment",
    }).returning();
    newCards.push(card);
  }
  const cardIds = newCards.map(c => c.id);

  // ── Enlazo: generate dynamic QR for discounted amount ──────────────────────
  if (payment_method === "enlazo") {
    let transactionId = `act-${req.userId}-${game_id}-${Date.now()}`;
    let qrImage = "";
    let qrError = "";

    try {
      const apiKey = await getPaymentApiKey();
      if (!apiKey) {
        qrError = "API key de pagos no configurada";
      } else {
        const response = await fetch(`${PAYMENT_API_URL}/generate-qr`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ amount: finalPrice }),
        });
        if (response.ok) {
          const data = await response.json() as { qrImage: string; transactionId: string };
          transactionId = data.transactionId;
          qrImage = data.qrImage.startsWith("data:") ? data.qrImage : `data:image/png;base64,${data.qrImage}`;
        } else {
          const body = await response.text().catch(() => "");
          qrError = `Error ${response.status} de Enlazo: ${body.slice(0, 200)}`;
          req.log.error({ status: response.status, body }, "activator-sales: generate-qr error");
        }
      }
    } catch (err) {
      qrError = err instanceof Error ? err.message : "Error de red";
      req.log.error({ err }, "activator-sales: generate-qr exception");
    }

    // Assign checkoutId to cards
    await db.update(cardsTable)
      .set({ checkoutId: transactionId })
      .where(inArray(cardsTable.id, cardIds));

    const [sale] = await db.insert(activatorCardSalesTable).values({
      activatorUserId: req.userId!,
      targetUserId: target_user_id,
      gameId: game_id,
      quantity,
      originalPrice: String(originalPrice.toFixed(2)),
      discountAmount: String(discountAmount.toFixed(2)),
      finalPrice: String(finalPrice.toFixed(2)),
      paymentMethod: "enlazo",
      checkoutId: transactionId,
      cardIds: JSON.stringify(cardIds),
      status: "pending_payment",
    }).returning();

    await db.insert(auditLogsTable).values({
      action: "activator_card_sale",
      userId: req.userId,
      gameId: game_id,
      details: {
        sale_id: sale.id,
        target_user_id,
        quantity,
        original_price: originalPrice,
        discount_amount: discountAmount,
        final_price: finalPrice,
        payment_method: "enlazo",
        transaction_id: transactionId,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      sale_id: sale.id,
      checkout_id: transactionId,
      qr_image: qrImage,
      qr_error: qrError || undefined,
      original_price: originalPrice,
      discount_amount: discountAmount,
      final_price: finalPrice,
    });
    return;
  }

  // ── Wallet: deduct from activator's balance ────────────────────────────────
  if (payment_method === "wallet") {
    // Pre-check balance (optimistic, without lock)
    const [activator] = await db.select({
      balance: usersTable.balance,
      bonusBalance: usersTable.bonusBalance,
      bonusExpiresAt: usersTable.bonusExpiresAt,
      adminCreditBalance: usersTable.adminCreditBalance,
    }).from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

    const pendingRes = await db.select({ total: sql<string>`coalesce(sum(${withdrawalsTable.amount}), 0)` })
      .from(withdrawalsTable)
      .where(and(eq(withdrawalsTable.userId, req.userId!), eq(withdrawalsTable.status, "pending")));
    const pending = parseFloat(pendingRes[0]?.total ?? "0");

    const now = new Date();
    const bonusExpired = activator.bonusExpiresAt ? activator.bonusExpiresAt < now : false;
    const preBonus   = bonusExpired ? 0 : parseFloat(String(activator.bonusBalance ?? "0"));
    const preBalance = parseFloat(String(activator.balance ?? "0"));
    const preCredit  = parseFloat(String(activator.adminCreditBalance ?? "0"));
    const available  = preBalance + preBonus + preCredit - pending;

    if (available < finalPrice) {
      // Roll back pre-created cards
      await db.delete(cardsTable).where(inArray(cardsTable.id, cardIds));
      res.status(400).json({ error: "Saldo insuficiente en billetera" }); return;
    }

    // Deduct under lock (bonus → admin_credit → balance)
    let waleSaleId: number | null = null;
    await db.transaction(async (tx) => {
      const locked = await tx.execute(
        sql`SELECT balance, bonus_balance, bonus_expires_at, admin_credit_balance FROM users WHERE id = ${req.userId!} FOR UPDATE`
      );
      const row = locked.rows[0] as Record<string, unknown>;
      const lockedBalance = parseFloat((row?.balance as string | undefined) ?? "0");
      const bonusExpiredLocked = row?.bonus_expires_at ? new Date(row.bonus_expires_at as string) < now : false;
      const lockedBonus   = bonusExpiredLocked ? 0 : parseFloat((row?.bonus_balance as string | undefined) ?? "0");
      const lockedCredit  = parseFloat((row?.admin_credit_balance as string | undefined) ?? "0");
      const lockedAvail   = lockedBalance + lockedBonus + lockedCredit - pending;

      if (lockedAvail < finalPrice) throw new Error("INSUFFICIENT_BALANCE");

      let remaining = finalPrice;
      const fromBonus  = Math.min(remaining, lockedBonus);  remaining -= fromBonus;
      const fromCredit = Math.min(remaining, lockedCredit); remaining -= fromCredit;
      const fromBalance = remaining;

      if (fromBonus > 0)
        await tx.execute(sql`UPDATE users SET bonus_balance = bonus_balance - ${fromBonus} WHERE id = ${req.userId!}`);
      if (fromCredit > 0)
        await tx.execute(sql`UPDATE users SET admin_credit_balance = admin_credit_balance - ${fromCredit} WHERE id = ${req.userId!}`);
      if (fromBalance > 0)
        await tx.execute(sql`UPDATE users SET balance = balance - ${fromBalance} WHERE id = ${req.userId!}`);

      // Activate cards
      await tx.update(cardsTable)
        .set({ paymentStatus: "paid", status: "active" })
        .where(inArray(cardsTable.id, cardIds));

      const [waleSale] = await tx.insert(activatorCardSalesTable).values({
        activatorUserId: req.userId!,
        targetUserId: target_user_id,
        gameId: game_id,
        quantity,
        originalPrice: String(originalPrice.toFixed(2)),
        discountAmount: String(discountAmount.toFixed(2)),
        finalPrice: String(finalPrice.toFixed(2)),
        paymentMethod: "wallet",
        cardIds: JSON.stringify(cardIds),
        status: "paid",
      }).returning();
      waleSaleId = waleSale.id;

      await tx.insert(auditLogsTable).values({
        action: "activator_card_sale",
        userId: req.userId,
        gameId: game_id,
        details: {
          sale_id: waleSale.id,
          target_user_id,
          quantity,
          original_price: originalPrice,
          discount_amount: discountAmount,
          final_price: finalPrice,
          payment_method: "wallet",
          from_bonus: fromBonus,
          from_credit: fromCredit,
          from_balance: fromBalance,
        },
        ipAddress: req.ip,
      });
    });

    res.status(201).json({
      sale_id: waleSaleId,
      paid_with_balance: true,
      original_price: originalPrice,
      discount_amount: discountAmount,
      final_price: finalPrice,
    });
    return;
  }

  // ── Static QR: admin must approve ─────────────────────────────────────────
  const [sale] = await db.insert(activatorCardSalesTable).values({
    activatorUserId: req.userId!,
    targetUserId: target_user_id,
    gameId: game_id,
    quantity,
    originalPrice: String(originalPrice.toFixed(2)),
    discountAmount: String(discountAmount.toFixed(2)),
    finalPrice: String(finalPrice.toFixed(2)),
    paymentMethod: "static_qr",
    cardIds: JSON.stringify(cardIds),
    status: "pending_approval",
  }).returning();

  await db.insert(auditLogsTable).values({
    action: "activator_card_sale",
    userId: req.userId,
    gameId: game_id,
    details: {
      sale_id: sale.id,
      target_user_id,
      quantity,
      original_price: originalPrice,
      discount_amount: discountAmount,
      final_price: finalPrice,
      payment_method: "static_qr",
    },
    ipAddress: req.ip,
  });

  res.status(201).json({
    sale_id: sale.id,
    original_price: originalPrice,
    discount_amount: discountAmount,
    final_price: finalPrice,
  });
});

// ── POST /api/activator-sales/:id/receipt ─────────────────────────────────────
router.post("/:id/receipt", requireAuth, requireActivator, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { receipt_url } = req.body as { receipt_url?: string };
  if (!receipt_url?.trim()) { res.status(400).json({ error: "URL del comprobante requerida" }); return; }

  const [sale] = await db.select().from(activatorCardSalesTable)
    .where(and(eq(activatorCardSalesTable.id, id), eq(activatorCardSalesTable.activatorUserId, req.userId!)))
    .limit(1);
  if (!sale) { res.status(404).json({ error: "Venta no encontrada" }); return; }
  if (sale.status !== "pending_approval") {
    res.status(400).json({ error: "Solo ventas pendientes de aprobación pueden adjuntar comprobante" }); return;
  }

  const [updated] = await db.update(activatorCardSalesTable)
    .set({ receiptUrl: receipt_url.trim() })
    .where(eq(activatorCardSalesTable.id, id))
    .returning();

  res.json({ id: updated.id, status: updated.status, receipt_url: updated.receiptUrl });
});

// ── GET /api/activator-sales/ (admin) ─────────────────────────────────────────
// Soporta ?status=xxx&offset=N  →  devuelve { sales: [...], has_more: boolean }
const SALES_PAGE_SIZE = 50;
router.get("/", requireAdmin, async (req: AuthRequest, res) => {
  const statusFilter = req.query.status as string | undefined;
  const offset = Math.max(0, parseInt(String(req.query.offset ?? "0")) || 0);
  const validStatuses = ["pending_payment","paid","pending_approval","approved","rejected"];

  const whereClause = statusFilter && validStatuses.includes(statusFilter)
    ? sql`WHERE acs.status = ${statusFilter}`
    : sql``;

  // Pedir un registro extra para saber si hay más páginas
  const fetchLimit = SALES_PAGE_SIZE + 1;

  const rows = await db.execute(sql`
    SELECT
      acs.id,
      acs.quantity,
      acs.original_price::text AS original_price,
      acs.discount_amount::text AS discount_amount,
      acs.final_price::text AS final_price,
      acs.payment_method,
      acs.status,
      acs.receipt_url,
      acs.admin_notes,
      acs.reviewed_at,
      acs.created_at,
      g.title AS game_title,
      ua.full_name AS activator_name,
      ua.ci AS activator_ci,
      ut.full_name AS target_name,
      ut.ci AS target_ci
    FROM activator_card_sales acs
    LEFT JOIN games g ON g.id = acs.game_id
    LEFT JOIN users ua ON ua.id = acs.activator_user_id
    LEFT JOIN users ut ON ut.id = acs.target_user_id
    ${whereClause}
    ORDER BY acs.created_at DESC
    LIMIT ${fetchLimit} OFFSET ${offset}
  `);

  const allRows = rows.rows as any[];
  const hasMore = allRows.length > SALES_PAGE_SIZE;
  const pageRows = hasMore ? allRows.slice(0, SALES_PAGE_SIZE) : allRows;

  res.json({
    sales: pageRows.map(r => ({
      id: Number(r.id),
      game_title: r.game_title as string,
      activator_name: r.activator_name as string,
      activator_ci: r.activator_ci as string,
      target_name: r.target_name as string,
      target_ci: r.target_ci as string,
      quantity: Number(r.quantity),
      original_price: parseFloat(r.original_price),
      discount_amount: parseFloat(r.discount_amount),
      final_price: parseFloat(r.final_price),
      payment_method: r.payment_method as string,
      status: r.status as string,
      receipt_url: r.receipt_url as string | null,
      admin_notes: r.admin_notes as string | null,
      reviewed_at: r.reviewed_at as string | null,
      created_at: r.created_at as string,
    })),
    has_more: hasMore,
    offset,
  });
});

// ── PUT /api/activator-sales/:id/approve (admin) ──────────────────────────────
router.put("/:id/approve", requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [sale] = await db.select().from(activatorCardSalesTable)
    .where(eq(activatorCardSalesTable.id, id)).limit(1);
  if (!sale) { res.status(404).json({ error: "Venta no encontrada" }); return; }
  if (sale.status !== "pending_approval") {
    res.status(400).json({ error: "Solo ventas pendientes de aprobación pueden ser aprobadas" }); return;
  }
  if (!sale.receiptUrl) {
    res.status(400).json({ error: "El comprobante aún no fue subido" }); return;
  }

  const { notes } = req.body as { notes?: string };

  let savedCardIds: number[] = [];
  if (sale.cardIds) { try { savedCardIds = JSON.parse(sale.cardIds); } catch {} }

  let alreadyDone = false;
  await db.transaction(async (tx) => {
    const [flipped] = await tx.update(activatorCardSalesTable)
      .set({
        status: "approved",
        adminNotes: notes?.trim() ?? null,
        reviewedById: req.userId!,
        reviewedAt: new Date(),
      })
      .where(and(
        eq(activatorCardSalesTable.id, id),
        eq(activatorCardSalesTable.status, "pending_approval"),
      ))
      .returning();

    if (!flipped) { alreadyDone = true; return; }

    if (savedCardIds.length) {
      await tx.update(cardsTable)
        .set({ status: "active", paymentStatus: "paid" })
        .where(and(
          inArray(cardsTable.id, savedCardIds),
          eq(cardsTable.userId, sale.targetUserId),
          eq(cardsTable.status, "pending_payment"),
        ));

      const [gameRow] = await tx.select({ participantCount: gamesTable.participantCount })
        .from(gamesTable).where(eq(gamesTable.id, sale.gameId)).limit(1);
      if (gameRow) {
        await tx.update(gamesTable)
          .set({ participantCount: gameRow.participantCount + savedCardIds.length })
          .where(eq(gamesTable.id, sale.gameId));
      }
    }
  });

  if (alreadyDone) { res.status(400).json({ error: "Ya fue procesada" }); return; }

  // Notify target user
  const [gameRow] = await db.select({ title: gamesTable.title })
    .from(gamesTable).where(eq(gamesTable.id, sale.gameId)).limit(1);
  const qty = sale.quantity;
  sendPushToUser(sale.targetUserId, {
    title: "🎟️ ¡Cartones recibidos!",
    body: `Un activador te compró ${qty} cartón${qty !== 1 ? "es" : ""} para ${gameRow?.title ?? "el bingo"}. ¡Buena suerte!`,
    url: "/my-cards",
  }).catch(() => {});

  req.log.info({ admin_id: req.userId, sale_id: id }, "activator card sale approved");
  res.json({ id, status: "approved" });
});

// ── PUT /api/activator-sales/:id/reject (admin) ───────────────────────────────
router.put("/:id/reject", requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { notes, refund_amount } = req.body as { notes?: string; refund_amount?: number };
  if (!notes?.trim()) { res.status(400).json({ error: "El motivo de rechazo es obligatorio" }); return; }

  const refundAmt = typeof refund_amount === "number" ? refund_amount : 0;
  if (refundAmt < 0) { res.status(400).json({ error: "El monto de reembolso no puede ser negativo" }); return; }

  const [sale] = await db.select().from(activatorCardSalesTable)
    .where(eq(activatorCardSalesTable.id, id)).limit(1);
  if (!sale) { res.status(404).json({ error: "Venta no encontrada" }); return; }
  if (sale.status !== "pending_approval") {
    res.status(400).json({ error: "Solo ventas pendientes de aprobación pueden ser rechazadas" }); return;
  }

  let savedCardIds: number[] = [];
  if (sale.cardIds) { try { savedCardIds = JSON.parse(sale.cardIds); } catch {} }

  let alreadyDone = false;
  await db.transaction(async (tx) => {
    const [flipped] = await tx.update(activatorCardSalesTable)
      .set({
        status: "rejected",
        adminNotes: notes.trim(),
        reviewedById: req.userId!,
        reviewedAt: new Date(),
      })
      .where(and(
        eq(activatorCardSalesTable.id, id),
        eq(activatorCardSalesTable.status, "pending_approval"),
      ))
      .returning();

    if (!flipped) { alreadyDone = true; return; }

    if (savedCardIds.length) {
      await tx.update(cardsTable)
        .set({ status: "expired", paymentStatus: "failed" })
        .where(and(
          inArray(cardsTable.id, savedCardIds),
          eq(cardsTable.userId, sale.targetUserId),
          eq(cardsTable.status, "pending_payment"),
        ));
    }

    // Reembolso opcional: acreditar billetera del activador
    if (refundAmt > 0) {
      await tx.insert(withdrawalsTable).values({
        userId:  sale.activatorUserId,
        amount:  String(refundAmt),
        method:  "refund",
        status:  "paid",
        notes:   `Reembolso por venta rechazada — ${notes.trim()}`,
        paidAt:  new Date(),
      });
      await tx.execute(
        sql`UPDATE users SET balance = balance + ${refundAmt} WHERE id = ${sale.activatorUserId}`
      );
    }
  });

  if (alreadyDone) { res.status(400).json({ error: "Ya fue procesada" }); return; }

  req.log.info({ admin_id: req.userId, sale_id: id, refund_amount: refundAmt }, "activator card sale rejected");
  res.json({ id, status: "rejected", refund_amount: refundAmt });
});

export { router as activatorSalesRouter };
