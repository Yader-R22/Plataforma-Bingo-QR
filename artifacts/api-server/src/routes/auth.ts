import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, usersTable, feedItemsTable, winnersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { generateToken, requireAuth, type AuthRequest } from "../middlewares/auth";
import { LoginBody, RegisterBody, ForgotPasswordBody, ResetPasswordBody } from "@workspace/api-zod";

const router = Router();

// ── In-memory rate limiter for CI check (3 failures → 24h block per IP) ──────
const ciCheckAttempts = new Map<string, { failures: number; blockedUntil: Date | null }>();

function getCiCheckEntry(ip: string) {
  if (!ciCheckAttempts.has(ip)) ciCheckAttempts.set(ip, { failures: 0, blockedUntil: null });
  return ciCheckAttempts.get(ip)!;
}

router.post("/check-ci", async (req, res) => {
  const ip = req.ip ?? "unknown";
  const entry = getCiCheckEntry(ip);

  if (entry.blockedUntil && entry.blockedUntil > new Date()) {
    const minutesLeft = Math.ceil((entry.blockedUntil.getTime() - Date.now()) / 60000);
    res.status(429).json({ error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutesLeft} minuto${minutesLeft !== 1 ? "s" : ""}.`, blocked: true });
    return;
  }

  const { ci } = req.body as { ci?: string };
  if (!ci || !/^\d+$/.test(ci.trim())) {
    res.status(400).json({ error: "CI inválido" });
    return;
  }

  const users = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.ci, ci.trim())).limit(1);

  if (!users.length) {
    entry.failures += 1;
    if (entry.failures >= 3) {
      entry.blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      entry.failures = 0;
      res.status(429).json({ error: "Demasiados intentos fallidos. Tu acceso ha sido bloqueado por 24 horas.", blocked: true });
    } else {
      const remaining = 3 - entry.failures;
      res.status(404).json({ error: `CI no registrado en el sistema. Te quedan ${remaining} intento${remaining !== 1 ? "s" : ""}.`, remaining });
    }
    return;
  }

  // CI found — reset counter
  entry.failures = 0;
  entry.blockedUntil = null;
  res.json({ ok: true });
});

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    full_name: user.fullName,
    ci: user.ci,
    phone: user.phone,
    department: user.department,
    balance: parseFloat(user.balance),
    status: user.status,
    is_admin: user.isAdmin,
    avatar_url: user.avatarUrl ?? null,
    id_photo_front_url: user.idPhotoFrontUrl ?? null,
    id_photo_back_url: user.idPhotoBackUrl ?? null,
    needs_ci_upload: user.needsCiUpload,
    rejection_reason: user.rejectionReason ?? null,
    must_change_password: user.mustChangePassword,
    temp_password_expires_at: user.tempPasswordExpiresAt ?? null,
    is_banned: user.isBanned,
    ban_reason: user.banReason ?? null,
    admin_permissions: user.adminPermissions ?? [],
    last_known_ip: user.lastKnownIp ?? null,
    created_at: user.createdAt,
  };
}

router.post("/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const { ci, password } = parsed.data;
  const users = await db.select().from(usersTable).where(eq(usersTable.ci, ci)).limit(1);
  if (!users.length) {
    res.status(401).json({ error: "CI o contraseña incorrectos" });
    return;
  }
  const user = users[0];
  if (user.isBanned) {
    res.status(403).json({ error: `Cuenta suspendida${user.banReason ? `: ${user.banReason}` : ""}. Contacta al administrador.` });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "CI o contraseña incorrectos" });
    return;
  }
  // Check if temp password has expired
  if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < new Date()) {
    res.status(401).json({
      error: "Tu contraseña temporal ha vencido. Contacta al administrador para obtener una nueva.",
      code: "TEMP_PASSWORD_EXPIRED",
    });
    return;
  }
  // Track last known IP for admin panel
  const ip = req.ip ?? req.socket?.remoteAddress ?? null;
  if (ip) await db.update(usersTable).set({ lastKnownIp: ip }).where(eq(usersTable.id, user.id));
  const token = generateToken(user.id);
  res.json({ token, user: formatUser({ ...user, lastKnownIp: ip }) });
});

router.post("/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos de registro inválidos" });
    return;
  }
  const { full_name, ci, phone, password, department, id_photo_front, id_photo_back } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.ci, ci)).limit(1);
  if (existing.length) {
    res.status(409).json({ error: "Ya existe un usuario con ese CI" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(usersTable).values({
    fullName: full_name,
    ci,
    phone,
    department,
    passwordHash,
    idPhotoFrontUrl: id_photo_front ?? null,
    idPhotoBackUrl: id_photo_back ?? null,
  }).returning();

  const token = generateToken(user.id);

  // Feed: nuevo usuario registrado
  const parts = user.fullName.trim().split(/\s+/);
  const displayName = parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0];
  const dept = user.department ?? "";
  db.insert(feedItemsTable).values({
    type: "new_user",
    message: `${displayName}${dept ? ` de ${dept}` : ""} se unió a Tu Bingazo`,
    userDisplayName: displayName,
  }).catch(() => {});

  res.status(201).json({ token, user: formatUser(user) });
});

router.post("/forgot-password", async (req, res) => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const { ci, photo_front, photo_back, photo_selfie } = req.body as {
    ci: string;
    photo_front?: string;
    photo_back?: string;
    photo_selfie?: string;
  };
  if (!photo_front || !photo_back || !photo_selfie) {
    res.status(400).json({ error: "Se requieren las 3 fotos de verificación" });
    return;
  }
  const users = await db.select().from(usersTable).where(eq(usersTable.ci, ci)).limit(1);
  if (!users.length) {
    res.json({ message: "Si el CI existe, tu solicitud será revisada por el administrador" });
    return;
  }
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await db.update(usersTable).set({
    resetToken: token,
    resetTokenExpiresAt: expiresAt,
    resetPhotoFront: photo_front,
    resetPhotoBack: photo_back,
    resetPhotoSelfie: photo_selfie,
  }).where(eq(usersTable.ci, ci));
  res.json({ message: "Solicitud enviada. El administrador la revisará pronto." });
});

router.post("/reset-password", async (req, res) => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const { token, new_password } = parsed.data;
  const users = await db.select().from(usersTable).where(eq(usersTable.resetToken, token)).limit(1);
  if (!users.length || !users[0].resetTokenExpiresAt || users[0].resetTokenExpiresAt < new Date()) {
    res.status(400).json({ error: "Token inválido o expirado" });
    return;
  }
  const passwordHash = await bcrypt.hash(new_password, 12);
  await db.update(usersTable).set({ passwordHash, mustChangePassword: false, tempPasswordDisplay: null, resetToken: null, resetTokenExpiresAt: null }).where(eq(usersTable.id, users[0].id));
  res.json({ message: "Contraseña actualizada correctamente" });
});

router.get("/me/stats", requireAuth, async (req: AuthRequest, res) => {
  const result = await db.select({
    total_won: sql<string>`coalesce(sum(prize_amount), 0)`,
    wins_count: sql<number>`count(*)`,
  }).from(winnersTable).where(eq(winnersTable.userId, req.userId!));
  res.json({
    total_won: parseFloat(result[0]?.total_won ?? "0"),
    wins_count: Number(result[0]?.wins_count ?? 0),
  });
});

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!users.length) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  res.json(formatUser(users[0]));
});

// ── Upload CI photos (for admin-created users) ───────────────────────────────
router.post("/upload-ci", requireAuth, async (req: AuthRequest, res) => {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!users.length) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  const u = users[0];
  if (!u.needsCiUpload && u.status !== "rejected") {
    res.status(400).json({ error: "No se requiere subida de CI" }); return;
  }

  const { id_photo_front, id_photo_back } = req.body as { id_photo_front?: string; id_photo_back?: string };
  if (!id_photo_front || !id_photo_back) {
    res.status(400).json({ error: "Se requieren ambas fotos del CI (anverso y reverso)" }); return;
  }

  const [updated] = await db.update(usersTable)
    .set({
      idPhotoFrontUrl: id_photo_front,
      idPhotoBackUrl: id_photo_back,
      needsCiUpload: false,
      rejectionReason: null,
      status: "pending",
    })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  req.log.info({ userId: req.userId }, "User uploaded CI photos — pending admin review");
  res.json(formatUser(updated));
});

router.post("/logout", (req, res) => {
  res.json({ message: "Sesión cerrada" });
});

export { router as authRouter, formatUser };
