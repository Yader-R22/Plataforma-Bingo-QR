import { Router } from "express";
import { db, organizerRequestsTable, usersTable, gamesTable, withdrawalsTable, cardsTable, activatorCardSalesTable } from "@workspace/db";
import { eq, and, desc, inArray, ne, sql, sum } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "../middlewares/auth";
import { sendPushToUsers } from "../lib/push";

export const organizerRouter = Router();

// ── Solicitar ser organizador (usuario autenticado) ─────────────────────────
organizerRouter.post("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  try {
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
  } catch (err: any) {
    req.log.error({ err, userId }, "organizer-request POST failed");
    res.status(500).json({ error: err?.message ?? "Error interno al crear solicitud de organizador" });
  }
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

  // Solicitudes rechazadas: mostrar 1 minuto desde que el usuario la vio por primera vez,
  // luego eliminar automáticamente para que pueda volver a solicitar.
  if (request.status === "rejected") {
    if (!request.viewedAt) {
      // Primera vez que la ve — marcar viewed_at
      await db
        .update(organizerRequestsTable)
        .set({ viewedAt: new Date() })
        .where(eq(organizerRequestsTable.id, request.id));
    } else {
      const elapsedMs = Date.now() - request.viewedAt.getTime();
      if (elapsedMs > 60_000) {
        // Pasó 1 minuto — limpiar la solicitud para que pueda pedir de nuevo
        await db
          .delete(organizerRequestsTable)
          .where(eq(organizerRequestsTable.id, request.id));
        res.json({ has_request: false });
        return;
      }
    }
  }

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
      commission_percentage: organizerRequestsTable.commissionPercentage,
      commission_paid_at: organizerRequestsTable.commissionPaidAt,
      commission_amount: organizerRequestsTable.commissionAmount,
    })
    .from(organizerRequestsTable)
    .innerJoin(usersTable, eq(organizerRequestsTable.userId, usersTable.id))
    .orderBy(desc(organizerRequestsTable.createdAt));

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
    commission_percentage: r.commission_percentage !== null ? parseFloat(String(r.commission_percentage)) : null,
    commission_amount: r.commission_amount !== null ? parseFloat(String(r.commission_amount)) : null,
    assigned_game: r.status === "approved" ? (gamesByOrganizer.get(r.user_id) ?? null) : null,
  }));

  res.json(result);
});

// ── Listar bingos concluidos con organizador asignado (admin) ────────────────
organizerRouter.get("/concluded", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id: organizerRequestsTable.id,
      user_id: usersTable.id,
      user_name: usersTable.fullName,
      user_ci: usersTable.ci,
      commission_percentage: organizerRequestsTable.commissionPercentage,
      commission_paid_at: organizerRequestsTable.commissionPaidAt,
      commission_amount: organizerRequestsTable.commissionAmount,
      game_id: gamesTable.id,
      game_title: gamesTable.title,
      game_type: gamesTable.type,
      game_draw_date: gamesTable.drawDate,
      game_card_price: gamesTable.cardPrice,
      game_prize_amount: gamesTable.prizeAmount,
      game_prize_type: gamesTable.prizeType,
      game_mode: gamesTable.gameMode,
      game_participant_count: gamesTable.participantCount,
    })
    .from(organizerRequestsTable)
    .innerJoin(usersTable, eq(organizerRequestsTable.userId, usersTable.id))
    .innerJoin(
      gamesTable,
      and(
        eq(gamesTable.organizerUserId, organizerRequestsTable.userId),
        eq(gamesTable.status, "finished"),
      ),
    )
    .where(eq(organizerRequestsTable.status, "approved"))
    .orderBy(desc(gamesTable.drawDate));

  if (!rows.length) {
    res.json([]);
    return;
  }

  const gameIds = rows.map(r => r.game_id);

  const paidCards = await db
    .select({
      gameId: cardsTable.gameId,
      count: sql<string>`count(*)`,
    })
    .from(cardsTable)
    .where(
      and(
        inArray(cardsTable.gameId, gameIds),
        eq(cardsTable.paymentStatus, "paid"),
      ),
    )
    .groupBy(cardsTable.gameId);

  const paidCardsByGame = new Map(paidCards.map(r => [r.gameId, parseInt(r.count)]));

  const activatorSales = await db
    .select({
      gameId: activatorCardSalesTable.gameId,
      totalDiscount: sum(activatorCardSalesTable.discountAmount),
    })
    .from(activatorCardSalesTable)
    .where(
      and(
        inArray(activatorCardSalesTable.gameId, gameIds),
        inArray(activatorCardSalesTable.status, ["paid", "approved"]),
      ),
    )
    .groupBy(activatorCardSalesTable.gameId);

  const activatorDiscountByGame = new Map(activatorSales.map(r => [r.gameId, parseFloat(String(r.totalDiscount ?? "0"))]));

  const result = rows.map(r => {
    const cardPrice = parseFloat(String(r.game_card_price));
    const totalPaidCards = paidCardsByGame.get(r.game_id) ?? 0;
    const totalDiscount = activatorDiscountByGame.get(r.game_id) ?? 0;
    const totalRevenue = parseFloat((totalPaidCards * cardPrice - totalDiscount).toFixed(2));
    const commPct = parseFloat(String(r.commission_percentage ?? "0"));
    const platformFee = parseFloat((totalRevenue * commPct / 100).toFixed(2));
    const organizerEarning = parseFloat((totalRevenue - platformFee).toFixed(2));

    return {
      id: r.id,
      user_id: r.user_id,
      user_name: r.user_name,
      user_ci: r.user_ci,
      commission_percentage: commPct,
      commission_paid_at: r.commission_paid_at,
      commission_amount: r.commission_amount !== null ? parseFloat(String(r.commission_amount)) : null,
      game: {
        id: r.game_id,
        title: r.game_title,
        type: r.game_type,
        draw_date: r.game_draw_date,
        card_price: cardPrice,
        prize_amount: parseFloat(String(r.game_prize_amount)),
        prize_type: r.game_prize_type,
        game_mode: r.game_mode,
        participant_count: r.game_participant_count,
      },
      revenue: {
        total_paid_cards: totalPaidCards,
        total_revenue: totalRevenue,
        platform_fee: platformFee,
        organizer_earning: organizerEarning,
      },
    };
  });

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

