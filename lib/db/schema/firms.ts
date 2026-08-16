import { pgTable, uuid, text, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";

export const appRoleEnum = pgEnum("app_role", ["firm_admin", "practitioner"]);

export const firms = pgTable("firms", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  name: text("name").notNull(),
  // Seeds this firm's verification-log hash chain. sha256(`${clerkOrgId}:${createdAt}`),
  // computed at firm-creation time so every firm has a unique, deterministic genesis.
  chainGenesisHash: text("chain_genesis_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  firmId: uuid("firm_id")
    .notNull()
    .references(() => firms.id),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  title: text("title"),
  appRole: appRoleEnum("app_role").notNull().default("practitioner"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
