import {
  pgTable,
  text,
  serial,
  timestamp,
  numeric,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  ci: text("ci").notNull().unique(),
  phone: text("phone").notNull(),
  department: text("department").notNull(),
  passwordHash: text("password_hash").notNull(),
  balance: numeric("balance", { precision: 10, scale: 2 }).notNull().default("0"),
  status: text("status", { enum: ["pending", "active", "rejected"] }).notNull().default("pending"),
  isAdmin: boolean("is_admin").notNull().default(false),
  avatarUrl: text("avatar_url"),
  idPhotoFrontUrl: text("id_photo_front_url"),
  idPhotoBackUrl: text("id_photo_back_url"),
  resetToken: text("reset_token"),
  resetTokenExpiresAt: timestamp("reset_token_expires_at", { withTimezone: true }),
  resetPhotoFront: text("reset_photo_front"),
  resetPhotoBack: text("reset_photo_back"),
  resetPhotoSelfie: text("reset_photo_selfie"),
  needsCiUpload: boolean("needs_ci_upload").notNull().default(false),
  rejectionReason: text("rejection_reason"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  tempPasswordDisplay: text("temp_password_display"),
  tempPasswordExpiresAt: timestamp("temp_password_expires_at", { withTimezone: true }),
  bonusBalance: numeric("bonus_balance", { precision: 10, scale: 2 }).notNull().default("0"),
  bonusExpiresAt: timestamp("bonus_expires_at", { withTimezone: true }),
  adminCreditBalance: numeric("admin_credit_balance", { precision: 10, scale: 2 }).notNull().default("0"),
  referredByCode: text("referred_by_code"),
  isBanned: boolean("is_banned").notNull().default(false),
  banReason: text("ban_reason"),
  adminPermissions: text("admin_permissions").array().notNull().default(sql`ARRAY[]::text[]`),
  lastKnownIp: text("last_known_ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  passwordHash: true,
  balance: true,
  isAdmin: true,
  status: true,
  resetToken: true,
  resetTokenExpiresAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
