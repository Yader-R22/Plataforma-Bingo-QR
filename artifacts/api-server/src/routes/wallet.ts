import { Router } from "express";
import { db, withdrawalsTable, usersTable, feedItemsTable, winnersTable, gamesTable, referralTransactionsTable } from "@workspace/db";
import { eq, and, sum, sql, notInArray, desc, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { RequestWithdrawalBody } from "@workspace/api-zod";

const router = Router();

function formatWithdrawal(w: typeof withdrawalsTable.$inferSelect) {
  return {
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
  };
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!users.length) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  const user = users[0];

  // Pending withdrawal reservations (actual user-initiated withdrawals)
  const pending = await db.select({ total: sql<string>`coalesce(sum(${withdrawalsTable.amount}), 0)` })
    .from(withdrawalsTable)
    .where(and(
      eq(withdrawalsTable.userId, req.userId!),
      eq(withdrawalsTable.status, "pending"),
      notInArray(withdrawalsTable.method, ["admin_credit", "admin_debit"] as any[]),
    ));

  // Total prizes won (net: full prize minus any commissions actually deducted from prize)
  const [totalWonRaw, totalDeducted, totalWithdrawnRaw] = await Promise.all([
    db.select({ total: sql<string>`coalesce(sum(${winnersTable.prizeAmount}), 0)` })
      .from(winnersTable)
      .where(and(eq(winnersTable.userId, req.userId!), eq(winnersTable.validated, true))),
    db.select({ total: sql<string>`coalesce(sum(${referralTransactionsTable.amount}), 0)` })
      .from(referralTransactionsTable)
      .where(and(
        eq(referralTransactionsTable.referredUserId, req.userId!),
        eq(referralTransactionsTable.type, "commission"),
        eq(referralTransactionsTable.deductedFromPrize, true),
      )),
    db.select({ total: sql<string>`coalesce(sum(${withdrawalsTable.amount}), 0)` })
      .from(withdrawalsTable)
      .where(and(
        eq(withdrawalsTable.userId, req.userId!),
        eq(withdrawalsTable.status, "paid"),
        notInArray(withdrawalsTable.method, ["admin_credit", "admin_debit"] as any[]),
      )),
  ]);

  const totalWonNet = parseFloat((
    parseFloat(totalWonRaw[0]?.total ?? "0") - parseFloat(totalDeducted[0]?.total ?? "0")
  ).toFixed(2));

  res.json({
    balance: parseFloat(user.balance),
    bonus_balance: parseFloat(user.bonusBalance),
    bonus_expires_at: user.bonusExpiresAt ?? null,
    pending_withdrawals: parseFloat(pending[0]?.total ?? "0"),
    total_won: totalWonNet,
    total_withdrawn: parseFloat(totalWithdrawnRaw[0]?.total ?? "0"),
  });
});

router.get("/earnings", requireAuth, async (req: AuthRequest, res) => {
  const rows = await db
    .select({
      id: winnersTable.id,
      game_id: winnersTable.gameId,
      game_title: gamesTable.title,
      game_type: gamesTable.type,
      prize_amount: winnersTable.prizeAmount,
      place: winnersTable.place,
      credited_at: winnersTable.createdAt,
    })
    .from(winnersTable)
    .innerJoin(gamesTable, eq(winnersTable.gameId, gamesTable.id))
    .where(and(eq(winnersTable.userId, req.userId!), eq(winnersTable.validated, true)))
    .orderBy(desc(winnersTable.createdAt));

  // Fetch any activator commissions deducted from these winnings
  const winnerIds = rows.map(r => r.id);
  const commissions = winnerIds.length
    ? await db.select({
        winnerId: referralTransactionsTable.winnerId,
        amount: referralTransactionsTable.amount,
        commissionPercentage: referralTransactionsTable.commissionPercentage,
        deductedFromPrize: referralTransactionsTable.deductedFromPrize,
      })
      .from(referralTransactionsTable)
      .where(and(
        eq(referralTransactionsTable.type, "commission"),
        inArray(referralTransactionsTable.winnerId, winnerIds as number[]),
      ))
    : [];

  const commMap = new Map(commissions.map(c => [c.winnerId, c]));

  res.json(rows.map(r => {
    const comm = commMap.get(r.id);
    return {
      ...r,
      prize_amount: parseFloat(r.prize_amount),
      commission_deducted: comm ? parseFloat(comm.amount) : null,
      commission_pct: comm ? parseFloat(comm.commissionPercentage ?? "0") : null,
      commission_deducted_from_prize: comm ? (comm.deductedFromPrize ?? false) : null,
    };
  }));
});

