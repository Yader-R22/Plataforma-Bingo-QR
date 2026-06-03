import { Router } from "express";
import { db, usersTable, nameChangeRequestsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { UploadAvatarBody, RequestNameChangeBody } from "@workspace/api-zod";
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

export { router as profileRouter };
