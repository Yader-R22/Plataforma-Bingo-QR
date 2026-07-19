import { Router } from "express";
import crypto from "crypto";
import { db, usersTable, activatorRequestsTable, referralCodesTable, referralTransactionsTable, activatorSettingsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

// ── GET /referrals/validate/:code — public: check if a code is valid ─────────
router.get("/validate/:code", async (req, res) => {
  const { code } = req.params;
  const rows = await db.select({
    id: referralCodesTable.id,
    userId: referralCodesTable.userId,
    activatorName: usersTable.fullName,
  })
    .from(referralCodesTable)
    .innerJoin(usersTable, eq(referralCodesTable.userId, usersTable.id))
    .where(and(eq(referralCodesTable.code, code), eq(referralCodesTable.isActive, true)))
    .limit(1);

  if (!rows.length) {
    res.status(404).json({ error: "Código de activador no válido" });
    return;
  }

  const settings = await db.select().from(activatorSettingsTable).limit(1);
  const bonusAmount = parseFloat(settings[0]?.bonusAmount ?? "5");
  const bonusTitle = settings[0]?.bonusTitle ?? "Bono de bienvenida";
  const activatorName = rows[0].activatorName.trim().split(/\s+/).slice(0, 2).join(" ");

  res.json({
    valid: true,
    activator_name: activatorName,
    bonus_amount: bonusAmount,
    bonus_title: bonusTitle.replace("{activator}", activatorName),
  });
});

// ── POST /referrals/request — player requests to become activator ─────────────
router.post("/request", requireAuth, async (req: AuthRequest, res) => {
  // Block if program is disabled
  const settings = await db.select().from(activatorSettingsTable).limit(1);
  if (settings.length && settings[0].isEnabled === false) {
    res.status(403).json({ error: "El Programa de Activadores está temporalmente desactivado" });
    return;
  }

  const existing = await db.select()
    .from(activatorRequestsTable)
    .where(eq(activatorRequestsTable.userId, req.userId!))
    .limit(1);

  if (existing.length) {
    const req_ = existing[0];
    if (req_.status === "accepted") {
      res.status(400).json({ error: "Ya eres un activador" });
      return;
    }
    if (req_.status === "pending" || req_.status === "hold") {
      res.status(400).json({ error: "Ya tienes una solicitud en proceso" });
      return;
    }
    if (req_.status === "banned") {
      res.status(403).json({ error: "Tu acceso al Programa de Activadores fue revocado" });
      return;
    }
    if (req_.status === "suspended") {
      res.status(403).json({ error: "Tu cuenta de activador está suspendida temporalmente" });
      return;
    }
    // rejected → allow re-request: update existing row
    const [updated] = await db.update(activatorRequestsTable)
      .set({ status: "pending", notes: null, reviewedAt: null, reviewedById: null, updatedAt: new Date() })
      .where(eq(activatorRequestsTable.id, req_.id))
      .returning();
    res.status(201).json(formatRequest(updated));
    return;
  }

  const [created] = await db.insert(activatorRequestsTable)
    .values({ userId: req.userId! })
    .returning();

  res.status(201).json(formatRequest(created));
});

// ── GET /referrals/status — player checks their activator status + code ───────
router.get("/status", requireAuth, async (req: AuthRequest, res) => {
  const [requests, settingsRows] = await Promise.all([
    db.select().from(activatorRequestsTable).where(eq(activatorRequestsTable.userId, req.userId!)).limit(1),
    db.select().from(activatorSettingsTable).limit(1),
  ]);

  const programEnabled = settingsRows.length ? settingsRows[0].isEnabled : true;
  const whatsappGroupLink = settingsRows.length ? (settingsRows[0].whatsappGroupLink ?? null) : null;

  if (!requests.length) {
    res.json({ has_request: false, status: null, code: null, link: null, program_enabled: programEnabled, whatsapp_group_link: whatsappGroupLink });
    return;
  }

  const request = requests[0];
  let code: string | null = null;
  let link: string | null = null;

  if (request.status === "accepted") {
    const codes = await db.select()
      .from(referralCodesTable)
      .where(and(eq(referralCodesTable.userId, req.userId!), eq(referralCodesTable.isActive, true)))
      .limit(1);
    if (codes.length) {
      code = codes[0].code;
      link = `/registro?ref=${code}`;
    }
  }

  res.json({
    has_request: true,
    status: request.status,
    notes: request.notes ?? null,
    code,
    link,
    created_at: request.createdAt,
    program_enabled: programEnabled,
    whatsapp_group_link: whatsappGroupLink,
  });
});

// ── GET /referrals/history — player sees their referral transaction history ───
router.get("/history", requireAuth, async (req: AuthRequest, res) => {
  const rows = await db.select({
    id: referralTransactionsTable.id,
    type: referralTransactionsTable.type,
    amount: referralTransactionsTable.amount,
    commission_percentage: referralTransactionsTable.commissionPercentage,
    description: referralTransactionsTable.description,
    activator_id: referralTransactionsTable.activatorId,
    referred_user_id: referralTransactionsTable.referredUserId,
    game_id: referralTransactionsTable.gameId,
    created_at: referralTransactionsTable.createdAt,
  })
    .from(referralTransactionsTable)
    .where(
      sql`${referralTransactionsTable.activatorId} = ${req.userId!} OR ${referralTransactionsTable.referredUserId} = ${req.userId!}`
    )
    .orderBy(desc(referralTransactionsTable.createdAt))
    .limit(100);

  const referred = await db.select({ count: sql<number>`count(*)` })
    .from(usersTable)
    .where(
      sql`${usersTable.referredByCode} IN (
        SELECT code FROM referral_codes WHERE user_id = ${req.userId!}
      )`
    );

  res.json({
    transactions: rows.map(r => ({
      ...r,
      amount: parseFloat(r.amount),
      commission_percentage: r.commission_percentage ? parseFloat(r.commission_percentage) : null,
    })),
    total_referred: Number(referred[0]?.count ?? 0),
  });
});

function formatRequest(r: typeof activatorRequestsTable.$inferSelect) {
  return {
    id: r.id,
    user_id: r.userId,
    status: r.status,
    notes: r.notes ?? null,
    created_at: r.createdAt,
    reviewed_at: r.reviewedAt ?? null,
  };
}

export { router as referralsRouter };
