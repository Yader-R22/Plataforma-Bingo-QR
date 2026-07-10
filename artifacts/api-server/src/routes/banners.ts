import { Router } from "express";
import { db } from "@workspace/db";
import { bannersTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAdmin, type AuthRequest } from "../middlewares/auth";
import { UPLOADS_DIR } from "../app";

const router = Router();

const BANNERS_DIR = path.join(UPLOADS_DIR, "banners");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, BANNERS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".bin";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB max
});

function toSnake(b: { id: number; imageUrl: string; mediaType: string; displayOrder: number; isActive: boolean; createdAt: Date }) {
  return {
    id: b.id,
    image_url: b.imageUrl,
    media_type: b.mediaType,
    display_order: b.displayOrder,
    is_active: b.isActive,
  };
}

function deleteFileIfLocal(imageUrl: string) {
  if (!imageUrl.startsWith("/api/uploads/")) return;
  const relative = imageUrl.replace("/api/uploads/", "");
  const fullPath = path.join(UPLOADS_DIR, relative);
  fs.unlink(fullPath, () => {});
}

// GET /api/banners — list active banners
router.get("/", async (_req, res) => {
  const banners = await db
    .select()
    .from(bannersTable)
    .where(eq(bannersTable.isActive, true))
    .orderBy(asc(bannersTable.displayOrder), asc(bannersTable.id));
  res.json(banners.map(toSnake));
});

// POST /api/banners/upload — multipart upload (videos + large images)
router.post("/upload", requireAdmin, upload.single("file"), async (req: AuthRequest, res) => {
  if (!req.file) { res.status(400).json({ error: "No se recibió archivo" }); return; }
  const mime = req.file.mimetype;
  const mediaType = mime.startsWith("video/") ? "video" : mime === "image/gif" ? "gif" : "image";
  const displayOrder = Number(req.body.display_order ?? 0);
  const imageUrl = `/api/uploads/banners/${req.file.filename}`;
  const [banner] = await db
    .insert(bannersTable)
    .values({ imageUrl, mediaType, displayOrder })
    .returning();
  req.log.info({ admin_id: req.userId, file: req.file.filename, size: req.file.size }, "Banner uploaded to disk");
  res.status(201).json(toSnake(banner));
});

// POST /api/banners — JSON body (small base64 images ≤ 2 MB)
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

// PUT /api/banners/:id — update display_order / is_active
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

// DELETE /api/banners/:id — also removes file from disk if uploaded
router.delete("/:id", requireAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const [deleted] = await db.delete(bannersTable).where(eq(bannersTable.id, id)).returning();
  if (deleted) deleteFileIfLocal(deleted.imageUrl);
  res.json({ ok: true });
});

export { router as bannersRouter };
