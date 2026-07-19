import { Router } from "express";
import { db, usersTable, nameChangeRequestsTable, ciChangeRequestsTable, withdrawalsTable, winnersTable, auditLogsTable, gamesTable, feedItemsTable, cardsTable, partnersTable, partnerPaymentsTable, operatingExpensesTable, activatorRequestsTable, referralCodesTable, activatorSettingsTable, referralTransactionsTable } from "@workspace/db";
import { sendPushToUser, sendPushToUsers } from "../lib/push";
import { eq, and, like, sql, desc, gte, lte, or } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  AdminListUsersQueryParams,
  AdminVerifyUserParams,
  AdminVerifyUserBody,
  AdminResolveNameChangeParams,
  AdminResolveNameChangeBody,
  AdminListWithdrawalsQueryParams,
  AdminMarkWithdrawalPaidParams,
  AdminValidateWinnerParams,
  AdminValidateWinnerBody,
  AdminGetAuditLogsQueryParams,
} from "@workspace/api-zod";
import { formatUser } from "./auth";

const router = Router();

// All admin routes require admin auth
router.use(requireAdmin);

function formatUserList(user: typeof usersTable.$inferSelect) {
  return formatUser(user);
}

router.get("/users", async (req: AuthRequest, res) => {
  const query = AdminListUsersQueryParams.safeParse(req.query);
  let users;
  if (query.success && query.data.status) {
    users = await db.select().from(usersTable).where(eq(usersTable.status, query.data.status as "pending" | "active" | "rejected")).limit(2000);
  } else {
    users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt)).limit(2000);
  }
  res.json(users.map(formatUserList));
});

router.get("/users/search", async (req: AuthRequest, res) => {
  const ci = String(req.query.ci ?? "").trim();
  if (!ci || ci.length < 3) { res.status(400).json({ error: "Ingresa al menos 3 caracteres" }); return; }
  const users = await db.select().from(usersTable)
    .where(sql`${usersTable.ci} ILIKE ${"%" + ci + "%"}`)
    .limit(10);
  res.json(users.map(formatUser));
});

router.post("/users/:id/verify", async (req: AuthRequest, res) => {
  const p = AdminVerifyUserParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const parsed = AdminVerifyUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }

  const [user] = await db.update(usersTable).set(
    parsed.data.approved
      ? { status: "active", rejectionReason: null }
      : {
          status: "rejected",
          needsCiUpload: true,
          idPhotoFrontUrl: null,
          idPhotoBackUrl: null,
          rejectionReason: ((req.body as any).reason?.trim() || "Documentos no válidos"),
        }
  ).where(eq(usersTable.id, p.data.id)).returning();
  if (!user) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  res.json(formatUser(user));
  if (parsed.data.approved) {
    sendPushToUser(p.data.id, {
      title: "✅ Cuenta verificada",
      body: "Tu identidad fue aprobada. Ya podés comprar cartones y jugar al bingo.",
      url: "/games",
    }).catch(() => {});
  } else {
    sendPushToUser(p.data.id, {
      title: "❌ Verificación rechazada",
      body: "Tus documentos no fueron aceptados. Volvé a subir tu CI desde tu perfil.",
      url: "/profile",
    }).catch(() => {});
  }
});

router.get("/name-change-requests", async (req: AuthRequest, res) => {
  const offset = Math.max(0, parseInt(String(req.query.offset ?? "0")) || 0);
  const statusFilter = req.query.status as string | undefined;
  const fetchLimit = ADMIN_PAGE_SIZE + 1;

  const whereClause = statusFilter && ["pending","approved","rejected"].includes(statusFilter)
    ? eq(nameChangeRequestsTable.status, statusFilter as "pending"|"approved"|"rejected")
    : undefined;

  const rows = await db
    .select({
      r: nameChangeRequestsTable,
      userName: usersTable.fullName,
      userCi: usersTable.ci,
      regPhotoFront: usersTable.idPhotoFrontUrl,
      regPhotoBack: usersTable.idPhotoBackUrl,
    })
    .from(nameChangeRequestsTable)
    .leftJoin(usersTable, eq(nameChangeRequestsTable.userId, usersTable.id))
    .where(whereClause)
    .orderBy(desc(nameChangeRequestsTable.createdAt))
    .limit(fetchLimit).offset(offset);

  const hasMore = rows.length > ADMIN_PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, ADMIN_PAGE_SIZE) : rows;

  res.json({
    items: pageRows.map(({ r, userName, userCi, regPhotoFront, regPhotoBack }) => ({
      id: r.id,
      user_id: r.userId,
      user_name: userName ?? null,
      user_ci: userCi ?? null,
      requested_name: r.requestedName,
      reg_photo_front_url: regPhotoFront ?? null,
      reg_photo_back_url: regPhotoBack ?? null,
      status: r.status,
      admin_notes: r.adminNotes ?? null,
      created_at: r.createdAt,
    })),
    has_more: hasMore,
  });
});

router.get("/ci-change-requests", async (req: AuthRequest, res) => {
  const offset = Math.max(0, parseInt(String(req.query.offset ?? "0")) || 0);
  const statusFilter = req.query.status as string | undefined;
  const fetchLimit = ADMIN_PAGE_SIZE + 1;

  const whereClause = statusFilter && ["pending","approved","rejected"].includes(statusFilter)
    ? eq(ciChangeRequestsTable.status, statusFilter as "pending"|"approved"|"rejected")
    : undefined;

  const rows = await db
    .select({
      r: ciChangeRequestsTable,
      userName: usersTable.fullName,
      regPhotoFront: usersTable.idPhotoFrontUrl,
      regPhotoBack: usersTable.idPhotoBackUrl,
    })
    .from(ciChangeRequestsTable)
    .leftJoin(usersTable, eq(ciChangeRequestsTable.userId, usersTable.id))
    .where(whereClause)
    .orderBy(desc(ciChangeRequestsTable.createdAt))
    .limit(fetchLimit).offset(offset);

  const hasMore = rows.length > ADMIN_PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, ADMIN_PAGE_SIZE) : rows;

  res.json({
    items: pageRows.map(({ r, userName, regPhotoFront, regPhotoBack }) => ({
      id: r.id,
      user_id: r.userId,
      user_name: userName ?? null,
      current_ci: r.currentCi,
      requested_ci: r.requestedCi,
      photo_front_url: r.photoFrontUrl ?? null,
      photo_back_url: r.photoBackUrl ?? null,
      reg_photo_front_url: regPhotoFront ?? null,
      reg_photo_back_url: regPhotoBack ?? null,
      status: r.status,
      admin_notes: r.adminNotes ?? null,
      created_at: r.createdAt,
    })),
    has_more: hasMore,
  });
});

router.patch("/ci-change-requests/:id", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { approved, admin_notes } = req.body as { approved: boolean; admin_notes?: string };
  if (typeof approved !== "boolean") { res.status(400).json({ error: "Campo 'approved' requerido" }); return; }

  const rows = await db.select().from(ciChangeRequestsTable).where(eq(ciChangeRequestsTable.id, id)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  const req2 = rows[0];
  if (req2.status !== "pending") { res.status(400).json({ error: "Solicitud ya resuelta" }); return; }

  const newStatus = approved ? "approved" : "rejected";
  const [updated] = await db.update(ciChangeRequestsTable)
    .set({ status: newStatus, adminNotes: admin_notes?.trim() ?? null, resolvedAt: new Date() })
    .where(eq(ciChangeRequestsTable.id, id))
    .returning();

  if (approved) {
    await db.update(usersTable).set({ ci: req2.requestedCi }).where(eq(usersTable.id, req2.userId));
  }

  req.log.info({ admin_id: req.userId, ci_request_id: id, approved }, "CI change request resolved");
  res.json({
    id: updated.id,
    user_id: updated.userId,
    current_ci: updated.currentCi,
    requested_ci: updated.requestedCi,
    status: updated.status,
    admin_notes: updated.adminNotes ?? null,
    created_at: updated.createdAt,
  });
  sendPushToUser(req2.userId, approved ? {
    title: "✅ Cambio de CI aprobado",
    body: `Tu nuevo CI (${req2.requestedCi}) fue actualizado correctamente en tu cuenta.`,
    url: "/profile",
  } : {
    title: "❌ Cambio de CI rechazado",
    body: admin_notes?.trim() ? `Motivo: ${admin_notes.trim()}` : "Tu solicitud de cambio de CI no fue aceptada.",
    url: "/profile",
  }).catch(() => {});
});

router.patch("/name-change-requests/:id", async (req: AuthRequest, res) => {
  const p = AdminResolveNameChangeParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const parsed = AdminResolveNameChangeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }

  const requests = await db.select().from(nameChangeRequestsTable).where(eq(nameChangeRequestsTable.id, p.data.id)).limit(1);
  if (!requests.length) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }

  const newStatus = parsed.data.approved ? "approved" : "rejected";
  const [updated] = await db.update(nameChangeRequestsTable)
    .set({ status: newStatus, adminNotes: parsed.data.admin_notes ?? null, resolvedAt: new Date() })
    .where(eq(nameChangeRequestsTable.id, p.data.id))
    .returning();

  // If approved, update user name
  if (parsed.data.approved) {
    await db.update(usersTable).set({ fullName: requests[0].requestedName }).where(eq(usersTable.id, requests[0].userId));
  }

  res.json({
    id: updated.id,
    user_id: updated.userId,
    requested_name: updated.requestedName,
    status: updated.status,
    admin_notes: updated.adminNotes ?? null,
    created_at: updated.createdAt,
  });
  sendPushToUser(requests[0].userId, parsed.data.approved ? {
    title: "✅ Cambio de nombre aprobado",
    body: `Tu nombre fue actualizado a "${requests[0].requestedName}" correctamente.`,
    url: "/profile",
  } : {
    title: "❌ Cambio de nombre rechazado",
    body: parsed.data.admin_notes?.trim() ? `Motivo: ${parsed.data.admin_notes.trim()}` : "Tu solicitud de cambio de nombre no fue aceptada.",
    url: "/profile",
  }).catch(() => {});
});

const ADMIN_PAGE_SIZE = 50;

router.get("/withdrawals", async (req: AuthRequest, res) => {
  const query = AdminListWithdrawalsQueryParams.safeParse(req.query);
  const offset = Math.max(0, parseInt(String(req.query.offset ?? "0")) || 0);
  const fetchLimit = ADMIN_PAGE_SIZE + 1;

  let rows;
  if (query.success && query.data.status) {
    rows = await db
      .select({ w: withdrawalsTable, userName: usersTable.fullName })
      .from(withdrawalsTable)
      .leftJoin(usersTable, eq(withdrawalsTable.userId, usersTable.id))
      .where(eq(withdrawalsTable.status, query.data.status as "pending" | "paid" | "rejected"))
      .orderBy(desc(withdrawalsTable.createdAt))
      .limit(fetchLimit).offset(offset);
  } else {
    rows = await db
      .select({ w: withdrawalsTable, userName: usersTable.fullName })
      .from(withdrawalsTable)
      .leftJoin(usersTable, eq(withdrawalsTable.userId, usersTable.id))
      .orderBy(desc(withdrawalsTable.createdAt))
      .limit(fetchLimit).offset(offset);
  }
  const hasMore = rows.length > ADMIN_PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, ADMIN_PAGE_SIZE) : rows;

  res.json({
    items: pageRows.map(({ w, userName }) => ({
      id: w.id,
      user_id: w.userId,
      user_name: userName ?? null,
      amount: parseFloat(w.amount),
      method: w.method,
      status: w.status,
      bank_qr_url: w.bankQrUrl ?? null,
      bank_account_info: w.bankAccountInfo ?? null,
      payment_proof_url: w.paymentProofUrl ?? null,
      withdrawal_pin: w.withdrawalPin ?? null,
      notes: w.notes ?? null,
      created_at: w.createdAt,
      paid_at: w.paidAt ?? null,
    })),
    has_more: hasMore,
  });
});

