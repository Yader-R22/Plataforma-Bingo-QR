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

// ── Token cache ──────────────────────────────────────────────────────────────
// Evita una query DB en cada request autenticado (el endpoint /session se llama
// cada 3 segundos por jugador). TTL de 30 s: si el admin suspende a alguien,
// en máx. 30 s dejará de tener acceso.
interface CachedUser {
  userId: number;
  isAdmin: boolean;
  adminPermissions: string[];
  isBanned: boolean;
  banReason: string | null;
  expiresAt: number;
}
const TOKEN_CACHE = new Map<string, CachedUser>();
const TOKEN_CACHE_TTL_MS = 30_000;

// Limpia entradas expiradas cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of TOKEN_CACHE) {
    if (v.expiresAt <= now) TOKEN_CACHE.delete(k);
  }
}, 5 * 60_000).unref();

/** Invalida la entrada de caché de un token (llamar tras ban, cambio de rol, etc.) */
export function invalidateTokenCache(token: string): void {
  TOKEN_CACHE.delete(token);
}

/** Invalida TODAS las entradas de caché de un userId (útil al banear un usuario). */
export function invalidateUserCache(userId: number): void {
  for (const [k, v] of TOKEN_CACHE) {
    if (v.userId === userId) TOKEN_CACHE.delete(k);
  }
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
    jwt.verify(token, JWT_SECRET);
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }

  // Caché hit → evita query DB
  const cached = TOKEN_CACHE.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.isBanned) {
      res.status(403).json({
        error: `Cuenta suspendida${cached.banReason ? `: ${cached.banReason}` : ""}. Contacta al administrador.`,
        code: "BANNED",
      });
      return;
    }
    req.userId = cached.userId;
    req.isAdmin = cached.isAdmin;
    req.adminPermissions = cached.adminPermissions;
    next();
    return;
  }

  // Caché miss → query DB (solo campos necesarios)
  try {
    const payload = jwt.decode(token) as { userId: number };
    const users = await db
      .select({
        id: usersTable.id,
        isAdmin: usersTable.isAdmin,
        adminPermissions: usersTable.adminPermissions,
        isBanned: usersTable.isBanned,
        banReason: usersTable.banReason,
      })
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId))
      .limit(1);

    if (!users.length) {
      res.status(401).json({ error: "Usuario no encontrado", code: "USER_NOT_FOUND" });
      return;
    }

    const u = users[0];
    TOKEN_CACHE.set(token, {
      userId: u.id,
      isAdmin: u.isAdmin,
      adminPermissions: u.adminPermissions ?? [],
      isBanned: u.isBanned,
      banReason: u.banReason ?? null,
      expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
    });

    if (u.isBanned) {
      res.status(403).json({
        error: `Cuenta suspendida${u.banReason ? `: ${u.banReason}` : ""}. Contacta al administrador.`,
        code: "BANNED",
      });
      return;
    }

    req.userId = u.id;
    req.isAdmin = u.isAdmin;
    req.adminPermissions = u.adminPermissions ?? [];
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
