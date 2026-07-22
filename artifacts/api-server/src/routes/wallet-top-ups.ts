import { Router } from "express";
import { db, walletTopUpsTable, usersTable, auditLogsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { sendPushToUser } from "../lib/push";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { UPLOADS_DIR } from "../config";

const PAYMENT_API_URL = "https://api.pay.enlazzo.com/functions/v1";

async function getPaymentApiKey(): Promise<string | null> {
  return process.env["PAYMENT_API_KEY"] ?? null;
}

const router = Router();

// ── Local disk multer for receipt uploads ─────────────────────────────────
const receiptStorage = multer.diskStorage({
  destination: path.join(UPLOADS_DIR, "receipts"),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `topup-${crypto.randomUUID()}${ext}`);
  },
});
const receiptUpload = multer({
  storage: receiptStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Solo se permiten imágenes"));
  },
});

// ── POST /api/wallet-top-ups/upload-receipt ───────────────────────────────
router.post("/upload-receipt", requireAuth, receiptUpload.single("receipt"), (req: AuthRequest, res) => {
  if (!req.file) { res.status(400).json({ error: "No se recibió ningún archivo" }); return; }
  const url = `/api/uploads/receipts/${req.file.filename}`;
  res.json({ url });
});

// ── POST /api/wallet-top-ups — create Enlazo QR checkout for top-up ───────
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { amount } = req.body as { amount?: number };
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    res.status(400).json({ error: "Monto inválido" });
    return;
  }
  const amt = Math.round(Number(amount) * 100) / 100;
  if (amt < 5) { res.status(400).json({ error: "El monto mínimo de recarga es Bs 5" }); return; }
  if (amt > 5000) { res.status(400).json({ error: "El monto máximo de recarga es Bs 5.000" }); return; }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!users.length || users[0].status !== "active") {
    res.status(400).json({ error: "Tu cuenta debe estar verificada para recargar" });
    return;
  }

  let checkoutId = `topup-${req.userId}-${Date.now()}`;
  let qrImage = "";
  let qrError = "";

  try {
    const apiKey = await getPaymentApiKey();
    if (!apiKey) {
      qrError = "API key de pagos no configurada";
    } else {
      const response = await fetch(`${PAYMENT_API_URL}/generate-qr`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt }),
      });
      if (response.ok) {
        const data = await response.json() as { qrImage: string; transactionId: string };
        checkoutId = data.transactionId;
        qrImage = data.qrImage.startsWith("data:") ? data.qrImage : `data:image/png;base64,${data.qrImage}`;
      } else {
        const body = await response.text().catch(() => "");
        qrError = `Error ${response.status} de Enlazo: ${body.slice(0, 200)}`;
        req.log.error({ status: response.status, body }, "wallet top-up generate-qr API error");
      }
    }
  } catch (err) {
    qrError = err instanceof Error ? err.message : "Error de red al generar QR";
    req.log.error({ err }, "wallet top-up generate-qr error");
  }

  // Create pending top-up record
  const [topUp] = await db.insert(walletTopUpsTable).values({
    userId: req.userId!,
    amount: amt.toFixed(2),
    checkoutId,
    status: "pending",
  }).returning();

  req.log.info({ user_id: req.userId, amount: amt, checkout_id: checkoutId }, "wallet top-up created");

  res.status(201).json({
    id: topUp.id,
    checkout_id: checkoutId,
    qr_image: qrImage || undefined,
    qr_error: qrError || undefined,
  });
});