router.get("/commissions", requireAuth, async (req: AuthRequest, res) => {
  const rows = await db
    .select({
      id: referralTransactionsTable.id,
      amount: referralTransactionsTable.amount,
      commissionPercentage: referralTransactionsTable.commissionPercentage,
      description: referralTransactionsTable.description,
      referredUserName: usersTable.fullName,
      gameTitle: gamesTable.title,
      creditedAt: referralTransactionsTable.createdAt,
    })
    .from(referralTransactionsTable)
    .innerJoin(usersTable, eq(usersTable.id, referralTransactionsTable.referredUserId))
    .leftJoin(gamesTable, eq(gamesTable.id, referralTransactionsTable.gameId))
    .where(and(
      eq(referralTransactionsTable.activatorId, req.userId!),
      eq(referralTransactionsTable.type, "commission"),
    ))
    .orderBy(desc(referralTransactionsTable.createdAt));

  res.json(rows.map(r => ({
    id: r.id,
    amount: parseFloat(r.amount),
    commission_pct: parseFloat(r.commissionPercentage ?? "0"),
    description: r.description,
    referred_user_name: r.referredUserName.trim().split(/\s+/).slice(0, 2).join(" "),
    game_title: r.gameTitle ?? null,
    credited_at: r.creditedAt,
  })));
});

router.get("/withdrawals", requireAuth, async (req: AuthRequest, res) => {
  const withdrawals = await db.select().from(withdrawalsTable)
    .where(eq(withdrawalsTable.userId, req.userId!))
    .orderBy(desc(withdrawalsTable.createdAt));
  res.json(withdrawals.map(formatWithdrawal));
});

router.post("/withdrawals", requireAuth, async (req: AuthRequest, res) => {
  const parsed = RequestWithdrawalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!users.length) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

  const { amount, method, bank_qr_url, bank_account_info } = parsed.data;

  // Reservation must be race-safe: two concurrent requests must not both pass a
  // stale `balance - pending` snapshot and over-reserve funds (which would later
  // drive the balance negative at mark-paid). We lock the user row FOR UPDATE,
  // then re-read balance and pending inside the same transaction so the check
  // and insert are serialized per user.
  let withdrawal: typeof withdrawalsTable.$inferSelect | undefined;
  let insufficient = false;
  await db.transaction(async (tx) => {
    const locked = await tx.execute(
      sql`SELECT balance FROM users WHERE id = ${req.userId!} FOR UPDATE`
    );
    const balance = parseFloat((locked.rows[0]?.balance as string | undefined) ?? "0");

    const pending = await tx.select({ total: sql<string>`coalesce(sum(${withdrawalsTable.amount}), 0)` })
      .from(withdrawalsTable)
      .where(and(eq(withdrawalsTable.userId, req.userId!), eq(withdrawalsTable.status, "pending")));
    const pendingAmount = parseFloat(pending[0]?.total ?? "0");

    if (amount > balance - pendingAmount) { insufficient = true; return; }

    [withdrawal] = await tx.insert(withdrawalsTable).values({
      userId: req.userId!,
      amount: String(amount),
      method: method as "cash" | "bank_transfer",
      bankQrUrl: bank_qr_url ?? null,
      bankAccountInfo: bank_account_info ?? null,
    }).returning();
  });

  if (insufficient || !withdrawal) {
    res.status(400).json({ error: "Saldo insuficiente para realizar el retiro" });
    return;
  }

  res.status(201).json(formatWithdrawal(withdrawal));
});

export { router as walletRouter };
