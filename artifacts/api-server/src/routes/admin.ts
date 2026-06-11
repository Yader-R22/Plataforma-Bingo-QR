import { Router } from "express";
import { db, usersTable, nameChangeRequestsTable, withdrawalsTable, winnersTable, auditLogsTable, gamesTable, feedItemsTable, cardsTable, partnersTable, partnerPaymentsTable, operatingExpensesTable } from "@workspace/db";
import { eq, and, like, sql, desc } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";
import bcrypt from "bcryptjs";
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
    payment_proof_url: w.paymentProofUrl ?? null,
    withdrawal_pin: w.withdrawalPin ?? null,
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
});

// All unvalidated bingo claims across every game — admin uses this for real-time monitoring
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

router.patch("/games/:id/featured", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  const { is_featured } = req.body as { is_featured?: boolean };
  if (typeof is_featured !== "boolean") { res.status(400).json({ error: "is_featured requerido" }); return; }
  const [game] = await db.update(gamesTable).set({ isFeatured: is_featured }).where(eq(gamesTable.id, id)).returning();
  if (!game) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  res.json({ id: game.id, is_featured: game.isFeatured });
});

// ── Detailed user info ──────────────────────────────────────────────────────
router.get("/users/:id", async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  const u = rows[0];

  // Last IP from audit_logs (most recent entry for this user)
  const lastIpRows = await db.select({ ip: auditLogsTable.ipAddress, createdAt: auditLogsTable.createdAt })
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.userId, id), sql`${auditLogsTable.ipAddress} IS NOT NULL`))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(1);

  // Card stats
  const cardCount = await db.select({ count: sql<number>`count(*)` })
    .from(cardsTable).where(eq(cardsTable.userId, id));
  const winCount = await db.select({ count: sql<number>`count(*)` })
    .from(winnersTable).where(eq(winnersTable.userId, id));

  res.json({
    ...formatUser(u),
    last_audit_ip: lastIpRows[0]?.ip ?? null,
    last_audit_at: lastIpRows[0]?.createdAt ?? null,
    cards_purchased: Number(cardCount[0]?.count ?? 0),
    wins: Number(winCount[0]?.count ?? 0),
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
    const locked = await tx.execute(sql`SELECT balance FROM users WHERE id = ${id} FOR UPDATE`);
    const balance = parseFloat((locked.rows[0]?.balance as string | undefined) ?? "0");
    if (type === "debit" && balance < amount) { insufficient = true; return; }
    const delta = type === "credit" ? amount : -amount;
    await tx.execute(sql`UPDATE users SET balance = balance + ${delta} WHERE id = ${id}`);
    newBalance = balance + delta;
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
  await db.delete(usersTable).where(eq(usersTable.id, id));
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

  const [rev, prizes, wdrs, balances] = await Promise.all([
    db.execute(sql`SELECT coalesce(sum(g.card_price),0)::text as total, count(*)::int as count FROM cards c JOIN games g ON c.game_id=g.id WHERE c.payment_status='paid' ${dateWhere("c.created_at")}`),
    db.execute(sql`SELECT coalesce(sum(prize_amount),0)::text as total, count(*)::int as count FROM winners WHERE validated=true ${dateWhere("created_at")}`),
    db.execute(sql`SELECT coalesce(sum(CASE WHEN status='paid' THEN amount ELSE 0 END),0)::text as paid_total, count(*) FILTER (WHERE status='paid') as paid_count, coalesce(sum(CASE WHEN status='pending' THEN amount ELSE 0 END),0)::text as pending_total, count(*) FILTER (WHERE status='pending') as pending_count FROM withdrawals WHERE true ${dateWhere("created_at")}`),
    db.execute(sql`SELECT coalesce(sum(balance),0)::text as total, count(*) FILTER (WHERE balance > 0) as user_count FROM users WHERE is_admin=false`),
  ]);

  const grossRevenue    = parseFloat((rev.rows[0] as any)?.total ?? "0");
  const prizesPaid      = parseFloat((prizes.rows[0] as any)?.total ?? "0");
  const withdrawalsPaid = parseFloat((wdrs.rows[0] as any)?.paid_total ?? "0");
  const netProfit       = grossRevenue - prizesPaid - withdrawalsPaid;

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
    gross_revenue:             grossRevenue,
    cards_sold:                Number((rev.rows[0] as any)?.count ?? 0),
    prizes_paid:               prizesPaid,
    prizes_count:              Number((prizes.rows[0] as any)?.count ?? 0),
    withdrawals_paid:          withdrawalsPaid,
    withdrawals_count:         Number((wdrs.rows[0] as any)?.paid_count ?? 0),
    pending_withdrawals:       parseFloat((wdrs.rows[0] as any)?.pending_total ?? "0"),
    pending_withdrawals_count: Number((wdrs.rows[0] as any)?.pending_count ?? 0),
    balance_in_circulation:    parseFloat((balances.rows[0] as any)?.total ?? "0"),
    users_with_balance:        Number((balances.rows[0] as any)?.user_count ?? 0),
    net_profit:               netProfit,
    total_expenses:           totalExpenses,
    expenses_detail:          expensesDetail,
    committed_prizes:         committedPrizes,
    committed_prizes_detail:  committedGames,
    distributable_profit:     parseFloat((netProfit - totalExpenses - committedPrizes).toFixed(2)),
  });
});