router.post("/withdrawals/:id/mark-paid", async (req: AuthRequest, res) => {
  const p = AdminMarkWithdrawalPaidParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const withdrawals = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, p.data.id)).limit(1);
  if (!withdrawals.length) { res.status(404).json({ error: "Retiro no encontrado" }); return; }
  const withdrawal = withdrawals[0];

  if (withdrawal.status === "paid") { res.status(400).json({ error: "Este retiro ya fue pagado" }); return; }

  const { payment_proof_url, withdrawal_pin, notes } = req.body as { payment_proof_url?: string; withdrawal_pin?: string; notes?: string };

  // Atomic: flip pending→paid and debit in ONE transaction. The conditional
  // WHERE status = 'pending' guarantees a repeated or concurrent mark-paid
  // debits the balance exactly once (no double-debit).
  let updated: typeof withdrawalsTable.$inferSelect | undefined;
  let alreadyPaid = false;
  await db.transaction(async (tx) => {
    const flipped = await tx.update(withdrawalsTable)
      .set({
        status: "paid",
        paidAt: new Date(),
        paymentProofUrl: payment_proof_url ?? null,
        withdrawalPin: withdrawal_pin ?? null,
        notes: notes?.trim() ?? null,
      })
      .where(and(eq(withdrawalsTable.id, p.data.id), eq(withdrawalsTable.status, "pending")))
      .returning();
    if (!flipped.length) { alreadyPaid = true; return; }
    updated = flipped[0];
    await tx.execute(
      sql`UPDATE users SET balance = balance - ${parseFloat(withdrawal.amount)} WHERE id = ${withdrawal.userId}`
    );
  });
  if (alreadyPaid || !updated) { res.status(400).json({ error: "Este retiro ya fue procesado" }); return; }

  // Get user info for public feed announcement
  const userRows = await db.select().from(usersTable).where(eq(usersTable.id, withdrawal.userId)).limit(1);
  if (userRows.length) {
    const u = userRows[0];
    const parts = u.fullName.trim().split(/\s+/);
    const displayName = parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0];
    const dept = u.department ?? "";
    await db.insert(feedItemsTable).values({
      type: "withdrawal",
      message: `${displayName}${dept ? ` de ${dept}` : ""} retiró Bs ${parseFloat(updated.amount).toFixed(2)}`,
      amount: updated.amount,
      userDisplayName: displayName,
    });
  }

  // Push automático al usuario
  sendPushToUser(updated.userId, {
    title: "💸 Retiro procesado",
    body: `Tu retiro de Bs ${parseFloat(updated.amount).toFixed(2)} fue enviado correctamente.`,
    url: "/wallet",
  }).catch(() => {});

  res.json({
    id: updated.id,
    user_id: updated.userId,
    amount: parseFloat(updated.amount),
    method: updated.method,
    status: updated.status,
    bank_qr_url: updated.bankQrUrl ?? null,
    bank_account_info: updated.bankAccountInfo ?? null,
    payment_proof_url: updated.paymentProofUrl ?? null,
    withdrawal_pin: updated.withdrawalPin ?? null,
    notes: updated.notes ?? null,
    created_at: updated.createdAt,
    paid_at: updated.paidAt ?? null,
  });
});

router.patch("/withdrawals/:id/pin", requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { withdrawal_pin } = req.body as { withdrawal_pin?: string };
  if (!withdrawal_pin?.trim()) { res.status(400).json({ error: "El PIN es obligatorio" }); return; }

  const rows = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, id)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Retiro no encontrado" }); return; }
  if (rows[0].status !== "paid") { res.status(400).json({ error: "Solo se puede reenviar el PIN de retiros ya aprobados" }); return; }

  const [updated] = await db.update(withdrawalsTable)
    .set({ withdrawalPin: withdrawal_pin.trim() })
    .where(eq(withdrawalsTable.id, id))
    .returning();

  req.log.info({ admin_id: req.userId, withdrawal_id: id }, "withdrawal pin updated");
  res.json({ withdrawal_pin: updated.withdrawalPin });
});

router.post("/withdrawals/:id/reject", async (req: AuthRequest, res) => {
  const p = AdminMarkWithdrawalPaidParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const { notes } = req.body as { notes?: string };
  if (!notes?.trim()) { res.status(400).json({ error: "El motivo de rechazo es obligatorio" }); return; }

  const withdrawals = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, p.data.id)).limit(1);
  if (!withdrawals.length) { res.status(404).json({ error: "Retiro no encontrado" }); return; }
  if (withdrawals[0].status !== "pending") { res.status(400).json({ error: "Solo se puede rechazar un retiro pendiente" }); return; }

  const [updated] = await db.update(withdrawalsTable)
    .set({ status: "rejected", notes: notes.trim() })
    .where(and(eq(withdrawalsTable.id, p.data.id), eq(withdrawalsTable.status, "pending")))
    .returning();

  if (!updated) { res.status(400).json({ error: "No se pudo rechazar el retiro" }); return; }

  res.json({
    id: updated.id,
    user_id: updated.userId,
    amount: parseFloat(updated.amount),
    status: updated.status,
    notes: updated.notes ?? null,
  });
  sendPushToUser(updated.userId, {
    title: "❌ Retiro rechazado",
    body: `Tu retiro de Bs ${parseFloat(updated.amount).toFixed(2)} fue rechazado. Motivo: ${notes.trim()}`,
    url: "/wallet",
  }).catch(() => {});
});

// All unvalidated bingo claims across every game — admin uses this for real-time monitoring
// ── All validated winners with optional date range filter ────────────────────
router.get("/winners", async (req: AuthRequest, res) => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const conditions: ReturnType<typeof eq>[] = [eq(winnersTable.validated, true)];
  if (from) {
    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    conditions.push(gte(winnersTable.createdAt, fromDate) as any);
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(winnersTable.createdAt, toDate) as any);
  }

  const rows = await db
    .select({
      id: winnersTable.id,
      game_id: winnersTable.gameId,
      game_title: gamesTable.title,
      user_id: winnersTable.userId,
      user_name: usersTable.fullName,
      user_department: usersTable.department,
      card_id: winnersTable.cardId,
      round: winnersTable.round,
      place: winnersTable.place,
      prize_amount: winnersTable.prizeAmount,
      is_historical: winnersTable.isHistorical,
      created_at: winnersTable.createdAt,
    })
    .from(winnersTable)
    .innerJoin(usersTable, eq(winnersTable.userId, usersTable.id))
    .innerJoin(gamesTable, eq(winnersTable.gameId, gamesTable.id))
    .where(and(...(conditions as any)))
    .orderBy(desc(winnersTable.createdAt));

  res.json(rows.map(w => ({
    ...w,
    prize_amount: parseFloat(w.prize_amount),
  })));
});

router.get("/winners/pending", async (_req, res) => {
  const rows = await db
    .select({
      id: winnersTable.id,
      game_id: winnersTable.gameId,
      game_title: gamesTable.title,
      user_id: winnersTable.userId,
      user_name: usersTable.fullName,
      card_id: winnersTable.cardId,
      place: winnersTable.place,
      prize_amount: winnersTable.prizeAmount,
      claimed_at_ms: winnersTable.claimedAtMs,
      validated: winnersTable.validated,
      admin_notes: winnersTable.adminNotes,
      created_at: winnersTable.createdAt,
    })
    .from(winnersTable)
    .innerJoin(usersTable, eq(winnersTable.userId, usersTable.id))
    .innerJoin(gamesTable, eq(winnersTable.gameId, gamesTable.id))
    .where(eq(winnersTable.validated, false))
    .orderBy(desc(winnersTable.createdAt));

  res.json(rows.map(w => ({
    ...w,
    prize_amount: parseFloat(w.prize_amount),
    claimed_at_ms: parseInt(w.claimed_at_ms),
  })));
});

