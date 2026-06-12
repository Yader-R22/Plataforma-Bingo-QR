import {
  pgTable,
  serial,
  numeric,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const activatorSettingsTable = pgTable("activator_settings", {
  id: serial("id").primaryKey(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  whatsappGroupLink: text("whatsapp_group_link"),
  bonusAmount: numeric("bonus_amount", { precision: 10, scale: 2 }).notNull().default("5"),
  bonusTitle: text("bonus_title").notNull().default("Bono de bienvenida"),
  commissionPercentage: numeric("commission_percentage", { precision: 5, scale: 2 }).notNull().default("5"),
  commissionDuration: text("commission_duration", { enum: ["once", "monthly", "indefinite"] }).notNull().default("indefinite"),
  commissionDurationMonths: integer("commission_duration_months"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedById: integer("updated_by_id").references(() => usersTable.id),
});

export type ActivatorSettings = typeof activatorSettingsTable.$inferSelect;
