import { Router } from "express";
import { db, organizerRequestsTable, usersTable, gamesTable } from "@workspace/db";
import { eq, and, desc, inArray, isNull, ne } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { sendPushToUsers } from "../lib/push";

export const organizerRouter = Router();

// ── Solicitar ser organizador (usuario autenticado) ─────────────────────────
organizerRouter.post("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  // Verificar que no tiene solicitud activa (pending o approved)
  const existing = await db
    .select()
    .from(organizerRequestsTable)
    .where(
      and(
        eq(organizerRequestsTable.userId, userId),
        inArray(organizerRequestsTable.status, ["pending", "approved"]),
      ),
    )
    .limit(1);

  if (existing.length) {
    res.status(409).json({ error: "Ya tienes una solicitud activa como organizador" });
    return;
  }

  const [req2] = await db
    .insert(organizerRequestsTable)
    .values({ userId })
    .returning();

  res.status(201).json(req2);
});

// ── Mi solicitud + juego asignado (usuario autenticado) ─────────────────────
organizerRouter.get("/my", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const rows = await db
    .select()
    .from(organizerRequestsTable)
    .where(eq(organizerRequestsTable.userId, userId))
    .orderBy(desc(organizerRequestsTable.createdAt))
    .limit(1);

  if (!rows.length) {
    res.json({ has_request: false });
    return;
  }

  const request = rows[0];

  // Si está aprobado, buscar juego asignado activo/próximo
  let assignedGame: { id: number; title: string; status: string } | null = null;
  if (request.status === "approved") {
    const games = await db
      .select({ id: gamesTable.id, title: gamesTable.title, status: gamesTable.status })
      .from(gamesTable)
      .where(
        and(
          eq(gamesTable.organizerUserId, userId),
          inArray(gamesTable.status, ["upcoming", "active"]),
        ),
      )
      .limit(1);
    if (games.length) assignedGame = games[0];
  }

  res.json({
    has_request: true,
    id: request.id,
    status: request.status,
    admin_notes: request.adminNotes,
    created_at: request.createdAt,
    assigned_game: assignedGame,
  });
});

// ── Listar todas las solicitudes (admin) ────────────────────────────────────
organizerRouter.get("/", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id: organizerRequestsTable.id,
      status: organizerRequestsTable.status,
      admin_notes: organizerRequestsTable.adminNotes,
      created_at: organizerRequestsTable.createdAt,
      reviewed_at: organizerRequestsTable.reviewedAt,
      user_id: usersTable.id,
      user_name: usersTable.fullName,
      user_ci: usersTable.ci,
      user_phone: usersTable.phone,
      user_department: usersTable.department,
    })
    .from(organizerRequestsTable)
    .innerJoin(usersTable, eq(organizerRequestsTable.userId, usersTable.id))
    .orderBy(desc(organizerRequestsTable.createdAt));

  // Para cada organizador aprobado, incluir su juego asignado actual
  const approvedUserIds = rows
    .filter(r => r.status === "approved")
    .map(r => r.user_id);

  let assignedGames: Array<{ organizerUserId: number | null; id: number; title: string; status: string }> = [];
  if (approvedUserIds.length) {
    assignedGames = await db
      .select({
        organizerUserId: gamesTable.organizerUserId,
        id: gamesTable.id,
        title: gamesTable.title,
        status: gamesTable.status,
      })
      .from(gamesTable)
      .where(
        and(
          inArray(gamesTable.organizerUserId, approvedUserIds),
          inArray(gamesTable.status, ["upcoming", "active"]),
        ),
      );
  }

  const gamesByOrganizer = new Map<number, typeof assignedGames[0]>();
  for (const g of assignedGames) {
    if (g.organizerUserId) gamesByOrganizer.set(g.organizerUserId, g);
  }

  const result = rows.map(r => ({
    ...r,
    assigned_game: r.status === "approved" ? (gamesByOrganizer.get(r.user_id) ?? null) : null,
  }));

  res.json(result);
});

// ── Listar organizadores aprobados disponibles para asignación (admin) ───────
organizerRouter.get("/approved", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id: organizerRequestsTable.id,
      user_id: usersTable.id,
      user_name: usersTable.fullName,
      user_ci: usersTable.ci,
    })
    .from(organizerRequestsTable)
    .innerJoin(usersTable, eq(organizerRequestsTable.userId, usersTable.id))
    .where(eq(organizerRequestsTable.status, "approved"));

  res.json(rows);
});