router.post("/winners/:id/validate", async (req: AuthRequest, res) => {
  const p = AdminValidateWinnerParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const parsed = AdminValidateWinnerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }

  const winners = await db.select().from(winnersTable).where(eq(winnersTable.id, p.data.id)).limit(1);
  if (!winners.length) { res.status(404).json({ error: "Ganador no encontrado" }); return; }
  const winner = winners[0];

  if (parsed.data.approved) {
    // ── Pre-fetch commission data (before transaction) ────────────────────────
    let commAmount = 0;
    let commPct = 0;
    let activatorId: number | null = null;

    try {
      const winnerUser = await db.select({ referredByCode: usersTable.referredByCode })
        .from(usersTable).where(eq(usersTable.id, winner.userId)).limit(1);
      const refCode = winnerUser[0]?.referredByCode;

      if (refCode) {
        const codeRow = await db.select({ userId: referralCodesTable.userId })
          .from(referralCodesTable)
          .where(and(eq(referralCodesTable.code, refCode), eq(referralCodesTable.isActive, true)))
          .limit(1);

        if (codeRow.length) {
          const settings = await db.select().from(activatorSettingsTable)
            .where(eq(activatorSettingsTable.id, 1)).limit(1);
          const pct = parseFloat(settings[0]?.commissionPercentage ?? "5");
          const duration = settings[0]?.commissionDuration ?? "indefinite";
          const durationMonths = settings[0]?.commissionDurationMonths ?? null;
          const candId = codeRow[0].userId;

          let applyCommission = true;
          if (duration === "once") {
            const prev = await db.select({ id: referralTransactionsTable.id })
              .from(referralTransactionsTable)
              .where(and(
                eq(referralTransactionsTable.type, "commission"),
                eq(referralTransactionsTable.activatorId, candId),
                eq(referralTransactionsTable.referredUserId, winner.userId),
              )).limit(1);
            if (prev.length) applyCommission = false;
          } else if (duration === "monthly" && durationMonths) {
            const refTxRow = await db.select({ createdAt: referralTransactionsTable.createdAt })
              .from(referralTransactionsTable)
              .where(and(
                eq(referralTransactionsTable.type, "welcome_bonus"),
                eq(referralTransactionsTable.referredUserId, winner.userId),
              )).limit(1);
            if (refTxRow.length) {
              const monthsElapsed = (Date.now() - refTxRow[0].createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
              if (monthsElapsed > durationMonths) applyCommission = false;
            }
          }

          if (applyCommission && pct > 0) {
            const candidate = parseFloat((parseFloat(winner.prizeAmount) * pct / 100).toFixed(2));
            if (candidate > 0) {
              commAmount = candidate;
              commPct = pct;
              activatorId = candId;
            }
          }
        }
      }
    } catch (err) {
      req.log.error({ err }, "Error computing referral commission, defaulting to 0");
    }

    const prizeTotal = parseFloat(winner.prizeAmount);
    const netPrize = parseFloat((prizeTotal - commAmount).toFixed(2));

    // ── Atomic transaction: validate + credit winner (net) + credit activator ─
    let alreadyValidated = false;
    await db.transaction(async (tx) => {
      const flipped = await tx.update(winnersTable)
        .set({ validated: true, adminNotes: parsed.data.notes ?? null })
        .where(and(eq(winnersTable.id, p.data.id), eq(winnersTable.validated, false)))
        .returning();
      if (!flipped.length) { alreadyValidated = true; return; }

      // Credit net prize to winner (full prize minus activator commission)
      await tx.execute(
        sql`UPDATE users SET balance = balance + ${netPrize} WHERE id = ${winner.userId}`
      );

      // Credit commission to activator and record the transaction
      if (activatorId && commAmount > 0) {
        await tx.execute(
          sql`UPDATE users SET balance = balance + ${commAmount} WHERE id = ${activatorId}`
        );
        const winnerUserName = (await tx.select({ fullName: usersTable.fullName })
          .from(usersTable).where(eq(usersTable.id, winner.userId)).limit(1))[0]
          ?.fullName?.trim().split(/\s+/).slice(0, 2).join(" ") ?? "Usuario";
        await tx.insert(referralTransactionsTable).values({
          type: "commission",
          activatorId,
          referredUserId: winner.userId,
          gameId: winner.gameId,
          winnerId: winner.id,
          amount: String(commAmount),
          commissionPercentage: String(commPct),
          description: `Comisión ${commPct}% por ganancia de ${winnerUserName} — Premio: Bs ${prizeTotal.toFixed(2)}`,
        });
        // Notify activator about their commission
        sendPushToUser(activatorId, {
          title: "💰 ¡Comisión recibida!",
          body: `${winnerUserName} ganó y recibiste Bs ${commAmount.toFixed(2)} de comisión (${commPct}%). Ya está en tu billetera.`,
          url: "/wallet",
        }).catch(() => {});
      }
    });
    if (alreadyValidated) { res.status(400).json({ error: "Este ganador ya fue validado" }); return; }

    // Get user name for feed
    const users = await db.select().from(usersTable).where(eq(usersTable.id, winner.userId)).limit(1);
    const _uW = users[0];
    const _wParts = _uW?.fullName?.trim().split(/\s+/) ?? [];
    const _wShort = _wParts.length >= 2 ? `${_wParts[0]} ${_wParts[1]}` : (_wParts[0] ?? "Un jugador");
    const _wDept = _uW?.department ?? "";
    const userName = `${_wShort}${_wDept ? ` de ${_wDept}` : ""}`;

    // Add to public feed
    await db.insert(feedItemsTable).values({
      type: "winner",
      message: `¡${userName} ganó Bs ${prizeTotal.toFixed(2)}!`,
      amount: winner.prizeAmount,
      userDisplayName: userName,
    });
    // Notify the winner
    sendPushToUser(winner.userId, {
      title: "🎉 ¡BINGO validado!",
      body: `Tu bingo fue confirmado. Ganaste Bs ${netPrize.toFixed(2)}. Ya podés retirarlo desde tu billetera.`,
      url: "/wallet",
    }).catch(() => {});
  } else {
    await db.update(winnersTable).set({ adminNotes: parsed.data.notes ?? null }).where(eq(winnersTable.id, p.data.id));
    // Notify the player their claim was rejected
    sendPushToUser(winner.userId, {
      title: "❌ Reclamo de BINGO rechazado",
      body: parsed.data.notes?.trim() ? `Motivo: ${parsed.data.notes.trim()}` : "Tu reclamo de BINGO no fue válido. Seguí jugando.",
      url: "/my-cards",
    }).catch(() => {});
  }

  const [updated] = await db.select({
    id: winnersTable.id,
    game_id: winnersTable.gameId,
    user_id: winnersTable.userId,
    card_id: winnersTable.cardId,
    place: winnersTable.place,
    prize_amount: winnersTable.prizeAmount,
    claimed_at_ms: winnersTable.claimedAtMs,
    validated: winnersTable.validated,
    user_name: usersTable.fullName,
    created_at: winnersTable.createdAt,
  }).from(winnersTable)
    .innerJoin(usersTable, eq(winnersTable.userId, usersTable.id))
    .where(eq(winnersTable.id, p.data.id));

  res.json({
    ...updated,
    prize_amount: parseFloat(updated.prize_amount),
    claimed_at_ms: parseInt(updated.claimed_at_ms),
  });
});

router.get("/audit-logs", async (req: AuthRequest, res) => {
  const offset = Math.max(0, parseInt(String(req.query.offset ?? "0")) || 0);
  const fetchLimit = ADMIN_PAGE_SIZE + 1;

  const logs = await db.select().from(auditLogsTable)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(fetchLimit).offset(offset);

  const hasMore = logs.length > ADMIN_PAGE_SIZE;
  const pageLogs = hasMore ? logs.slice(0, ADMIN_PAGE_SIZE) : logs;

  res.json({
    items: pageLogs.map(l => ({
      id: l.id,
      action: l.action,
      user_id: l.userId ?? null,
      game_id: l.gameId ?? null,
      card_id: l.cardId ?? null,
      details: l.details ?? {},
      ip_address: l.ipAddress ?? null,
      created_at: l.createdAt,
    })),
    has_more: hasMore,
  });
});

router.get("/stats", async (req: AuthRequest, res) => {
  const totalUsers = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
  const activeGames = await db.select({ count: sql<number>`count(*)` }).from(gamesTable).where(eq(gamesTable.status, "active"));
  const totalCardsSold = await db.select({ count: sql<number>`count(*)` }).from(winnersTable);
  const totalPrizes = await db.select({ total: sql<string>`coalesce(sum(prize_amount), 0)` }).from(winnersTable).where(eq(winnersTable.validated, true));
  const pendingWithdrawals = await db.select({ count: sql<number>`count(*)` }).from(withdrawalsTable).where(eq(withdrawalsTable.status, "pending"));
  const pendingVerifications = await db.select({ count: sql<number>`count(*)` }).from(usersTable).where(eq(usersTable.status, "pending"));
  const totalRevenue = await db.select({ total: sql<string>`coalesce(sum(${gamesTable.cardPrice}), 0)` })
    .from(cardsTable)
    .innerJoin(gamesTable, eq(cardsTable.gameId, gamesTable.id))
    .where(eq(cardsTable.paymentStatus, "paid"));

  res.json({
    total_users: Number(totalUsers[0]?.count ?? 0),
    active_games: Number(activeGames[0]?.count ?? 0),
    total_cards_sold: Number(totalCardsSold[0]?.count ?? 0),
    total_prizes_paid: parseFloat(totalPrizes[0]?.total ?? "0"),
    pending_withdrawals_count: Number(pendingWithdrawals[0]?.count ?? 0),
    pending_verifications_count: Number(pendingVerifications[0]?.count ?? 0),
    total_revenue: parseFloat(totalRevenue[0]?.total ?? "0"),
  });
});

// ── Detailed user info ──────────────────────────────────────────────────────
router.get("/users/:id", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  const u = rows[0];

  const [lastIpRows, cardCount, winCount] = await Promise.all([
    db.select({ ip: auditLogsTable.ipAddress, createdAt: auditLogsTable.createdAt })
      .from(auditLogsTable)
      .where(and(eq(auditLogsTable.userId, id), sql`${auditLogsTable.ipAddress} IS NOT NULL`))
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(1),
    db.select({ count: sql<number>`count(*)` }).from(cardsTable).where(eq(cardsTable.userId, id)),
    db.select({ count: sql<number>`count(*)` }).from(winnersTable).where(eq(winnersTable.userId, id)),
  ]);

  const base = formatUserList(u);
  res.json({
    ...base,
    has_photos: !!(u.idPhotoFrontUrl || u.idPhotoBackUrl),
    last_audit_ip: lastIpRows[0]?.ip ?? null,
    last_audit_at: lastIpRows[0]?.createdAt ?? null,
    cards_purchased: Number(cardCount[0]?.count ?? 0),
    wins: Number(winCount[0]?.count ?? 0),
  });
});

// ── User CI photos (separate lazy endpoint) ──────────────────────────────────
router.get("/users/:id/photos", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const rows = await db.select({
    idPhotoFrontUrl: usersTable.idPhotoFrontUrl,
    idPhotoBackUrl: usersTable.idPhotoBackUrl,
  }).from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  res.json({
    id_photo_front_url: rows[0].idPhotoFrontUrl ?? null,
    id_photo_back_url: rows[0].idPhotoBackUrl ?? null,
  });
});

// ── Create user ─────────────────────────────────────────────────────────────
router.post("/users", async (req: AuthRequest, res) => {
  const { full_name, ci, phone, password, department, is_admin, permissions, skip_ci } = req.body as {
    full_name?: string; ci?: string; phone?: string; password?: string; department?: string;
    is_admin?: boolean; permissions?: string[]; skip_ci?: boolean;
  };
  if (!full_name?.trim() || !ci?.trim() || !phone?.trim() || !password || !department?.trim()) {
    res.status(400).json({ error: "Todos los campos son requeridos" }); return;
  }
  if (password.length < 6) { res.status(400).json({ error: "Contraseña mínimo 6 caracteres" }); return; }
  const existing = await db.select().from(usersTable).where(eq(usersTable.ci, ci.trim())).limit(1);
  if (existing.length) { res.status(409).json({ error: "Ya existe un usuario con ese CI" }); return; }
  const hash = await bcrypt.hash(password, 10);
  const isAdminUser = is_admin === true;
  // Admins with specific permissions get those permissions; super admin (is_admin but no perms) gets []
  const adminPerms = isAdminUser && Array.isArray(permissions) ? permissions : [];
  const [created] = await db.insert(usersTable).values({
    fullName: full_name.trim(),
    ci: ci.trim(),
    phone: phone.trim(),
    passwordHash: hash,
    department: department.trim(),
    isAdmin: isAdminUser,
    adminPermissions: adminPerms,
    status: skip_ci ? "active" : "pending",
    needsCiUpload: skip_ci ? false : true,
  }).returning();
  req.log.info({ adminId: req.userId, newUserId: created.id, isAdmin: isAdminUser, perms: adminPerms }, "Admin created user");
  res.status(201).json(formatUser(created));
});

