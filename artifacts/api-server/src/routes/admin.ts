import { Router } from "express";
import { db, usersTable, nameChangeRequestsTable, withdrawalsTable, winnersTable, auditLogsTable, gamesTable, feedItemsTable } from "@workspace/db";
import { eq, and, like, sql, desc } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";
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

router.get("/users", async (req: AuthRequest, res) => {
  const query = AdminListUsersQueryParams.safeParse(req.query);
  let users;
  if (query.success && query.data.status) {
    users = await db.select().from(usersTable).where(eq(usersTable.status, query.data.status as "pending" | "active" | "rejected"));
  } else {
    users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
  }
  res.json(users.map(formatUser));
});

router.post("/users/:id/verify", async (req: AuthRequest, res) => {
  const p = AdminVerifyUserParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const parsed = AdminVerifyUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }

  const newStatus = parsed.data.approved ? "active" : "rejected";
  const [user] = await db.update(usersTable).set({ status: newStatus }).where(eq(usersTable.id, p.data.id)).returning();
  if (!user) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  res.json(formatUser(user));
});

router.get("/name-change-requests", async (req: AuthRequest, res) => {
  const requests = await db.select().from(nameChangeRequestsTable)
    .orderBy(desc(nameChangeRequestsTable.createdAt));
  res.json(requests.map(r => ({
    id: r.id,
    user_id: r.userId,
    requested_name: r.requestedName,
    status: r.status,
    admin_notes: r.adminNotes ?? null,
    created_at: r.createdAt,
  })));
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
});

router.get("/withdrawals", async (req: AuthRequest, res) => {
  const query = AdminListWithdrawalsQueryParams.safeParse(req.query);
  let withdrawals;
  if (query.success && query.data.status) {
    withdrawals = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.status, query.data.status as "pending" | "paid" | "rejected")).orderBy(desc(withdrawalsTable.createdAt));
  } else {
    withdrawals = await db.select().from(withdrawalsTable).orderBy(desc(withdrawalsTable.createdAt));
  }
  res.json(withdrawals.map(w => ({
    id: w.id,
    user_id: w.userId,
    amount: parseFloat(w.amount),
    method: w.method,
    status: w.status,
    bank_qr_url: w.bankQrUrl ?? null,
    bank_account_info: w.bankAccountInfo ?? null,
    notes: w.notes ?? null,
    created_at: w.createdAt,
    paid_at: w.paidAt ?? null,
  })));
});

router.post("/withdrawals/:id/mark-paid", async (req: AuthRequest, res) => {
  const p = AdminMarkWithdrawalPaidParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const withdrawals = await db.select().from(withdrawalsTable).where(eq(withdrawalsTable.id, p.data.id)).limit(1);
  if (!withdrawals.length) { res.status(404).json({ error: "Retiro no encontrado" }); return; }
  const withdrawal = withdrawals[0];

  if (withdrawal.status === "paid") { res.status(400).json({ error: "Este retiro ya fue pagado" }); return; }

  const { payment_proof_url, withdrawal_pin } = req.body as { payment_proof_url?: string; withdrawal_pin?: string };

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

router.post("/winners/:id/validate", async (req: AuthRequest, res) => {
  const p = AdminValidateWinnerParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const parsed = AdminValidateWinnerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }

  const winners = await db.select().from(winnersTable).where(eq(winnersTable.id, p.data.id)).limit(1);
  if (!winners.length) { res.status(404).json({ error: "Ganador no encontrado" }); return; }
  const winner = winners[0];

  if (parsed.data.approved) {
    // Idempotent + atomic: flip validated false→true and credit in ONE
    // transaction. The conditional WHERE validated = false ensures a repeated
    // or concurrent approval credits the prize exactly once (no double-pay).
    let alreadyValidated = false;
    await db.transaction(async (tx) => {
      const flipped = await tx.update(winnersTable)
        .set({ validated: true, adminNotes: parsed.data.notes ?? null })
        .where(and(eq(winnersTable.id, p.data.id), eq(winnersTable.validated, false)))
        .returning();
      if (!flipped.length) { alreadyValidated = true; return; }
      await tx.execute(
        sql`UPDATE users SET balance = balance + ${parseFloat(winner.prizeAmount)} WHERE id = ${winner.userId}`
      );
    });
    if (alreadyValidated) { res.status(400).json({ error: "Este ganador ya fue validado" }); return; }

    // Get user name for feed
    const users = await db.select().from(usersTable).where(eq(usersTable.id, winner.userId)).limit(1);
    const userName = users[0]?.fullName?.split(" ")[0] ?? "Un jugador";

    // Add to public feed
    await db.insert(feedItemsTable).values({
      type: "winner",
      message: `¡${userName} ganó Bs ${parseFloat(winner.prizeAmount).toFixed(2)}!`,
      amount: winner.prizeAmount,
      userDisplayName: userName,
    });
  } else {
    await db.update(winnersTable).set({ adminNotes: parsed.data.notes ?? null }).where(eq(winnersTable.id, p.data.id));
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
  const query = AdminGetAuditLogsQueryParams.safeParse(req.query);
  const limit = (query.success && query.data.limit) ? query.data.limit : 50;

  let logs = await db.select().from(auditLogsTable)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit);

  res.json(logs.map(l => ({
    id: l.id,
    action: l.action,
    user_id: l.userId ?? null,
    game_id: l.gameId ?? null,
    card_id: l.cardId ?? null,
    details: l.details ?? {},
    ip_address: l.ipAddress ?? null,
    created_at: l.createdAt,
  })));
});

router.get("/stats", async (req: AuthRequest, res) => {
  const totalUsers = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
  const activeGames = await db.select({ count: sql<number>`count(*)` }).from(gamesTable).where(eq(gamesTable.status, "active"));
  const totalCardsSold = await db.select({ count: sql<number>`count(*)` }).from(winnersTable);
  const totalPrizes = await db.select({ total: sql<string>`coalesce(sum(prize_amount), 0)` }).from(winnersTable).where(eq(winnersTable.validated, true));
  const pendingWithdrawals = await db.select({ count: sql<number>`count(*)` }).from(withdrawalsTable).where(eq(withdrawalsTable.status, "pending"));
  const pendingVerifications = await db.select({ count: sql<number>`count(*)` }).from(usersTable).where(eq(usersTable.status, "pending"));

  res.json({
    total_users: Number(totalUsers[0]?.count ?? 0),
    active_games: Number(activeGames[0]?.count ?? 0),
    total_cards_sold: Number(totalCardsSold[0]?.count ?? 0),
    total_prizes_paid: parseFloat(totalPrizes[0]?.total ?? "0"),
    pending_withdrawals_count: Number(pendingWithdrawals[0]?.count ?? 0),
    pending_verifications_count: Number(pendingVerifications[0]?.count ?? 0),
  });
});

router.patch("/games/:id/featured", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  const { is_featured } = req.body as { is_featured?: boolean };
  if (typeof is_featured !== "boolean") { res.status(400).json({ error: "is_featured requerido" }); return; }
  const [game] = await db.update(gamesTable).set({ isFeatured: is_featured }).where(eq(gamesTable.id, id)).returning();
  if (!game) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  res.json({ id: game.id, is_featured: game.isFeatured });
});

export { router as adminRouter };
