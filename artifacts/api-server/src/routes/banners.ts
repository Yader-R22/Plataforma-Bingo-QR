import { Router } from "express";
import { db } from "@workspace/db";
import { bannersTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

function toSnake(b: { id: number; imageUrl: string; mediaType: string; displayOrder: number; isActive: boolean; createdAt: Date }) {
  return {
    id: b.id,
    image_url: b.imageUrl,
    media_type: b.mediaType,
    display_order: b.displayOrder,
    is_active: b.isActive,
  };
}

router.get("/", async (_req, res) => {
  const banners = await db
    .select()
    .from(bannersTable)
    .where(eq(bannersTable.isActive, true))
    .orderBy(asc(bannersTable.displayOrder), asc(bannersTable.id));
  res.json(banners.map(toSnake));
});

router.post("/", requireAdmin, async (req: AuthRequest, res) => {
  const { image_url, media_type, display_order } = req.body as {
    image_url: string;
    media_type?: string;
    display_order?: number;
  };
  if (!image_url) { res.status(400).json({ error: "image_url requerido" }); return; }
  const [banner] = await db
    .insert(bannersTable)
    .values({ imageUrl: image_url, mediaType: media_type ?? "image", displayOrder: display_order ?? 0 })
    .returning();
  res.status(201).json(toSnake(banner));
});

router.put("/:id", requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { display_order, is_active } = req.body as {
    display_order?: number;
    is_active?: boolean;
  };
  const [updated] = await db
    .update(bannersTable)
    .set({
      ...(display_order !== undefined && { displayOrder: display_order }),
      ...(is_active !== undefined && { isActive: is_active }),
    })
    .where(eq(bannersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "No encontrado" }); return; }
  res.json(toSnake(updated));
});

router.delete("/:id", requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  await db.delete(bannersTable).where(eq(bannersTable.id, id));
  res.json({ ok: true });
});

export { router as bannersRouter };