// ── Set user role ────────────────────────────────────────────────────────────
router.put("/users/:id/role", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { is_admin } = req.body as { is_admin?: boolean };
  if (typeof is_admin !== "boolean") { res.status(400).json({ error: "is_admin (boolean) requerido" }); return; }
  if (req.userId === id && !is_admin) {
    res.status(400).json({ error: "No puedes quitarte el rol de admin a ti mismo" }); return;
  }
  const [updated] = await db.update(usersTable).set({ isAdmin: is_admin })
    .where(eq(usersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  req.log.info({ adminId: req.userId, targetId: id, is_admin }, "Admin changed user role");
  res.json(formatUser(updated));
});

// ── List pending + recently approved password reset requests ─────────────────
router.get("/password-resets", async (_req: AuthRequest, res) => {
  // Pending: have a resetToken (no expiry filter — stays until admin acts)
  const pending = await db.select().from(usersTable)
    .where(sql`${usersTable.resetToken} IS NOT NULL`)
    .orderBy(desc(usersTable.createdAt));

  // Approved: mustChangePassword=true AND tempPasswordDisplay set AND still within 24h window
  const approved = await db.select().from(usersTable)
    .where(sql`${usersTable.mustChangePassword} = true AND ${usersTable.tempPasswordDisplay} IS NOT NULL AND ${usersTable.tempPasswordExpiresAt} > NOW()`)
    .orderBy(desc(usersTable.updatedAt));

  function mapUser(u: typeof usersTable.$inferSelect, state: "pending" | "approved") {
    return {
      id: u.id,
      full_name: u.fullName,
      ci: u.ci,
      phone: u.phone,
      department: u.department,
      status: u.status,
      is_banned: u.isBanned,
      ban_reason: u.banReason,
      balance: u.balance,
      requested_at: u.resetTokenExpiresAt,
      updated_at: u.updatedAt,
      photo_front: u.resetPhotoFront,
      photo_back: u.resetPhotoBack,
      photo_selfie: u.resetPhotoSelfie,
      temp_password_display: u.tempPasswordDisplay,
      state,
    };
  }

  res.json({
    pending: pending.map(u => mapUser(u, "pending")),
    approved: approved.map(u => mapUser(u, "approved")),
  });
});

// ── Approve reset: generate temp password and clear reset token ──────────────
router.post("/users/:id/approve-reset", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  if (!rows[0].resetToken) { res.status(400).json({ error: "Este usuario no tiene una solicitud de reset pendiente" }); return; }

  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let tempPassword = "";
  for (let i = 0; i < 8; i++) tempPassword += chars[Math.floor(Math.random() * chars.length)];

  const tempPasswordExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  await db.update(usersTable)
    .set({
      passwordHash,
      mustChangePassword: true,
      tempPasswordDisplay: tempPassword,
      tempPasswordExpiresAt,
      resetToken: null,
      resetTokenExpiresAt: null,
      resetPhotoFront: null,
      resetPhotoBack: null,
      resetPhotoSelfie: null,
    })
    .where(eq(usersTable.id, id));
  await db.insert(auditLogsTable).values({
    action: "admin_approve_password_reset",
    userId: id,
    details: { admin_id: req.userId },
    ipAddress: req.ip,
  });
  res.json({ temp_password: tempPassword, message: "Contraseña temporal generada." });
});

// ── Reject reset request ─────────────────────────────────────────────────────
router.post("/users/:id/reject-reset", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { ban, ban_reason } = req.body as { ban?: boolean; ban_reason?: string };

  const updateData: Partial<typeof usersTable.$inferInsert> = {
    resetToken: null,
    resetTokenExpiresAt: null,
    resetPhotoFront: null,
    resetPhotoBack: null,
    resetPhotoSelfie: null,
  };
  if (ban) {
    updateData.isBanned = true;
    updateData.banReason = ban_reason || "Solicitud de reset rechazada por el admin";
    updateData.status = "rejected";
  }

  const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

  await db.insert(auditLogsTable).values({
    action: ban ? "admin_reject_reset_and_ban" : "admin_reject_reset",
    userId: id,
    details: { admin_id: req.userId, ban_reason: ban_reason ?? null },
    ipAddress: req.ip,
  });
  res.json({ message: ban ? "Solicitud rechazada y usuario baneado" : "Solicitud rechazada" });
});

// ── Set temporary password ──────────────────────────────────────────────────
router.post("/users/:id/set-temp-password", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { temp_password } = req.body as { temp_password?: string };
  if (!temp_password || temp_password.length < 6) {
    res.status(400).json({ error: "La contraseña temporal debe tener al menos 6 caracteres" });
    return;
  }
  const { expires_hours } = req.body as { temp_password?: string; expires_hours?: number };
  const hoursValid = typeof expires_hours === "number" && expires_hours >= 1 && expires_hours <= 720
    ? expires_hours
    : 24;
  const tempPasswordExpiresAt = new Date(Date.now() + hoursValid * 60 * 60 * 1000);
  const passwordHash = await bcrypt.hash(temp_password, 12);
  const [updated] = await db.update(usersTable)
    .set({ passwordHash, mustChangePassword: true, tempPasswordExpiresAt })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  await db.insert(auditLogsTable).values({
    action: "admin_set_temp_password",
    userId: id,
    details: { admin_id: req.userId },
    ipAddress: req.ip,
  });
  res.json({ message: "Contraseña temporal establecida. El usuario deberá cambiarla al ingresar." });
});

// ── Adjust user balance (credit or debit) ───────────────────────────────────
router.post("/users/:id/adjust-balance", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { amount, type, reason } = req.body as { amount?: number; type?: "credit" | "debit"; reason?: string };
  if (!amount || amount <= 0 || !type || !["credit", "debit"].includes(type)) {
    res.status(400).json({ error: "Datos inválidos: se requiere amount > 0 y type (credit|debit)" });
    return;
  }
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

  let newBalance = 0;
  let insufficient = false;
  await db.transaction(async (tx) => {
    const locked = await tx.execute(sql`SELECT balance, admin_credit_balance FROM users WHERE id = ${id} FOR UPDATE`);
    const balance = parseFloat((locked.rows[0]?.balance as string | undefined) ?? "0");
    const adminCredit = parseFloat((locked.rows[0]?.admin_credit_balance as string | undefined) ?? "0");
    if (type === "credit") {
      // Credits go exclusively to admin_credit_balance — not counted as real revenue when spent
      await tx.execute(sql`UPDATE users SET admin_credit_balance = admin_credit_balance + ${amount} WHERE id = ${id}`);
      newBalance = balance + adminCredit + amount;
    } else {
      // Debits: consume admin_credit_balance first, then real balance
      const fromAdminCredit = Math.min(adminCredit, amount);
      const fromBalance = amount - fromAdminCredit;
      if (fromBalance > balance) { insufficient = true; return; }
      if (fromAdminCredit > 0) await tx.execute(sql`UPDATE users SET admin_credit_balance = admin_credit_balance - ${fromAdminCredit} WHERE id = ${id}`);
      if (fromBalance > 0) await tx.execute(sql`UPDATE users SET balance = balance - ${fromBalance} WHERE id = ${id}`);
      newBalance = balance - fromBalance + adminCredit - fromAdminCredit;
    }
    await tx.insert(withdrawalsTable).values({
      userId: id,
      amount: String(amount),
      method: type === "credit" ? "admin_credit" : "admin_debit",
      status: "paid",
      notes: reason ?? null,
      paidAt: new Date(),
    });
    await tx.insert(auditLogsTable).values({
      action: `admin_balance_${type}`,
      userId: id,
      details: { amount, reason, admin_id: req.userId },
      ipAddress: req.ip,
    });
  });
  if (insufficient) { res.status(400).json({ error: "Saldo insuficiente para realizar el débito" }); return; }
  res.json({ message: `Saldo ${type === "credit" ? "acreditado" : "debitado"} correctamente`, new_balance: newBalance });
});

// ── Ban user ────────────────────────────────────────────────────────────────
router.post("/users/:id/ban", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { banned, reason } = req.body as { banned?: boolean; reason?: string };
  if (typeof banned !== "boolean") { res.status(400).json({ error: "Se requiere banned (boolean)" }); return; }
  const [updated] = await db.update(usersTable)
    .set({ isBanned: banned, banReason: banned ? (reason ?? null) : null })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  await db.insert(auditLogsTable).values({
    action: banned ? "admin_ban_user" : "admin_unban_user",
    userId: id,
    details: { reason, admin_id: req.userId },
    ipAddress: req.ip,
  });
  res.json({ message: banned ? "Usuario baneado" : "Baneo levantado", user: formatUser(updated) });
});

// ── Delete user ─────────────────────────────────────────────────────────────
router.delete("/users/:id", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  if (id === req.userId) { res.status(400).json({ error: "No puedes eliminarte a ti mismo" }); return; }
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  if (rows[0].isAdmin) { res.status(400).json({ error: "No se puede eliminar a un administrador" }); return; }
  // Guard: don't delete if user has pending withdrawals
  const pendingWd = await db.select({ count: sql<number>`count(*)` })
    .from(withdrawalsTable).where(and(eq(withdrawalsTable.userId, id), eq(withdrawalsTable.status, "pending")));
  if (Number(pendingWd[0]?.count ?? 0) > 0) {
    res.status(400).json({ error: "El usuario tiene retiros pendientes. Procésalos antes de eliminar." });
    return;
  }
  try {
    await db.transaction(async (tx) => {
      // 1. Referral transactions where this user is referrer (activator) or referred
      await tx.delete(referralTransactionsTable)
        .where(or(
          eq(referralTransactionsTable.activatorId, id),
          eq(referralTransactionsTable.referredUserId, id),
        ));
      // 2. Activator request this user submitted
      await tx.delete(activatorRequestsTable).where(eq(activatorRequestsTable.userId, id));
      // 3. Referral code for this user
      await tx.delete(referralCodesTable).where(eq(referralCodesTable.userId, id));
      // 4. Name-change requests and CI-change requests
      await tx.delete(nameChangeRequestsTable).where(eq(nameChangeRequestsTable.userId, id));
      await tx.delete(ciChangeRequestsTable).where(eq(ciChangeRequestsTable.userId, id));
      // 5. Audit logs
      await tx.delete(auditLogsTable).where(eq(auditLogsTable.userId, id));
      // 6. Winners (historical and active)
      await tx.delete(winnersTable).where(eq(winnersTable.userId, id));
      // 7. Withdrawals (all non-pending — pending are blocked above)
      await tx.delete(withdrawalsTable).where(eq(withdrawalsTable.userId, id));
      // 8. Cards
      await tx.delete(cardsTable).where(eq(cardsTable.userId, id));
      // 9. Finally delete the user
      await tx.delete(usersTable).where(eq(usersTable.id, id));
    });
  } catch (err) {
    req.log.error({ err, targetUserId: id }, "Error al eliminar usuario");
    res.status(500).json({ error: "No se pudo eliminar el usuario. Intenta de nuevo." });
    return;
  }
  res.json({ message: "Usuario eliminado permanentemente" });
});