// ── Actualizar porcentaje de comisión de un organizador (admin) ──────────────
organizerRouter.patch("/:id/commission", requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (!id || isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { commission_percentage } = req.body as { commission_percentage?: number };
  if (commission_percentage === undefined || commission_percentage === null) {
    res.status(400).json({ error: "commission_percentage requerido" });
    return;
  }
  const pct = Math.max(0, Math.min(100, parseFloat(String(commission_percentage))));
  if (isNaN(pct)) { res.status(400).json({ error: "commission_percentage inválido" }); return; }

  const [existing] = await db
    .select({ id: organizerRequestsTable.id, commissionPaidAt: organizerRequestsTable.commissionPaidAt })
    .from(organizerRequestsTable)
    .where(eq(organizerRequestsTable.id, id))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  if (existing.commissionPaidAt) {
    res.status(409).json({ error: "La comisión ya fue liberada y no puede modificarse" });
    return;
  }

  const [updated] = await db
    .update(organizerRequestsTable)
    .set({ commissionPercentage: String(pct.toFixed(2)), updatedAt: new Date() })
    .where(eq(organizerRequestsTable.id, id))
    .returning();

  res.json({ ok: true, commission_percentage: parseFloat(String(updated.commissionPercentage ?? "0")) });
});

// ── Asignar organizador aprobado a un juego (admin) ─────────────────────────
organizerRouter.post("/:id/assign", requireAdmin, async (req: AuthRequest, res) => {
  const requestId = parseInt(String(req.params.id));
  if (!requestId || isNaN(requestId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { game_id, commission_percentage } = req.body as { game_id?: number; commission_percentage?: number };
  if (!game_id) { res.status(400).json({ error: "game_id requerido" }); return; }

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

  const pct = commission_percentage !== undefined && commission_percentage !== null
    ? Math.max(0, Math.min(100, parseFloat(String(commission_percentage))))
    : null;

  await db.transaction(async tx => {
    await tx
      .update(gamesTable)
      .set({ organizerUserId: request.userId })
      .where(eq(gamesTable.id, game_id));

    if (pct !== null) {
      await tx
        .update(organizerRequestsTable)
        .set({ commissionPercentage: String(pct.toFixed(2)), updatedAt: new Date() })
        .where(eq(organizerRequestsTable.id, requestId));
    }
  });

  sendPushToUsers([request.userId], {
    title: "🎱 ¡Te asignaron un bingo!",
    body: `Eres el organizador de "${game.title}". Entrá a tu panel para gestionarlo.`,
    url: `/organizador/juego/${game_id}`,
  }).catch(() => {});

  res.json({ ok: true, game_id, organizer_user_id: request.userId, commission_percentage: pct });
});

// ── Liberar comisión al organizador (admin) ──────────────────────────────────
organizerRouter.post("/:id/release-commission", requireAdmin, async (req: AuthRequest, res) => {
  const requestId = parseInt(String(req.params.id));
  if (!requestId || isNaN(requestId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [request] = await db
    .select({
      id: organizerRequestsTable.id,
      userId: organizerRequestsTable.userId,
      status: organizerRequestsTable.status,
      commissionPercentage: organizerRequestsTable.commissionPercentage,
      commissionPaidAt: organizerRequestsTable.commissionPaidAt,
    })
    .from(organizerRequestsTable)
    .where(eq(organizerRequestsTable.id, requestId))
    .limit(1);

  if (!request) { res.status(404).json({ error: "Solicitud no encontrada" }); return; }
  if (request.status !== "approved") { res.status(400).json({ error: "La solicitud debe estar aprobada" }); return; }
  if (request.commissionPaidAt) { res.status(409).json({ error: "La comisión ya fue liberada anteriormente" }); return; }

  const [game] = await db
    .select({ id: gamesTable.id, title: gamesTable.title, cardPrice: gamesTable.cardPrice })
    .from(gamesTable)
    .where(
      and(
        eq(gamesTable.organizerUserId, request.userId),
        eq(gamesTable.status, "finished"),
      ),
    )
    .limit(1);

  if (!game) { res.status(404).json({ error: "No se encontró juego terminado para este organizador" }); return; }

  const cardPrice = parseFloat(String(game.cardPrice));

  const [paidResult] = await db
    .select({ count: sql<string>`count(*)` })
    .from(cardsTable)
    .where(
      and(
        eq(cardsTable.gameId, game.id),
        eq(cardsTable.paymentStatus, "paid"),
      ),
    );
  const totalPaidCards = parseInt(String(paidResult?.count ?? "0"));

  const [discountResult] = await db
    .select({ totalDiscount: sum(activatorCardSalesTable.discountAmount) })
    .from(activatorCardSalesTable)
    .where(
      and(
        eq(activatorCardSalesTable.gameId, game.id),
        inArray(activatorCardSalesTable.status, ["paid", "approved"]),
      ),
    );
  const totalDiscount = parseFloat(String(discountResult?.totalDiscount ?? "0"));

  const totalRevenue = parseFloat((totalPaidCards * cardPrice - totalDiscount).toFixed(2));
  const commPct = parseFloat(String(request.commissionPercentage ?? "0"));
  const platformFee = parseFloat((totalRevenue * commPct / 100).toFixed(2));
  const organizerEarning = parseFloat((totalRevenue - platformFee).toFixed(2));

  if (organizerEarning <= 0) {
    res.status(400).json({ error: "El monto a liberar es cero o negativo" });
    return;
  }

  await db.transaction(async tx => {
    await tx.execute(
      sql`UPDATE users SET balance = balance + ${organizerEarning} WHERE id = ${request.userId}`,
    );

    await tx.insert(withdrawalsTable).values({
      userId: request.userId,
      amount: String(organizerEarning.toFixed(2)),
      method: "organizer_commission",
      status: "paid",
      notes: `Comisión de venta del bingo "${game.title}" — ${commPct}% retenido por plataforma. Ingresos totales: Bs ${totalRevenue.toFixed(2)}`,
      paidAt: new Date(),
    });

    await tx
      .update(organizerRequestsTable)
      .set({
        commissionPaidAt: new Date(),
        commissionAmount: String(organizerEarning.toFixed(2)),
        updatedAt: new Date(),
      })
      .where(eq(organizerRequestsTable.id, requestId));
  });

  req.log.info(
    { admin_id: req.userId, request_id: requestId, game_id: game.id, organizer_user_id: request.userId, organizer_earning: organizerEarning },
    "organizer commission released",
  );

  res.json({
    ok: true,
    organizer_user_id: request.userId,
    game_id: game.id,
    total_revenue: totalRevenue,
    platform_fee: platformFee,
    organizer_earning: organizerEarning,
    commission_percentage: commPct,
  });
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
