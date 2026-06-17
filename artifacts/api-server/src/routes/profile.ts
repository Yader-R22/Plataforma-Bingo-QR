import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, nameChangeRequestsTable, ciChangeRequestsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
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

// ── Estado actual de solicitudes del usuario ────────────────────────────────
router.get("/requests-status", requireAuth, async (req: AuthRequest, res) => {
  const [nameReq] = await db.select()
    .from(nameChangeRequestsTable)
    .where(eq(nameChangeRequestsTable.userId, req.userId!))
    .orderBy(desc(nameChangeRequestsTable.createdAt))
    .limit(1);
  const [ciReq] = await db.select()
    .from(ciChangeRequestsTable)
    .where(eq(ciChangeRequestsTable.userId, req.userId!))
    .orderBy(desc(ciChangeRequestsTable.createdAt))
    .limit(1);
  res.json({
    name_change: nameReq ? {
      id: nameReq.id,
      requested_name: nameReq.requestedName,
      status: nameReq.status,
      admin_notes: nameReq.adminNotes ?? null,
      created_at: nameReq.createdAt,
    } : null,
    ci_change: ciReq ? {
      id: ciReq.id,
      current_ci: ciReq.currentCi,
      requested_ci: ciReq.requestedCi,
      status: ciReq.status,
      admin_notes: ciReq.adminNotes ?? null,
      created_at: ciReq.createdAt,
    } : null,
  });
});

router.post("/ci-change-request", requireAuth, async (req: AuthRequest, res) => {
  const { requested_ci } = req.body as { requested_ci?: string };
  if (!requested_ci?.trim()) { res.status(400).json({ error: "CI requerido" }); return; }

  // Bloquear si hay una solicitud pendiente
  const [existing] = await db.select({ status: ciChangeRequestsTable.status })
    .from(ciChangeRequestsTable)
    .where(and(eq(ciChangeRequestsTable.userId, req.userId!), eq(ciChangeRequestsTable.status, "pending")))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "Ya tienes una solicitud de cambio de CI en revisión. Espera a que sea resuelta." });
    return;
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!users.length) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
  const [request] = await db.insert(ciChangeRequestsTable).values({
    userId: req.userId!,
    currentCi: users[0].ci,
    requestedCi: requested_ci.trim(),
  }).returning();
  res.status(201).json({
    id: request.id,
    user_id: request.userId,
    current_ci: request.currentCi,
    requested_ci: request.requestedCi,
    status: request.status,
    admin_notes: request.adminNotes ?? null,
    created_at: request.createdAt,
  });
});

router.post("/name-change-request", requireAuth, async (req: AuthRequest, res) => {
  const parsed = RequestNameChangeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Datos inválidos" }); return; }

  // Bloquear si hay una solicitud pendiente
  const [existing] = await db.select({ status: nameChangeRequestsTable.status })
    .from(nameChangeRequestsTable)
    .where(and(eq(nameChangeRequestsTable.userId, req.userId!), eq(nameChangeRequestsTable.status, "pending")))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "Ya tienes una solicitud de cambio de nombre en revisión. Espera a que sea resuelta." });
    return;
  }

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
    .set({ passwordHash, mustChangePassword: false, tempPasswordDisplay: null, tempPasswordExpiresAt: null })
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