// ── Stats by department ─────────────────────────────────────────────────────
router.get("/stats/departments", async (req: AuthRequest, res) => {
  const rows = await db.execute(
    sql`SELECT department,
               COUNT(*) AS total,
               SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
               SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
               SUM(CASE WHEN is_banned = true THEN 1 ELSE 0 END) AS banned,
               SUM(balance) AS total_balance
        FROM users
        WHERE is_admin = false
        GROUP BY department
        ORDER BY total DESC`
  );
  res.json(rows.rows.map((r: any) => ({
    department: r.department as string,
    total: Number(r.total),
    active: Number(r.active),
    pending: Number(r.pending),
    banned: Number(r.banned),
    total_balance: parseFloat(r.total_balance ?? "0"),
  })));
});

// ── Operating Expenses ───────────────────────────────────────────────────────

router.get("/expenses", async (_req: AuthRequest, res) => {
  const rows = await db.select().from(operatingExpensesTable).orderBy(desc(operatingExpensesTable.createdAt));
  res.json(rows.map(r => ({
    id:        r.id,
    name:      r.name,
    amount:    r.amount,
    frequency: r.frequency,
    is_active: r.isActive,
    notes:     r.notes,
    created_at: r.createdAt,
  })));
});

router.post("/expenses", async (req: AuthRequest, res) => {
  const { name, amount, frequency, notes } = req.body;
  if (!name || amount == null || !frequency) { res.status(400).json({ error: "name, amount y frequency son requeridos" }); return; }
  const amt = parseFloat(String(amount));
  if (isNaN(amt) || amt < 0) { res.status(400).json({ error: "amount debe ser un número positivo" }); return; }
  const validFreqs = ["daily", "weekly", "monthly", "yearly", "one_time"];
  if (!validFreqs.includes(String(frequency))) { res.status(400).json({ error: `frequency debe ser uno de: ${validFreqs.join(", ")}` }); return; }
  const [row] = await db.insert(operatingExpensesTable).values({
    name: String(name).trim(),
    amount: String(amt),
    frequency: frequency as "daily" | "weekly" | "monthly" | "yearly" | "one_time",
    notes: notes ? String(notes).trim() : null,
    isActive: true,
  }).returning();
  res.status(201).json({ ...row, amount: row.amount, is_active: row.isActive });
});

router.patch("/expenses/:id", async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id inválido" }); return; }
  const { name, amount, frequency, notes, isActive } = req.body;
  const update: Record<string, any> = {};
  if (name !== undefined)      update.name      = String(name).trim();
  if (amount !== undefined)    update.amount    = String(parseFloat(String(amount)));
  if (frequency !== undefined) update.frequency = String(frequency);
  if (notes !== undefined)     update.notes     = notes ? String(notes).trim() : null;
  if (isActive !== undefined)  update.isActive  = Boolean(isActive);
  if (Object.keys(update).length === 0) { res.status(400).json({ error: "nada que actualizar" }); return; }
  const [row] = await db.update(operatingExpensesTable).set(update).where(eq(operatingExpensesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "gasto no encontrado" }); return; }
  res.json({ ...row, is_active: row.isActive });
});

router.delete("/expenses/:id", async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id inválido" }); return; }
  await db.update(operatingExpensesTable).set({ isActive: false }).where(eq(operatingExpensesTable.id, id));
  res.json({ ok: true });
});

// Helper: prorate expenses for a date range
function prorateExpenses(expenses: any[], from: Date | null, to: Date | null): { total: number; detail: any[] } {
  const now = new Date();
  const effectiveTo = to ?? now;
  const effectiveFrom = from ?? new Date(now.getTime() - 365 * 86400000);
  const daysInPeriod = Math.max(1, (effectiveTo.getTime() - effectiveFrom.getTime()) / 86400000);

  const detail = expenses.map((e: any) => {
    const amt = parseFloat(String(e.amount));
    let prorated: number;
    switch (e.frequency) {
      case "daily":    prorated = amt * daysInPeriod; break;
      case "weekly":   prorated = amt * (daysInPeriod / 7); break;
      case "monthly":  prorated = amt * (daysInPeriod / 30.4375); break;
      case "yearly":   prorated = amt * (daysInPeriod / 365.25); break;
      case "one_time": prorated = amt; break;
      default:         prorated = 0;
    }
    return {
      id:               e.id,
      name:             e.name,
      frequency:        e.frequency,
      amount_full:      parseFloat(amt.toFixed(2)),
      amount_prorated:  parseFloat(prorated.toFixed(2)),
      notes:            e.notes ?? null,
    };
  });

  const total = parseFloat(detail.reduce((s: number, d: any) => s + d.amount_prorated, 0).toFixed(2));
  return { total, detail };
}

// ── Finance ─────────────────────────────────────────────────────────────────

function resolveDateRange(query: Record<string, any>): { from: Date | null; to: Date | null; label: string } {
  // Custom range takes priority
  if (query.from || query.to) {
    const from = query.from ? new Date(String(query.from)) : null;
    const to   = query.to   ? new Date(String(query.to))   : null;
    return { from, to, label: "custom" };
  }
  const period = String(query.period ?? "all");
  const now = new Date();
  if (period === "today")  return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to: null, label: "today" };
  if (period === "week")   return { from: new Date(Date.now() - 7  * 86400000), to: null, label: "week" };
  if (period === "month")  return { from: new Date(Date.now() - 30 * 86400000), to: null, label: "month" };
  if (period === "year")   return { from: new Date(Date.now() - 365 * 86400000), to: null, label: "year" };
  return { from: null, to: null, label: "all" };
}

router.get("/finance/summary", async (req: AuthRequest, res) => {
  const { from, to, label } = resolveDateRange(req.query as any);

  const dateWhere = (col: string) => {
    if (from && to)  return sql.raw(`AND ${col} >= '${from.toISOString()}' AND ${col} <= '${to.toISOString()}'`);
    if (from)        return sql.raw(`AND ${col} >= '${from.toISOString()}'`);
    return sql.raw("");
  };

  const [rev, prizes, wdrs, balances, refTxs, actSales] = await Promise.all([
    db.execute(sql`SELECT coalesce(sum(g.card_price - c.bonus_amount_used - c.admin_credit_amount_used),0)::text as total, coalesce(sum(c.bonus_amount_used),0)::text as bonus_used, coalesce(sum(c.admin_credit_amount_used),0)::text as admin_credit_used, count(*)::int as count FROM cards c JOIN games g ON c.game_id=g.id WHERE c.payment_status='paid' AND c.is_predefined = false ${dateWhere("c.created_at")}`),
    db.execute(sql`SELECT coalesce(sum(w.prize_amount),0)::text as total, count(*)::int as count FROM winners w JOIN cards c ON c.id = w.card_id WHERE w.validated=true AND c.is_predefined = false ${dateWhere("w.created_at")}`),
    db.execute(sql`SELECT
      coalesce(sum(CASE WHEN status='paid' AND method NOT IN ('admin_credit','admin_debit','refund') THEN amount ELSE 0 END),0)::text as paid_total,
      count(*) FILTER (WHERE status='paid' AND method NOT IN ('admin_credit','admin_debit','refund')) as paid_count,
      coalesce(sum(CASE WHEN status='pending' AND method NOT IN ('admin_credit','admin_debit','refund') THEN amount ELSE 0 END),0)::text as pending_total,
      count(*) FILTER (WHERE status='pending' AND method NOT IN ('admin_credit','admin_debit','refund')) as pending_count,
      coalesce(sum(CASE WHEN status='paid' AND method='admin_credit' THEN amount ELSE 0 END),0)::text as admin_credits_total,
      count(*) FILTER (WHERE status='paid' AND method='admin_credit') as admin_credits_count,
      coalesce(sum(CASE WHEN status='paid' AND method='admin_debit' THEN amount ELSE 0 END),0)::text as admin_debits_total,
      count(*) FILTER (WHERE status='paid' AND method='admin_debit') as admin_debits_count,
      coalesce(sum(CASE WHEN status='paid' AND method='refund' THEN amount ELSE 0 END),0)::text as refunds_total,
      count(*) FILTER (WHERE status='paid' AND method='refund') as refunds_count
    FROM withdrawals WHERE true ${dateWhere("created_at")}`),
    db.execute(sql`SELECT
      coalesce(sum(balance),0)::text as total,
      count(*) FILTER (WHERE balance > 0) as user_count,
      coalesce(sum(bonus_balance),0)::text as total_bonus,
      count(*) FILTER (WHERE bonus_balance > 0) as bonus_user_count,
      coalesce(sum(admin_credit_balance),0)::text as total_admin_credit,
      count(*) FILTER (WHERE admin_credit_balance > 0) as admin_credit_user_count
    FROM users WHERE is_admin=false`),
    db.execute(sql`SELECT coalesce(sum(CASE WHEN type='commission' THEN amount ELSE 0 END),0)::text as commissions_total, coalesce(sum(CASE WHEN type='welcome_bonus' THEN amount ELSE 0 END),0)::text as bonuses_total, count(*) FILTER (WHERE type='commission') as commissions_count, count(*) FILTER (WHERE type='welcome_bonus') as bonuses_count, count(DISTINCT activator_id) FILTER (WHERE type='commission') as activators_count FROM referral_transactions WHERE true ${dateWhere("created_at")}`),
    // Activator sales: only paid/approved count as real income
    db.execute(sql`SELECT coalesce(sum(discount_amount),0)::text as total_discount, coalesce(sum(final_price),0)::text as total_revenue, count(*)::int as count, coalesce(sum(quantity),0)::int as cards_count FROM activator_card_sales WHERE status IN ('paid','approved') ${dateWhere("created_at")}`),
  ]);

  const rawCardRevenue   = parseFloat((rev.rows[0] as any)?.total ?? "0");
  const bonusSpentOnCards = parseFloat((rev.rows[0] as any)?.bonus_used ?? "0");
  const adminCreditSpentOnCards = parseFloat((rev.rows[0] as any)?.admin_credit_used ?? "0");
  const prizesPaid       = parseFloat((prizes.rows[0] as any)?.total ?? "0");
  const withdrawalsPaid  = parseFloat((wdrs.rows[0] as any)?.paid_total ?? "0");
  const adminCreditsTotal = parseFloat((wdrs.rows[0] as any)?.admin_credits_total ?? "0");
  const adminDebitsTotal  = parseFloat((wdrs.rows[0] as any)?.admin_debits_total ?? "0");
  const commissionsTotal = parseFloat((refTxs.rows[0] as any)?.commissions_total ?? "0");
  const bonusesGranted   = parseFloat((refTxs.rows[0] as any)?.bonuses_total ?? "0");

  // Activator sales: the rawCardRevenue counts g.card_price for activator-sold cards
  // but the platform only received final_price (= original_price - discount_amount).
  // Subtract discount_amount to get the real received amount.
  const activatorDiscountsTotal = parseFloat((actSales.rows[0] as any)?.total_discount ?? "0");
  const activatorSalesRevenue   = parseFloat((actSales.rows[0] as any)?.total_revenue ?? "0");
  const activatorSalesCount     = Number((actSales.rows[0] as any)?.count ?? 0);
  const activatorCardsFromSales = Number((actSales.rows[0] as any)?.cards_count ?? 0);

  // gross_revenue is REAL money only: card_price - bonus_used - admin_credit_used - activator_discounts.
  // Admin-credited funds and bonus referral credits are already excluded.
  // Commissions are a redistribution WITHIN the prize pool, not double-counted.
  const grossRevenue = parseFloat((rawCardRevenue - activatorDiscountsTotal).toFixed(2));
  const netProfit    = parseFloat((grossRevenue - prizesPaid).toFixed(2));

  const [activeExpenses, committedRows] = await Promise.all([
    db.select().from(operatingExpensesTable).where(eq(operatingExpensesTable.isActive, true)),
    db.execute(sql`
      SELECT g.id, g.title, g.type, g.prize_amount::text AS prize_amount
      FROM games g
      WHERE g.status IN ('active','upcoming')
        AND NOT EXISTS (
          SELECT 1 FROM winners w WHERE w.game_id = g.id AND w.validated = true
        )
      ORDER BY g.draw_date ASC
    `),
  ]);

  const { total: totalExpenses, detail: expensesDetail } = prorateExpenses(activeExpenses, from, to);

  const committedGames = (committedRows.rows as any[]).map(r => ({
    id:           Number(r.id),
    title:        r.title as string,
    type:         r.type as string,
    prize_amount: parseFloat(r.prize_amount ?? "0"),
  }));
  const committedPrizes = parseFloat(committedGames.reduce((s, g) => s + g.prize_amount, 0).toFixed(2));

  res.json({
    period: label,
    from: from?.toISOString() ?? null,
    to:   to?.toISOString()   ?? null,
    gross_revenue:              grossRevenue,
    cards_sold:                 Number((rev.rows[0] as any)?.count ?? 0),
    prizes_paid:                prizesPaid,
    prizes_paid_net:            parseFloat((prizesPaid - commissionsTotal).toFixed(2)),
    prizes_count:               Number((prizes.rows[0] as any)?.count ?? 0),
    withdrawals_paid:           withdrawalsPaid,
    withdrawals_count:          Number((wdrs.rows[0] as any)?.paid_count ?? 0),
    pending_withdrawals:        parseFloat((wdrs.rows[0] as any)?.pending_total ?? "0"),
    pending_withdrawals_count:  Number((wdrs.rows[0] as any)?.pending_count ?? 0),
    admin_credits_total:        adminCreditsTotal,
    admin_credits_count:        Number((wdrs.rows[0] as any)?.admin_credits_count ?? 0),
    admin_debits_total:         adminDebitsTotal,
    admin_debits_count:         Number((wdrs.rows[0] as any)?.admin_debits_count ?? 0),
    net_admin_adjustments:      parseFloat((adminCreditsTotal - adminDebitsTotal).toFixed(2)),
    balance_in_circulation:     parseFloat((balances.rows[0] as any)?.total ?? "0"),
    users_with_balance:         Number((balances.rows[0] as any)?.user_count ?? 0),
    bonus_balance_in_circulation: parseFloat((balances.rows[0] as any)?.total_bonus ?? "0"),
    bonus_users_count:          Number((balances.rows[0] as any)?.bonus_user_count ?? 0),
    admin_credit_balance_in_circulation: parseFloat((balances.rows[0] as any)?.total_admin_credit ?? "0"),
    admin_credit_users_count:   Number((balances.rows[0] as any)?.admin_credit_user_count ?? 0),
    admin_credit_spent_on_cards: adminCreditSpentOnCards,
    total_commissions_paid:       commissionsTotal,
    commissions_count:            Number((refTxs.rows[0] as any)?.commissions_count ?? 0),
    activators_with_commissions:  Number((refTxs.rows[0] as any)?.activators_count ?? 0),
    total_bonuses_granted:        bonusesGranted,
    bonuses_spent_on_cards:       bonusSpentOnCards,
    bonuses_unspent:              parseFloat(((parseFloat((balances.rows[0] as any)?.total_bonus ?? "0"))).toFixed(2)),
    bonuses_count:                Number((refTxs.rows[0] as any)?.bonuses_count ?? 0),
    cash_out_real:                withdrawalsPaid,
    refunds_paid:               parseFloat((wdrs.rows[0] as any)?.refunds_total ?? "0"),
    refunds_count:              Number((wdrs.rows[0] as any)?.refunds_count ?? 0),
    net_profit:                 netProfit,
    total_expenses:             totalExpenses,
    expenses_detail:            expensesDetail,
    committed_prizes:           committedPrizes,
    committed_prizes_detail:    committedGames,
    distributable_profit:       parseFloat((netProfit - totalExpenses - committedPrizes).toFixed(2)),
    activator_sales_revenue:    activatorSalesRevenue,
    activator_discounts_total:  activatorDiscountsTotal,
    activator_sales_count:      activatorSalesCount,
    activator_cards_from_sales: activatorCardsFromSales,
  });
});

