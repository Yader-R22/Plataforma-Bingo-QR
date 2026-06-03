import { Router } from "express";
import { db, withdrawalsTable, usersTable, feedItemsTable } from "@workspace/db";
import { eq, and, sum, sql } from "drizzle-orm";
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
    notes: w.notes ?? null,
    created_at: w.createdAt,
    paid_at: w.paidAt ?? null,
  };
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!users.length) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  const user = users[0];

  const pending = await db.select({ total: sql<string>`coalesce(sum(${withdrawalsTable.amount}), 0)` })
    .from(withdrawalsTable)
    .where(and(eq(withdrawalsTable.userId, req.userId!), eq(withdrawalsTable.status, "pending")));

  const totalWon = await db.select({ total: sql<string>`coalesce(sum(${withdrawalsTable.amount}), 0)` })
    .from(withdrawalsTable)
    .where(and(eq(withdrawalsTable.userId, req.userId!), eq(withdrawalsTable.status, "paid")));

  res.json({
    balance: parseFloat(user.balance),
    pending_withdrawals: parseFloat(pending[0]?.total ?? "0"),
    total_won: parseFloat(totalWon[0]?.total ?? "0"),
    total_withdrawn: parseFloat(totalWon[0]?.total ?? "0"),
  });
});

router.get("/withdrawals", requireAuth, async (req: AuthRequest, res) => {
  const withdrawals = await db.select().from(withdrawalsTable)
    .where(eq(withdrawalsTable.userId, req.userId!))
    .orderBy(withdrawalsTable.createdAt);
  res.json(withdrawals.map(formatWithdrawal));
});

router.post("/withdrawals", requireAuth, async (req: AuthRequest, res) => {
  const parsed = RequestWithdrawalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!users.length) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

  const { amount, method, bank_qr_url, bank_account_info } = parsed.data;
  const balance = parseFloat(users[0].balance);

  // Get pending amount
  const pending = await db.select({ total: sql<string>`coalesce(sum(${withdrawalsTable.amount}), 0)` })
    .from(withdrawalsTable)
    .where(and(eq(withdrawalsTable.userId, req.userId!), eq(withdrawalsTable.status, "pending")));
  const pendingAmount = parseFloat(pending[0]?.total ?? "0");

  if (amount > balance - pendingAmount) {
    res.status(400).json({ error: "Saldo insuficiente para realizar el retiro" });
    return;
  }

  const [withdrawal] = await db.insert(withdrawalsTable).values({
    userId: req.userId!,
    amount: String(amount),
    method: method as "cash" | "bank_transfer",
    bankQrUrl: bank_qr_url ?? null,
    bankAccountInfo: bank_account_info ?? null,
  }).returning();

  // Add feed item
  await db.insert(feedItemsTable).values({
    type: "withdrawal",
    message: `${users[0].fullName.split(" ")[0]} está retirando Bs ${amount.toFixed(2)}`,
    amount: String(amount),
    userDisplayName: users[0].fullName.split(" ")[0],
  });

  res.status(201).json(formatWithdrawal(withdrawal));
});

export { router as walletRouter };
