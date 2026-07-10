import path from "path";
import fs from "fs";

export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(process.cwd(), "uploads");
fs.mkdirSync(path.join(UPLOADS_DIR, "banners"), { recursive: true });
fs.mkdirSync(path.join(UPLOADS_DIR, "receipts"), { recursive: true });