router.get("/finance/games", async (req: AuthRequest, res) => {
  const rows = await db.execute(sql`
    SELECT
      g.id, g.title, g.type, g.status,
      g.card_price::text   AS card_price,
      g.prize_amount::text AS prize_amount,
      g.draw_date,
      count(c.id) FILTER (WHERE c.payment_status='paid' AND c.is_predefined = false) AS cards_sold,
      (coalesce(sum(g.card_price - c.bonus_amount_used) FILTER (WHERE c.payment_status='paid' AND c.is_predefined = false),0)
        - coalesce((SELECT sum(acs.discount_amount) FROM activator_card_sales acs WHERE acs.game_id=g.id AND acs.status IN ('paid','approved')),0)
      )::text AS revenue,
      coalesce((SELECT sum(w.prize_amount) FROM winners w JOIN cards c ON c.id=w.card_id WHERE w.game_id=g.id AND w.validated=true AND c.is_predefined=false),0)::text AS prizes_paid,
      coalesce((SELECT count(*)           FROM winners w JOIN cards c ON c.id=w.card_id WHERE w.game_id=g.id AND w.validated=true AND c.is_predefined=false),0)::int  AS winners_count,
      coalesce((SELECT sum(rt.amount) FROM referral_transactions rt JOIN winners w ON rt.winner_id=w.id WHERE w.game_id=g.id AND rt.type='commission'),0)::text AS commissions_paid,
      coalesce((SELECT sum(acs.discount_amount) FROM activator_card_sales acs WHERE acs.game_id=g.id AND acs.status IN ('paid','approved')),0)::text AS activator_discounts
    FROM games g
    LEFT JOIN cards c ON c.game_id=g.id
    GROUP BY g.id
    ORDER BY g.draw_date DESC`);

  res.json((rows.rows as any[]).map(r => ({
    id:            Number(r.id),
    title:         r.title as string,
    type:          r.type as string,
    status:        r.status as string,
    card_price:    parseFloat(r.card_price),
    prize_amount:  parseFloat(r.prize_amount),
    draw_date:     r.draw_date,
    cards_sold:    Number(r.cards_sold ?? 0),
    revenue:       parseFloat(r.revenue ?? "0"),
    prizes_paid:      parseFloat(r.prizes_paid ?? "0"),
    winners_count:    Number(r.winners_count ?? 0),
    commissions_paid: parseFloat(r.commissions_paid ?? "0"),
    activator_discounts: parseFloat(r.activator_discounts ?? "0"),
    net:              parseFloat(r.revenue ?? "0") - parseFloat(r.prizes_paid ?? "0"),
  })));
});

router.get("/finance/transactions", async (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const { from, to } = resolveDateRange(req.query as any);

  const dw = (col: string) => {
    if (from && to)  return sql.raw(`AND ${col} >= '${from.toISOString()}' AND ${col} <= '${to.toISOString()}'`);
    if (from)        return sql.raw(`AND ${col} >= '${from.toISOString()}'`);
    return sql.raw("");
  };

  const rows = await db.execute(sql`
    SELECT * FROM (
      SELECT 'ingreso'::text AS type, c.created_at AS date, u.full_name AS user_name,
             g.title AS game_title,
             (g.card_price - c.bonus_amount_used)::text AS amount,
             ('Compra cartón #' || c.id ||
               CASE WHEN c.bonus_amount_used > 0
                 THEN ' (bono: Bs ' || c.bonus_amount_used::text || ')'
                 ELSE ''
               END)::text AS description
      FROM cards c JOIN users u ON c.user_id=u.id JOIN games g ON c.game_id=g.id
      WHERE c.payment_status='paid' AND c.is_predefined = false ${dw("c.created_at")}
      UNION ALL
      SELECT 'premio'::text, w.created_at, u.full_name, g.title,
             w.prize_amount::text, ('Premio puesto #' || w.place)::text
      FROM winners w JOIN users u ON w.user_id=u.id JOIN games g ON w.game_id=g.id
      WHERE w.validated=true ${dw("w.created_at")}
      UNION ALL
      SELECT 'retiro'::text, wd.created_at, u.full_name, NULL,
             wd.amount::text, ('Retiro via ' || wd.method)::text
      FROM withdrawals wd JOIN users u ON wd.user_id=u.id
      WHERE wd.status='paid' AND wd.method NOT IN ('admin_credit','admin_debit') ${dw("wd.created_at")}
      UNION ALL
      SELECT 'admin_credit'::text, wd.created_at, u.full_name, NULL,
             wd.amount::text, ('Crédito admin' || COALESCE(': ' || wd.notes, ''))::text
      FROM withdrawals wd JOIN users u ON wd.user_id=u.id
      WHERE wd.status='paid' AND wd.method='admin_credit' ${dw("wd.created_at")}
      UNION ALL
      SELECT 'admin_debit'::text, wd.created_at, u.full_name, NULL,
             wd.amount::text, ('Débito admin' || COALESCE(': ' || wd.notes, ''))::text
      FROM withdrawals wd JOIN users u ON wd.user_id=u.id
      WHERE wd.status='paid' AND wd.method='admin_debit' ${dw("wd.created_at")}
      UNION ALL
      SELECT 'reembolso'::text, wd.created_at, u.full_name, NULL,
             wd.amount::text, (COALESCE(wd.notes, 'Reembolso a billetera'))::text
      FROM withdrawals wd JOIN users u ON wd.user_id=u.id
      WHERE wd.status='paid' AND wd.method='refund' ${dw("wd.created_at")}
      UNION ALL
      SELECT 'comision'::text, rt.created_at, u_act.full_name, g.title,
             rt.amount::text, rt.description
      FROM referral_transactions rt
      JOIN users u_act ON rt.activator_id = u_act.id
      LEFT JOIN games g ON rt.game_id = g.id
      WHERE rt.type = 'commission' ${dw("rt.created_at")}
      UNION ALL
      SELECT 'descuento_activador'::text, acs.created_at, u_act.full_name, g.title,
             acs.discount_amount::text,
             ('Desc. ' || acs.discount_amount::text || ' Bs → ' || u_tgt.full_name || ' (' || acs.quantity || ' cartón(es))')::text
      FROM activator_card_sales acs
      JOIN users u_act ON acs.activator_user_id = u_act.id
      JOIN users u_tgt ON acs.target_user_id = u_tgt.id
      JOIN games g ON acs.game_id = g.id
      WHERE acs.status IN ('paid','approved') AND acs.discount_amount > 0 ${dw("acs.created_at")}
    ) t
    ORDER BY t.date DESC
    LIMIT ${limit}`);

  res.json((rows.rows as any[]).map(r => ({
    type:       r.type as string,
    date:       r.date,
    user_name:  r.user_name as string,
    game_title: r.game_title as string | null,
    amount:     parseFloat(r.amount),
    description: r.description as string,
  })));
});