// ── Actualizar estado de solicitud (admin: aprobar / rechazar) ───────────────
organizerRouter.patch("/:id", requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (!id || isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { status, admin_notes } = req.body as { status?: string; admin_notes?: string };
  if (!status || !["approved", "rejected"].includes(status)) {
    res.status(400).json({ error: "Estado inválido. Usa 'approved' o 'rejected'" });
    return;
  }

  const [updated] = await db
    .update(organizerRequestsTable)
    .set({
      status: status as "approved" | "rejected",
      adminNotes: admin_notes ?? null,
      reviewedById: req.userId!,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(organizerRequestsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }

  // Notificar al usuario
  if (status === "approved") {
    sendPushToUsers([updated.userId], {
      title: "🎉 ¡Solicitud aprobada!",
      body: "Fuiste aprobado como Organizador de Bingo. El admin te asignará un juego pronto.",
      url: "/perfil",
    }).catch(() => {});
  } else if (status === "rejected") {
    sendPushToUsers([updated.userId], {
      title: "❌ Solicitud rechazada",
      body: admin_notes
        ? `Tu solicitud de organizador fue rechazada: ${admin_notes}`
        : "Tu solicitud de organizador fue rechazada. Podés volver a solicitar.",
      url: "/perfil",
    }).catch(() => {});
  }

  res.json(updated);
});

// ── Asignar organizador aprobado a un juego (admin) ─────────────────────────
organizerRouter.post("/:id/assign", requireAdmin, async (req: AuthRequest, res) => {
  const requestId = parseInt(String(req.params.id));
  if (!requestId || isNaN(requestId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { game_id } = req.body as { game_id?: number };
  if (!game_id) { res.status(400).json({ error: "game_id requerido" }); return; }

  // Obtener solicitud
  const [request] = await db
    .select()
    .from(organizerRequestsTable)
    .where(eq(organizerRequestsTable.id, requestId))
    .limit(1);

  if (!request) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  if (request.status !== "approved") {
    res.status(400).json({ error: "El organizador debe estar aprobado para asignar un juego" });
    return;
  }

  // Verificar que el organizador no tiene otro juego activo/próximo
  const activeAssignment = await db
    .select({ id: gamesTable.id })
    .from(gamesTable)
    .where(
      and(
        eq(gamesTable.organizerUserId, request.userId),
        inArray(gamesTable.status, ["upcoming", "active"]),
        ne(gamesTable.id, game_id),
      ),
    )
    .limit(1);

  if (activeAssignment.length) {
    res.status(409).json({ error: "Este organizador ya tiene un juego asignado activo" });
    return;
  }

  // Verificar que el juego existe y no tiene otro organizador
  const [game] = await db
    .select({ id: gamesTable.id, title: gamesTable.title, status: gamesTable.status, organizerUserId: gamesTable.organizerUserId })
    .from(gamesTable)
    .where(eq(gamesTable.id, game_id))
    .limit(1);

  if (!game) { res.status(404).json({ error: "Juego no encontrado" }); return; }
  if (game.organizerUserId && game.organizerUserId !== request.userId) {
    res.status(409).json({ error: "Este juego ya tiene otro organizador asignado" });
    return;
  }

  // Asignar
  await db
    .update(gamesTable)
    .set({ organizerUserId: request.userId })
    .where(eq(gamesTable.id, game_id));

  // Notificar al organizador
  sendPushToUsers([request.userId], {
    title: "🎱 ¡Te asignaron un bingo!",
    body: `Eres el organizador de "${game.title}". Entrá a tu panel para gestionarlo.`,
    url: `/organizador/juego/${game_id}`,
  }).catch(() => {});

  res.json({ ok: true, game_id, organizer_user_id: request.userId });
});

// ── Desasignar organizador de un juego (admin) ───────────────────────────────
organizerRouter.delete("/:id/assign", requireAdmin, async (_req, res) => {
  const requestId = parseInt(String(_req.params.id));
  if (!requestId || isNaN(requestId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [request] = await db
    .select()
    .from(organizerRequestsTable)
    .where(eq(organizerRequestsTable.id, requestId))
    .limit(1);

  if (!request) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }

  // Quitar organizador del juego asignado
  await db
    .update(gamesTable)
    .set({ organizerUserId: null })
    .where(
      and(
        eq(gamesTable.organizerUserId, request.userId),
        inArray(gamesTable.status, ["upcoming", "active"]),
      ),
    );

  res.json({ ok: true });
});
