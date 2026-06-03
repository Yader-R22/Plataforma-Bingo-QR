import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateToken, requireAuth, type AuthRequest } from "../middlewares/auth";
import { LoginBody, RegisterBody, ForgotPasswordBody, ResetPasswordBody } from "@workspace/api-zod";

const router = Router();

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
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "CI o contraseña incorrectos" });
    return;
  }
  const token = generateToken(user.id);
  res.json({ token, user: formatUser(user) });
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
  res.status(201).json({ token, user: formatUser(user) });
});

router.post("/forgot-password", async (req, res) => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const users = await db.select().from(usersTable).where(eq(usersTable.ci, parsed.data.ci)).limit(1);
  if (!users.length) {
    res.json({ message: "Si el CI existe, recibirás instrucciones de restablecimiento" });
    return;
  }
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  await db.update(usersTable).set({ resetToken: token, resetTokenExpiresAt: expiresAt }).where(eq(usersTable.ci, parsed.data.ci));
  req.log.info({ token }, "Password reset token generated (use this token to reset)");
  res.json({ message: "Token de restablecimiento generado. Token: " + token });
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
  await db.update(usersTable).set({ passwordHash, resetToken: null, resetTokenExpiresAt: null }).where(eq(usersTable.id, users[0].id));
  res.json({ message: "Contraseña actualizada correctamente" });
});

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!users.length) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  res.json(formatUser(users[0]));
});

router.post("/logout", (req, res) => {
  res.json({ message: "Sesión cerrada" });
});

export { router as authRouter, formatUser };
