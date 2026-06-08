import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.SESSION_SECRET || "tu-bingazo-secret-key";

export interface AuthRequest extends Request {
  userId?: number;
  isAdmin?: boolean;
  adminPermissions?: string[];
}

export function generateToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    const users = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
    if (!users.length) {
      res.status(401).json({ error: "Usuario no encontrado", code: "USER_NOT_FOUND" });
      return;
    }
    if (users[0].isBanned) {
      res.status(403).json({ error: `Cuenta suspendida${users[0].banReason ? `: ${users[0].banReason}` : ""}. Contacta al administrador.`, code: "BANNED" });
      return;
    }
    req.userId = users[0].id;
    req.isAdmin = users[0].isAdmin;
    req.adminPermissions = users[0].adminPermissions ?? [];
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}

/** Returns true if the current admin has a specific permission (empty array = super admin = all). */
export function hasAdminPermission(req: AuthRequest, perm: string): boolean {
  if (!req.isAdmin) return false;
  const perms = req.adminPermissions ?? [];
  return perms.length === 0 || perms.includes(perm);
}

/** Middleware that checks for a specific admin permission after requireAdmin. */
export function requirePermission(perm: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    await requireAdmin(req, res, () => {
      if (!hasAdminPermission(req, perm)) {
        res.status(403).json({ error: `Sin permiso para esta sección (${perm})`, code: "FORBIDDEN" });
        return;
      }
      next();
    });
  };
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, async () => {
    if (!req.isAdmin) {
      res.status(403).json({ error: "Acceso denegado. Solo administradores." });
      return;
    }
    next();
  });
}
