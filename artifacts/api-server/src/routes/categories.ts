import { Router } from "express";
import { db, gameCategoriesTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";
import { UpdateCategoryParams, UpdateCategoryBody } from "@workspace/api-zod";

const router = Router();

function formatCategory(c: typeof gameCategoriesTable.$inferSelect) {
  return {
    id: c.id,
    type: c.type,
    label: c.label,
    emoji: c.emoji,
    description: c.description,
    color_from: c.colorFrom,
    color_to: c.colorTo,
    sort_order: c.sortOrder,
    is_active: c.isActive,
  };
}

router.get("/", async (_req, res) => {
  const categories = await db.select().from(gameCategoriesTable).orderBy(asc(gameCategoriesTable.sortOrder));
  res.json(categories.map(formatCategory));
});

router.patch("/:id", requireAdmin, async (req: AuthRequest, res) => {
  const p = UpdateCategoryParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!p.success) { res.status(400).json({ error: "ID inválido" }); return; }
  const b = UpdateCategoryBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: "Datos inválidos" }); return; }

  const updates: Partial<typeof gameCategoriesTable.$inferInsert> = {};
  if (b.data.label !== undefined) updates.label = b.data.label;
  if (b.data.emoji !== undefined) updates.emoji = b.data.emoji;
  if (b.data.description !== undefined) updates.description = b.data.description;
  if (b.data.color_from !== undefined) updates.colorFrom = b.data.color_from;
  if (b.data.color_to !== undefined) updates.colorTo = b.data.color_to;
  if (b.data.sort_order !== undefined) updates.sortOrder = b.data.sort_order;
  if (b.data.is_active !== undefined) updates.isActive = b.data.is_active;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Sin cambios" }); return; }

  const [updated] = await db.update(gameCategoriesTable).set(updates)
    .where(eq(gameCategoriesTable.id, p.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Categoría no encontrada" }); return; }

  req.log.info({ categoryId: p.data.id }, "Categoría actualizada por admin");
  res.json(formatCategory(updated));
});

export { router as categoriesRouter };