router.get("/finance/games", async (req: AuthRequest, res) => {
  const rows = await db.execute(sql`
    SELECT
      g.id, g.title, g.type, g.status,
      g.card_price::text   AS card_price,
      g.prize_amount::text AS prize_amount,
      g.draw_date,
      count(c.id) FILTER (WHERE c.payment_status='paid') AS cards_sold,
      coalesce(sum(g.card_price) FILTER (WHERE c.payment_status='paid'),0)::text AS revenue,
      coalesce((SELECT sum(prize_amount) FROM winners w WHERE w.game_id=g.id AND w.validated=true),0)::text AS prizes_paid,
      coalesce((SELECT count(*)         FROM winners w WHERE w.game_id=g.id AND w.validated=true),0)::int  AS winners_count
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
    prizes_paid:   parseFloat(r.prizes_paid ?? "0"),
    winners_count: Number(r.winners_count ?? 0),
    net:           parseFloat(r.revenue ?? "0") - parseFloat(r.prizes_paid ?? "0"),
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
             g.title AS game_title, g.card_price::text AS amount,
             ('Compra cartón #' || c.id)::text AS description
      FROM cards c JOIN users u ON c.user_id=u.id JOIN games g ON c.game_id=g.id
      WHERE c.payment_status='paid' ${dw("c.created_at")}
      UNION ALL
      SELECT 'premio'::text, w.created_at, u.full_name, g.title,
             w.prize_amount::text, ('Premio puesto #' || w.place)::text
      FROM winners w JOIN users u ON w.user_id=u.id JOIN games g ON w.game_id=g.id
      WHERE w.validated=true ${dw("w.created_at")}
      UNION ALL
      SELECT 'retiro'::text, wd.created_at, u.full_name, NULL,
             wd.amount::text, ('Retiro via ' || wd.method)::text
      FROM withdrawals wd JOIN users u ON wd.user_id=u.id
      WHERE wd.status='paid' ${dw("wd.created_at")}
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
    finance_snapshot:    r.financeSnapshot,
    admin_notes:         r.adminNotes,
    created_at:          r.createdAt,
  })));
});

router.post("/partners/payments", async (req: AuthRequest, res) => {
  const { periodLabel, periodFrom, periodTo, grossRevenue, netProfit, totalPaid, partnersSnapshot, adminNotes, financeSnapshot } = req.body;
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

export { router as adminRouter };