// ── POST /api/wallet-top-ups/static — submit static QR receipt ────────────
router.post("/static", requireAuth, async (req: AuthRequest, res) => {
  const { amount, receipt_url } = req.body as { amount?: number; receipt_url?: string };
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    res.status(400).json({ error: "Monto inválido" });
    return;
  }
  if (!receipt_url?.trim()) { res.status(400).json({ error: "Comprobante requerido" }); return; }

  const amt = Math.round(Number(amount) * 100) / 100;
  if (amt < 5) { res.status(400).json({ error: "El monto mínimo de recarga es Bs 5" }); return; }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!users.length || users[0].status !== "active") {
    res.status(400).json({ error: "Tu cuenta debe estar verificada para recargar" });
    return;
  }

  const [topUp] = await db.insert(walletTopUpsTable).values({
    userId: req.userId!,
    amount: amt.toFixed(2),
    status: "pending",
    receiptUrl: receipt_url.trim(),
  }).returning();

  req.log.info({ user_id: req.userId, amount: amt, top_up_id: topUp.id }, "wallet top-up static created");

  res.status(201).json({ id: topUp.id, status: "pending" });
});

// ── GET /api/wallet-top-ups/:checkoutId/status — poll Enlazo for top-up ──
router.get("/:checkoutId/status", requireAuth, async (req: AuthRequest, res) => {
  const checkoutId = String(req.params.checkoutId);

  // Fast-path: already approved in DB
  const rows = await db.select().from(walletTopUpsTable)
    .where(and(eq(walletTopUpsTable.checkoutId, checkoutId), eq(walletTopUpsTable.userId, req.userId!)))
    .limit(1);

  if (rows.length) {
    if (rows[0].status === "approved") {
      res.json({ checkout_id: checkoutId, status: "completed" });
      return;
    }
    if (rows[0].status === "rejected" || rows[0].status === "refunded") {
      res.json({ checkout_id: checkoutId, status: "failed" });
      return;
    }
  }

  // Ask Enlazo API
  try {
    const apiKey = await getPaymentApiKey();
    if (!apiKey) { res.json({ checkout_id: checkoutId, status: "pending" }); return; }

    const response = await fetch(`${PAYMENT_API_URL}/check-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: checkoutId }),
    });

    if (!response.ok) { res.json({ checkout_id: checkoutId, status: "pending" }); return; }

    const data = await response.json() as { status: string };

    if (data.status === "COMPLETED") {
      // Find the top-up record
      const topUpRows = await db.select().from(walletTopUpsTable)
        .where(and(eq(walletTopUpsTable.checkoutId, checkoutId), eq(walletTopUpsTable.userId, req.userId!)))
        .limit(1);

      if (!topUpRows.length || topUpRows[0].status !== "pending") {
        res.json({ checkout_id: checkoutId, status: "completed" });
        return;
      }

      const topUp = topUpRows[0];
      const amt = parseFloat(topUp.amount as string);

      await db.transaction(async (tx) => {
        await tx.update(walletTopUpsTable)
          .set({ status: "approved", reviewedAt: new Date() })
          .where(and(
            eq(walletTopUpsTable.id, topUp.id),
            eq(walletTopUpsTable.status, "pending"),
          ));

        await tx.execute(sql`UPDATE users SET balance = balance + ${amt} WHERE id = ${topUp.userId}`);

        await tx.insert(auditLogsTable).values({
          action: "wallet_top_up_confirmed",
          userId: topUp.userId,
          details: { top_up_id: topUp.id, amount: amt, checkout_id: checkoutId, method: "enlazo_qr" },
        });
      });

      // Push notification
      sendPushToUser(topUp.userId, {
        title: "💰 ¡Recarga exitosa!",
        body: `Se acreditaron Bs ${amt.toFixed(0)} a tu billetera.`,
        url: "/billetera",
      }).catch(() => {});

      req.log.info({ user_id: req.userId, amount: amt, checkout_id: checkoutId }, "wallet top-up confirmed via Enlazo");
      res.json({ checkout_id: checkoutId, status: "completed" });
      return;
    }

    res.json({ checkout_id: checkoutId, status: "pending" });
  } catch (err) {
    req.log.error({ err }, "wallet top-up check-status error");
    res.json({ checkout_id: checkoutId, status: "pending" });
  }
});

// ── GET /api/wallet-top-ups/my — user's top-up history ────────────────────
router.get("/my", requireAuth, async (req: AuthRequest, res) => {
  const rows = await db.select().from(walletTopUpsTable)
    .where(eq(walletTopUpsTable.userId, req.userId!))
    .orderBy(desc(walletTopUpsTable.createdAt))
    .limit(50);

  res.json(rows.map(r => ({
    id: r.id,
    amount: parseFloat(r.amount as string),
    status: r.status,
    receipt_url: r.receiptUrl ?? null,
    admin_notes: r.adminNotes ?? null,
    created_at: r.createdAt,
  })));
});

// ────────────────────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

// ── GET /api/wallet-top-ups — admin list ──────────────────────────────────
router.get("/", requireAdmin, async (req: AuthRequest, res) => {
  const statusFilter = req.query.status as string | undefined;
  let query = db.select({
    t: walletTopUpsTable,
    userName: usersTable.fullName,
    userCi: usersTable.ci,
    userPhone: usersTable.phone,
    userDepartment: usersTable.department,
  })
    .from(walletTopUpsTable)
    .leftJoin(usersTable, eq(walletTopUpsTable.userId, usersTable.id))
    .orderBy(desc(walletTopUpsTable.createdAt))
    .$dynamic();

  // Admin only manages manual receipt top-ups — Enlazo QR ones are auto-confirmed by the API
  const baseCondition = sql`${walletTopUpsTable.receiptUrl} IS NOT NULL`;

  if (statusFilter && ["pending", "approved", "rejected", "refunded"].includes(statusFilter)) {
    query = query.where(and(baseCondition, eq(walletTopUpsTable.status, statusFilter as "pending" | "approved" | "rejected" | "refunded")));
  } else {
    query = query.where(baseCondition);
  }

  const rows = await query.limit(200);
  res.json(rows.map(({ t, userName, userCi, userPhone, userDepartment }) => ({
    id: t.id,
    user_id: t.userId,
    user_name: userName ?? null,
    user_ci: userCi ?? null,
    user_phone: userPhone ?? null,
    user_department: userDepartment ?? null,
    amount: parseFloat(t.amount as string),
    status: t.status,
    checkout_id: t.checkoutId ?? null,
    receipt_url: t.receiptUrl ?? null,
    admin_notes: t.adminNotes ?? null,
    reviewed_at: t.reviewedAt ?? null,
    created_at: t.createdAt,
  })));
});

// ── PUT /api/wallet-top-ups/:id/approve — admin approves ──────────────────
router.put("/:id/approve", requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const rows = await db.select().from(walletTopUpsTable).where(eq(walletTopUpsTable.id, id)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Recarga no encontrada" }); return; }
  const topUp = rows[0];
  if (topUp.status !== "pending") { res.status(400).json({ error: "Recarga ya procesada" }); return; }

  const { notes } = req.body as { notes?: string };
  const amt = parseFloat(topUp.amount as string);

  let alreadyDone = false;
  await db.transaction(async (tx) => {
    const [flipped] = await tx.update(walletTopUpsTable)
      .set({ status: "approved", adminNotes: notes?.trim() ?? null, reviewedById: req.userId!, reviewedAt: new Date() })
      .where(and(eq(walletTopUpsTable.id, id), eq(walletTopUpsTable.status, "pending")))
      .returning();

    if (!flipped) { alreadyDone = true; return; }

    await tx.execute(sql`UPDATE users SET balance = balance + ${amt} WHERE id = ${topUp.userId}`);

    await tx.insert(auditLogsTable).values({
      action: "wallet_top_up_approved",
      userId: topUp.userId,
      details: { top_up_id: id, amount: amt, reviewed_by: req.userId, notes: notes?.trim() ?? null },
    });
  });

  if (alreadyDone) { res.status(400).json({ error: "Recarga ya procesada" }); return; }

  sendPushToUser(topUp.userId, {
    title: "💰 ¡Recarga aprobada!",
    body: `Se acreditaron Bs ${amt.toFixed(0)} a tu billetera.${notes?.trim() ? ` Nota: ${notes.trim()}` : ""}`,
    url: "/billetera",
  }).catch(() => {});

  req.log.info({ admin_id: req.userId, top_up_id: id, amount: amt }, "wallet top-up approved");
  res.json({ id, status: "approved" });
});

// ── PUT /api/wallet-top-ups/:id/reject — admin rejects ────────────────────
router.put("/:id/reject", requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { notes } = req.body as { notes?: string };
  if (!notes?.trim()) { res.status(400).json({ error: "El motivo de rechazo es obligatorio" }); return; }

  const rows = await db.select().from(walletTopUpsTable).where(eq(walletTopUpsTable.id, id)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Recarga no encontrada" }); return; }
  const topUp = rows[0];
  if (topUp.status !== "pending") { res.status(400).json({ error: "Recarga ya procesada" }); return; }

  let alreadyDone = false;
  await db.transaction(async (tx) => {
    const [flipped] = await tx.update(walletTopUpsTable)
      .set({ status: "rejected", adminNotes: notes.trim(), reviewedById: req.userId!, reviewedAt: new Date() })
      .where(and(eq(walletTopUpsTable.id, id), eq(walletTopUpsTable.status, "pending")))
      .returning();

    if (!flipped) { alreadyDone = true; return; }

    await tx.insert(auditLogsTable).values({
      action: "wallet_top_up_rejected",
      userId: topUp.userId,
      details: { top_up_id: id, notes: notes.trim(), reviewed_by: req.userId },
    });
  });

  if (alreadyDone) { res.status(400).json({ error: "Ya procesada" }); return; }

  sendPushToUser(topUp.userId, {
    title: "❌ Recarga rechazada",
    body: `Tu solicitud de recarga de Bs ${parseFloat(topUp.amount as string).toFixed(0)} fue rechazada. Motivo: ${notes.trim()}`,
    url: "/billetera",
  }).catch(() => {});

  req.log.info({ admin_id: req.userId, top_up_id: id }, "wallet top-up rejected");
  res.json({ id, status: "rejected" });
});

// ── PUT /api/wallet-top-ups/:id/refund — admin refunds ────────────────────
router.put("/:id/refund", requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { amount, notes } = req.body as { amount?: number; notes?: string };
  if (!amount || Number(amount) <= 0) { res.status(400).json({ error: "Monto de reembolso inválido" }); return; }

  const refundAmt = Math.round(Number(amount) * 100) / 100;

  const rows = await db.select().from(walletTopUpsTable).where(eq(walletTopUpsTable.id, id)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Recarga no encontrada" }); return; }
  const topUp = rows[0];

  let alreadyDone = false;
  await db.transaction(async (tx) => {
    const [flipped] = await tx.update(walletTopUpsTable)
      .set({ status: "refunded", adminNotes: notes?.trim() ?? `Reembolso de Bs ${refundAmt}`, reviewedById: req.userId!, reviewedAt: new Date() })
      .where(and(eq(walletTopUpsTable.id, id), eq(walletTopUpsTable.status, "pending")))
      .returning();

    if (!flipped) { alreadyDone = true; return; }

    await tx.execute(sql`UPDATE users SET balance = balance + ${refundAmt} WHERE id = ${topUp.userId}`);

    await tx.insert(auditLogsTable).values({
      action: "wallet_top_up_refunded",
      userId: topUp.userId,
      details: { top_up_id: id, refund_amount: refundAmt, notes: notes?.trim() ?? null, reviewed_by: req.userId },
    });
  });

  if (alreadyDone) { res.status(400).json({ error: "Esta recarga ya fue procesada. Solo se puede reembolsar recargas pendientes." }); return; }

  sendPushToUser(topUp.userId, {
    title: "🔄 Reembolso acreditado",
    body: `Se acreditaron Bs ${refundAmt.toFixed(0)} a tu billetera por tu recarga anterior.`,
    url: "/billetera",
  }).catch(() => {});

  req.log.info({ admin_id: req.userId, top_up_id: id, refund_amount: refundAmt }, "wallet top-up refunded");
  res.json({ id, status: "refunded", refund_amount: refundAmt });
});

export { router as walletTopUpsRouter };
