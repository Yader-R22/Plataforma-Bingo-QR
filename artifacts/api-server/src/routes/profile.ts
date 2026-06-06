import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, nameChangeRequestsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { UploadAvatarBody, RequestNameChangeBody } from "@workspace/api-zod";
import { auditLogsTable } from "@workspace/db";
import { formatUser } from "./auth";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!users.length) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  res.json(formatUser(users[0]));
});

router.post("/avatar", requireAuth, async (req: AuthRequest, res) => {
  const parsed = UploadAvatarBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }
  const avatarUrl = parsed.data.avatar_data.startsWith("data:") ? parsed.data.avatar_data : parsed.data.avatar_data;
  const [user] = await db.update(usersTable).set({ avatarUrl }).where(eq(usersTable.id, req.userId!)).returning();
  res.json(formatUser(user));
});

router.patch("/contact", requireAuth, async (req: AuthRequest, res) => {
  const { phone, department } = req.body as { phone?: string; department?: string };
  const update: Record<string, string> = {};
  if (phone !== undefined) update.phone = String(phone).trim();
  if (department !== undefined) update.department = String(department).trim();
  if (!Object.keys(update).length) { res.status(400).json({ error: "No hay datos para actualizar" }); return; }
  const [user] = await db.update(usersTable).set(update).where(eq(usersTable.id, req.userId!)).returning();
  res.json(formatUser(user));
});

router.post("/ci-change-request", requireAuth, async (req: AuthRequest, res) => {
  const { requested_ci } = req.body as { requested_ci?: string };
  if (!requested_ci?.trim()) { res.status(400).json({ error: "CI requerido" }); return; }
  await db.insert(auditLogsTable).values({
    action: "ci_change_request",
    userId: req.userId,
    details: { requested_ci: requested_ci.trim() },
    ipAddress: req.ip,
  });
  res.status(201).json({ message: "Solicitud de cambio de CI enviada. El administrador la revisará." });
});

router.post("/name-change-request", requireAuth, async (req: AuthRequest, res) => {
  const parsed = RequestNameChangeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }
  const [request] = await db.insert(nameChangeRequestsTable).values({
    userId: req.userId!,
    requestedName: parsed.data.requested_name,
  }).returning();
  res.status(201).json({
    id: request.id,
    user_id: request.userId,
    requested_name: request.requestedName,
    status: request.status,
    admin_notes: request.adminNotes ?? null,
    created_at: request.createdAt,
  });
});

// ── Change own password (clears must_change_password flag) ──────────────────
router.post("/change-password", requireAuth, async (req: AuthRequest, res) => {
  const { new_password } = req.body as { new_password?: string };
  if (!new_password || new_password.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    return;
  }
  const passwordHash = await bcrypt.hash(new_password, 12);
  const [updated] = await db.update(usersTable)
    .set({ passwordHash, mustChangePassword: false, tempPasswordExpiresAt: null })
    .where(eq(usersTable.id, req.userId!))
    .returning();
  await db.insert(auditLogsTable).values({
    action: "user_changed_password",
    userId: req.userId,
    details: { cleared_temp_flag: true },
    ipAddress: req.ip,
  });
  res.json(formatUser(updated));
});

export { router as profileRouter };