// ── Partners / Socios ────────────────────────────────────────────────────────

router.get("/partners", async (_req: AuthRequest, res) => {
  const rows = await db.select().from(partnersTable).orderBy(desc(partnersTable.createdAt));
  res.json(rows.map(r => ({
    id:               r.id,
    name:             r.name,
    identifier:       r.identifier,
    phone:            r.phone,
    share_percentage: r.sharePercentage,
    notes:            r.notes,
    is_active:        r.isActive,
    created_at:       r.createdAt,
  })));
});

router.post("/partners", async (req: AuthRequest, res) => {
  const { name, identifier, phone, sharePercentage, notes } = req.body;
  if (!name || sharePercentage == null) { res.status(400).json({ error: "name y sharePercentage son requeridos" }); return; }
  const pct = parseFloat(String(sharePercentage));
  if (isNaN(pct) || pct <= 0 || pct > 100) { res.status(400).json({ error: "sharePercentage debe ser entre 0.01 y 100" }); return; }
  const [row] = await db.insert(partnersTable).values({
    name: String(name).trim(),
    identifier: identifier ? String(identifier).trim() : null,
    phone:      phone      ? String(phone).trim()      : null,
    sharePercentage: String(pct),
    notes: notes ? String(notes).trim() : null,
    isActive: true,
  }).returning();
  res.status(201).json(row);
});

router.patch("/partners/:id", async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id inválido" }); return; }
  const { name, identifier, phone, sharePercentage, notes, isActive } = req.body;
  const update: Record<string, any> = {};
  if (name !== undefined)            update.name            = String(name).trim();
  if (identifier !== undefined)      update.identifier      = identifier ? String(identifier).trim() : null;
  if (phone !== undefined)           update.phone           = phone      ? String(phone).trim()      : null;
  if (sharePercentage !== undefined) update.sharePercentage = String(parseFloat(String(sharePercentage)));
  if (notes !== undefined)           update.notes           = notes      ? String(notes).trim()      : null;
  if (isActive !== undefined)        update.isActive        = Boolean(isActive);
  if (Object.keys(update).length === 0) { res.status(400).json({ error: "nada que actualizar" }); return; }
  const [row] = await db.update(partnersTable).set(update).where(eq(partnersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "socio no encontrado" }); return; }
  res.json(row);
});

router.delete("/partners/:id", async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "id inválido" }); return; }
  const [deleted] = await db.delete(partnersTable).where(eq(partnersTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "socio no encontrado" }); return; }
  res.json({ ok: true });
});

// Partner payment history
router.get("/partners/payments", async (_req: AuthRequest, res) => {
  const rows = await db.select().from(partnerPaymentsTable).orderBy(desc(partnerPaymentsTable.createdAt));
  res.json(rows.map(r => ({
    id:                  r.id,
    period_label:        r.periodLabel,
    period_from:         r.periodFrom,
    period_to:           r.periodTo,
    gross_revenue:       parseFloat(String(r.grossRevenue)),
    net_profit:          parseFloat(String(r.netProfit)),
    total_paid:          parseFloat(String(r.totalPaid)),
    partners_snapshot:   r.partnersSnapshot,
    finance_snapshot:    r.financeSnapshot ?? null,
    admin_notes:         r.adminNotes,
    created_at:          r.createdAt,
  })));
});

router.post("/partners/payments", async (req: AuthRequest, res) => {
  const { periodLabel, periodFrom, periodTo, grossRevenue, netProfit, totalPaid, partnersSnapshot, financeSnapshot, adminNotes } = req.body;
  if (!periodLabel || !periodFrom || !periodTo || grossRevenue == null || netProfit == null || totalPaid == null) {
    res.status(400).json({ error: "Campos requeridos: periodLabel, periodFrom, periodTo, grossRevenue, netProfit, totalPaid" }); return;
  }
  const [row] = await db.insert(partnerPaymentsTable).values({
    periodLabel:      String(periodLabel),
    periodFrom:       new Date(String(periodFrom)),
    periodTo:         new Date(String(periodTo)),
    grossRevenue:     String(parseFloat(String(grossRevenue))),
    netProfit:        String(parseFloat(String(netProfit))),
    totalPaid:        String(parseFloat(String(totalPaid))),
    partnersSnapshot: Array.isArray(partnersSnapshot) ? partnersSnapshot : [],
    financeSnapshot:  financeSnapshot && typeof financeSnapshot === "object" ? financeSnapshot : null,
    adminNotes:       adminNotes ? String(adminNotes).trim() : null,
  }).returning();
  res.status(201).json(row);
});

// ── Activator request management ─────────────────────────────────────────────

router.get("/activator-requests", async (req: AuthRequest, res) => {
  const offset = Math.max(0, parseInt(String(req.query.offset ?? "0")) || 0);
  const statusFilter = req.query.status as string | undefined;
  const fetchLimit = ADMIN_PAGE_SIZE + 1;

  const validStatuses = ["pending","accepted","rejected","hold","suspended","banned"];
  const whereClause = statusFilter && validStatuses.includes(statusFilter)
    ? eq(activatorRequestsTable.status, statusFilter as any)
    : undefined;

  const rows = await db.select({
    id: activatorRequestsTable.id,
    user_id: activatorRequestsTable.userId,
    status: activatorRequestsTable.status,
    notes: activatorRequestsTable.notes,
    reviewed_at: activatorRequestsTable.reviewedAt,
    reviewed_by_id: activatorRequestsTable.reviewedById,
    created_at: activatorRequestsTable.createdAt,
    user_full_name: usersTable.fullName,
    user_ci: usersTable.ci,
    user_phone: usersTable.phone,
    user_department: usersTable.department,
    user_status: usersTable.status,
    user_created_at: usersTable.createdAt,
    user_avatar_url: usersTable.avatarUrl,
  })
    .from(activatorRequestsTable)
    .innerJoin(usersTable, eq(activatorRequestsTable.userId, usersTable.id))
    .where(whereClause)
    .orderBy(desc(activatorRequestsTable.createdAt))
    .limit(fetchLimit).offset(offset);

  const hasMore = rows.length > ADMIN_PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, ADMIN_PAGE_SIZE) : rows;

  res.json({ items: pageRows, has_more: hasMore });
});

router.post("/activator-requests/:id/review", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { action, notes } = req.body as { action: "accept" | "reject" | "hold" | "suspend"; notes?: string };
  if (!["accept", "reject", "hold", "suspend"].includes(action)) {
    res.status(400).json({ error: "Acción inválida. Use: accept, reject, hold, suspend" }); return;
  }

  const requests = await db.select().from(activatorRequestsTable).where(eq(activatorRequestsTable.id, id)).limit(1);
  if (!requests.length) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  const request = requests[0];

  // Reject → hard-delete so it disappears from the list entirely
  if (action === "reject") {
    await db.update(referralCodesTable).set({ isActive: false }).where(eq(referralCodesTable.userId, request.userId));
    await db.delete(referralCodesTable).where(eq(referralCodesTable.userId, request.userId));
    await db.delete(activatorRequestsTable).where(eq(activatorRequestsTable.id, id));
    res.json({ ok: true, status: "deleted" });
    sendPushToUser(request.userId, {
      title: "❌ Solicitud de activador rechazada",
      body: notes?.trim() ? `Motivo: ${notes.trim()}` : "Tu solicitud para ser activador no fue aprobada.",
      url: "/profile",
    }).catch(() => {});
    return;
  }

  const newStatus = action === "accept" ? "accepted" : action === "hold" ? "hold" : "suspended";

  await db.update(activatorRequestsTable)
    .set({ status: newStatus, notes: notes?.trim() ?? null, reviewedById: req.userId!, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(activatorRequestsTable.id, id));

  if (action === "accept") {
    const existingCode = await db.select().from(referralCodesTable)
      .where(eq(referralCodesTable.userId, request.userId)).limit(1);
    if (!existingCode.length) {
      const code = crypto.randomBytes(4).toString("hex").toUpperCase();
      await db.insert(referralCodesTable).values({ userId: request.userId, code, isActive: true });
    } else {
      await db.update(referralCodesTable).set({ isActive: true }).where(eq(referralCodesTable.userId, request.userId));
    }
  } else {
    // hold / suspend → deactivate referral code
    await db.update(referralCodesTable).set({ isActive: false }).where(eq(referralCodesTable.userId, request.userId));
  }

  res.json({ ok: true, status: newStatus });
  if (action === "accept") {
    sendPushToUser(request.userId, {
      title: "🎉 ¡Sos activador!",
      body: "Tu solicitud fue aprobada. Ya tenés tu código de referido activo para ganar comisiones.",
      url: "/profile",
    }).catch(() => {});
  } else if (action === "suspend") {
    sendPushToUser(request.userId, {
      title: "⚠️ Cuenta de activador suspendida",
      body: notes?.trim() ? `Motivo: ${notes.trim()}` : "Tu cuenta de activador fue suspendida temporalmente.",
      url: "/profile",
    }).catch(() => {});
  } else if (action === "hold") {
    sendPushToUser(request.userId, {
      title: "⏸️ Solicitud de activador en revisión",
      body: "Tu solicitud está siendo revisada. Te avisaremos cuando haya novedades.",
      url: "/profile",
    }).catch(() => {});
  }
});

// ── Delete activator (full removal) ───────────────────────────────────────────

router.delete("/activator-requests/:id", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const requests = await db.select().from(activatorRequestsTable).where(eq(activatorRequestsTable.id, id)).limit(1);
  if (!requests.length) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  const request = requests[0];

  await db.delete(referralCodesTable).where(eq(referralCodesTable.userId, request.userId));
  await db.delete(activatorRequestsTable).where(eq(activatorRequestsTable.id, id));

  res.json({ ok: true });
  sendPushToUser(request.userId, {
    title: "🚫 Eliminado del programa de activadores",
    body: "Fuiste removido del programa de activadores. Tu código de referido ya no está activo.",
    url: "/profile",
  }).catch(() => {});
});

// ── Ban activator user ─────────────────────────────────────────────────────────

router.post("/activator-requests/:id/ban", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { reason } = req.body as { reason?: string };

  const requests = await db.select().from(activatorRequestsTable).where(eq(activatorRequestsTable.id, id)).limit(1);
  if (!requests.length) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  const request = requests[0];

  // Mark as banned in activator_requests (activator-program ban only, not global account ban)
  await db.update(activatorRequestsTable)
    .set({ status: "banned", notes: reason?.trim() || null, reviewedById: req.userId!, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(activatorRequestsTable.id, id));

  // Deactivate referral code so no commissions are paid
  await db.update(referralCodesTable).set({ isActive: false }).where(eq(referralCodesTable.userId, request.userId));

  res.json({ ok: true });
  sendPushToUser(request.userId, {
    title: "🚫 Activador suspendido por incumplimiento",
    body: reason?.trim() ? `Motivo: ${reason.trim()}` : "Tu cuenta de activador fue suspendida por incumplimiento de las normas.",
    url: "/profile",
  }).catch(() => {});
});

