import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { firms, users } from "./firms";

export const toolStatusEnum = pgEnum("tool_status", ["approved", "under_review", "prohibited"]);

// Global, seeded once. Not firm-scoped.
export const aiToolCatalog = pgTable("ai_tool_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  vendor: text("vendor"),
  description: text("description"),
});

// Per-firm register. Seeded from the catalog when a firm is created.
export const aiToolRegister = pgTable("ai_tool_register", {
  id: uuid("id").primaryKey().defaultRandom(),
  firmId: uuid("firm_id")
    .notNull()
    .references(() => firms.id),
  catalogId: uuid("catalog_id").references(() => aiToolCatalog.id), // null = firm-added custom tool
  toolName: text("tool_name").notNull(),
  status: toolStatusEnum("status").notNull().default("under_review"),
  vettingNotes: text("vetting_notes"),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
