import { Router } from "express";
import { db } from "@workspace/db";
import { bannersTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/", async (_req, res) => {
  const banners = await db
    .select()
    .from(bannersTable)
    .where(eq(bannersTable.isActive, true))
    .orderBy(asc(bannersTable.displayOrder), asc(bannersTable.id));
  res.json(banners);
});

router.post("/", requireAdmin, async (req: AuthRequest, res) => {
  const { image_url, display_order } = req.body as {
    image_url: string;
    display_order?: number;
  };
  if (!image_url) { res.status(400).json({ error: "image_url requerido" }); return; }
  const [banner] = await db
    .insert(bannersTable)
    .values({ imageUrl: image_url, displayOrder: display_order ?? 0 })
    .returning();
  res.status(201).json(banner);
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
  res.json(updated);
});

router.delete("/:id", requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  await db.delete(bannersTable).where(eq(bannersTable.id, id));
  res.json({ ok: true });
});

export { router as bannersRouter };