// ── Unban activator ────────────────────────────────────────────────────────────

router.post("/activator-requests/:id/unban", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const requests = await db.select().from(activatorRequestsTable).where(eq(activatorRequestsTable.id, id)).limit(1);
  if (!requests.length) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  const request = requests[0];

  // Restore to accepted and reactivate referral code
  await db.update(activatorRequestsTable)
    .set({ status: "accepted", notes: null, reviewedById: req.userId!, reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(activatorRequestsTable.id, id));

  const existingCode = await db.select().from(referralCodesTable)
    .where(eq(referralCodesTable.userId, request.userId)).limit(1);
  if (!existingCode.length) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    await db.insert(referralCodesTable).values({ userId: request.userId, code, isActive: true });
  } else {
    await db.update(referralCodesTable).set({ isActive: true }).where(eq(referralCodesTable.userId, request.userId));
  }

  res.json({ ok: true });
  sendPushToUser(request.userId, {
    title: "✅ Activador rehabilitado",
    body: "Tu cuenta de activador fue reactivada. Ya podés volver a ganar comisiones con tu código.",
    url: "/profile",
  }).catch(() => {});
});

// ── Activator settings ────────────────────────────────────────────────────────

router.get("/activator-settings", async (_req, res) => {
  const rows = await db.select().from(activatorSettingsTable).limit(1);
  if (!rows.length) {
    res.json({
      is_enabled: true,
      whatsapp_group_link: null,
      bonus_amount: 5,
      bonus_title: "Bono de bienvenida por activador {activator}",
      bonus_validity_hours: null,
      commission_percentage: 5,
      commission_duration: "indefinite",
      commission_duration_months: null,
    });
    return;
  }
  const s = rows[0];
  res.json({
    is_enabled: s.isEnabled,
    whatsapp_group_link: s.whatsappGroupLink ?? null,
    bonus_amount: parseFloat(s.bonusAmount),
    bonus_title: s.bonusTitle,
    bonus_validity_hours: s.bonusValidityHours ?? null,
    commission_percentage: parseFloat(s.commissionPercentage),
    commission_duration: s.commissionDuration,
    commission_duration_months: s.commissionDurationMonths ?? null,
  });
});

router.put("/activator-settings", async (req: AuthRequest, res) => {
  const { is_enabled, whatsapp_group_link, bonus_amount, bonus_title, bonus_validity_hours, commission_percentage, commission_duration, commission_duration_months } = req.body as {
    is_enabled?: boolean;
    whatsapp_group_link?: string | null;
    bonus_amount?: number;
    bonus_title?: string;
    bonus_validity_hours?: number | null;
    commission_percentage?: number;
    commission_duration?: string;
    commission_duration_months?: number | null;
  };

  const existing = await db.select({ id: activatorSettingsTable.id }).from(activatorSettingsTable).limit(1);
  const patch: Record<string, any> = { updatedAt: new Date(), updatedById: req.userId! };
  if (is_enabled != null) patch.isEnabled = Boolean(is_enabled);
  if (whatsapp_group_link !== undefined) patch.whatsappGroupLink = whatsapp_group_link?.trim() || null;
  if (bonus_amount != null) patch.bonusAmount = String(bonus_amount);
  if (bonus_title != null) patch.bonusTitle = bonus_title.trim();
  if (bonus_validity_hours !== undefined) patch.bonusValidityHours = bonus_validity_hours != null && bonus_validity_hours > 0 ? bonus_validity_hours : null;
  if (commission_percentage != null) patch.commissionPercentage = String(commission_percentage);
  if (commission_duration != null && ["once", "monthly", "indefinite"].includes(commission_duration)) patch.commissionDuration = commission_duration;
  if (commission_duration_months !== undefined) patch.commissionDurationMonths = commission_duration_months ?? null;

  if (existing.length) {
    await db.update(activatorSettingsTable).set(patch).where(eq(activatorSettingsTable.id, existing[0].id));
  } else {
    await db.insert(activatorSettingsTable).values(patch);
  }

  // NOTE: bonus_amount changes only affect NEW registrations going forward.
  // Existing users keep whatever bonus_balance they received at registration time.

  // Retroactively apply the new validity window to ALL current bonus holders
  // (bonus_balance > 0 and referred via a code). This handles both first-time
  // configuration (bonus_expires_at IS NULL) and adjustments (e.g. 24h → 48h).
  if (bonus_validity_hours != null && bonus_validity_hours > 0) {
    await db.execute(
      sql`UPDATE users
          SET bonus_expires_at = NOW() + (${bonus_validity_hours} * INTERVAL '1 hour')
          WHERE bonus_balance > 0
            AND referred_by_code IS NOT NULL`
    );
  }

  const [updated] = await db.select().from(activatorSettingsTable).where(eq(activatorSettingsTable.id, 1));
  res.json({
    is_enabled: updated.isEnabled,
    whatsapp_group_link: updated.whatsappGroupLink ?? null,
    bonus_amount: parseFloat(updated.bonusAmount),
    bonus_title: updated.bonusTitle,
    bonus_validity_hours: updated.bonusValidityHours ?? null,
    commission_percentage: parseFloat(updated.commissionPercentage),
    commission_duration: updated.commissionDuration,
    commission_duration_months: updated.commissionDurationMonths ?? null,
  });
});

// ── Referral stats for admin ──────────────────────────────────────────────────
router.get("/activator-performance", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      rc.code,
      rc.user_id                                                          AS activator_id,
      u.full_name,
      u.ci,
      u.department,
      COUNT(ref.id)                                                        AS total,
      COUNT(ref.id) FILTER (WHERE ref.created_at >= CURRENT_DATE)         AS today,
      COUNT(ref.id) FILTER (WHERE ref.created_at >= DATE_TRUNC('week',  CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz'))  AS this_week,
      COUNT(ref.id) FILTER (WHERE ref.created_at >= DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz'))  AS this_month
    FROM referral_codes rc
    JOIN users u ON u.id = rc.user_id
    LEFT JOIN users ref ON ref.referred_by_code = rc.code
    WHERE rc.is_active = true
    GROUP BY rc.code, rc.user_id, u.full_name, u.ci, u.department
    ORDER BY u.department ASC, total DESC
  `);

  res.json(rows.rows.map((r: any) => ({
    code: r.code,
    activator_id: Number(r.activator_id),
    full_name: r.full_name,
    ci: r.ci,
    department: r.department ?? "",
    total: Number(r.total),
    today: Number(r.today),
    this_week: Number(r.this_week),
    this_month: Number(r.this_month),
  })));
});

router.get("/referral-stats", async (_req, res) => {
  const [activators, totalReferrals, totalCommissions, totalBonuses] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(referralCodesTable).where(eq(referralCodesTable.isActive, true)),
    db.select({ count: sql<number>`count(*)` }).from(referralTransactionsTable).where(eq(referralTransactionsTable.type, "welcome_bonus")),
    db.select({ total: sql<string>`coalesce(sum(amount), 0)` }).from(referralTransactionsTable).where(eq(referralTransactionsTable.type, "commission")),
    db.select({ total: sql<string>`coalesce(sum(amount), 0)` }).from(referralTransactionsTable).where(eq(referralTransactionsTable.type, "welcome_bonus")),
  ]);

  const recentTxRows = await db.select({
    id: referralTransactionsTable.id,
    type: referralTransactionsTable.type,
    amount: referralTransactionsTable.amount,
    description: referralTransactionsTable.description,
    activator_id: referralTransactionsTable.activatorId,
    referred_user_id: referralTransactionsTable.referredUserId,
    created_at: referralTransactionsTable.createdAt,
    activator_name: sql<string>`(SELECT full_name FROM users WHERE id = ${referralTransactionsTable.activatorId})`,
    referred_name: sql<string>`(SELECT full_name FROM users WHERE id = ${referralTransactionsTable.referredUserId})`,
  })
    .from(referralTransactionsTable)
    .orderBy(desc(referralTransactionsTable.createdAt))
    .limit(50);

  res.json({
    active_activators: Number(activators[0]?.count ?? 0),
    total_referred_users: Number(totalReferrals[0]?.count ?? 0),
    total_commissions_paid: parseFloat(totalCommissions[0]?.total ?? "0"),
    total_bonuses_granted: parseFloat(totalBonuses[0]?.total ?? "0"),
    recent_transactions: recentTxRows.map(r => ({
      ...r,
      amount: parseFloat(r.amount),
    })),
  });
});

// ── GET /api/admin/system/health ─────────────────────────────────────────────
router.get("/system/health", async (req: AuthRequest, res) => {
  const mem = process.memoryUsage();
  const toMB = (b: number) => parseFloat((b / 1024 / 1024).toFixed(1));
  const heapUsedMB  = toMB(mem.heapUsed);
  const heapTotalMB = toMB(mem.heapTotal);
  const rssMB       = toMB(mem.rss);
  const heapPct     = Math.round((heapUsedMB / heapTotalMB) * 100);

  const uptimeSec = Math.floor(process.uptime());
  const hours   = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  const seconds = uptimeSec % 60;
  const uptimeStr = hours > 0
    ? `${hours}h ${minutes}m ${seconds}s`
    : minutes > 0
    ? `${minutes}m ${seconds}s`
    : `${seconds}s`;

  // db ping
  let dbOk = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch (_) { /* db down */ }

  res.json({
    uptime_seconds: uptimeSec,
    uptime_str:     uptimeStr,
    heap_used_mb:   heapUsedMB,
    heap_total_mb:  heapTotalMB,
    rss_mb:         rssMB,
    heap_pct:       heapPct,
    db_ok:          dbOk,
    node_version:   process.version,
    pid:            process.pid,
    warning:        heapPct >= 80 ? "RAM alta — considera reiniciar" : rssMB >= 400 ? "Memoria RSS elevada" : null,
  });
});

// ── GET /api/admin/system/auto-restart ───────────────────────────────────────
router.get("/system/auto-restart", async (_req: AuthRequest, res) => {
  const { getAutoRestartConfig } = await import("../lib/autoRestart");
  res.json(getAutoRestartConfig());
});

// ── POST /api/admin/system/auto-restart ──────────────────────────────────────
router.post("/system/auto-restart", async (req: AuthRequest, res) => {
  const { setAutoRestartConfig } = await import("../lib/autoRestart");
  const { enabled, threshold } = req.body as { enabled?: boolean; threshold?: number };
  const updated = setAutoRestartConfig({ enabled, threshold });
  res.json(updated);
});

// ── POST /api/admin/system/restart ───────────────────────────────────────────
router.post("/system/restart", async (req: AuthRequest, res) => {
  req.log.warn({ admin_id: req.userId ?? null }, "Admin triggered server restart");
  res.json({ ok: true, message: "Reiniciando servidor en 1 segundo..." });
  setTimeout(() => process.exit(0), 1000);
});

export { router as adminRouter };
