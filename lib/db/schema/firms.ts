import { pgTable, uuid, text, timestamp, pgEnum, boolean, integer, unique, type AnyPgColumn } from "drizzle-orm/pg-core";

export const appRoleEnum = pgEnum("app_role", ["firm_admin", "practitioner"]);

export const firms = pgTable("firms", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  name: text("name").notNull(),
  // Seeds this firm's verification-log hash chain. sha256(`${clerkOrgId}:${createdAt}`),
  // computed at firm-creation time so every firm has a unique, deterministic genesis.
  chainGenesisHash: text("chain_genesis_hash").notNull(),
  // Exactly one owner per firm — a relationship, not a third appRole value (a role enum
  // naturally allows zero-to-many; a single FK gives "exactly one" for free). The owner's
  // own appRole is always "firm_admin"; this just adds one extra power on top (demoting
  // another firm_admin — regular admins can't do that to each other). Nullable because it
  // can't be set until the creator's `users` row exists — see pendingOwnerClerkUserId.
  ownerId: uuid("owner_id").references((): AnyPgColumn => users.id),
  // organization.created fires before the creator's `users` row exists (that's only inserted
  // later by organizationMembership.created), so ownership can't be resolved in one step.
  // Holds the raw Clerk user id from organization.created's `created_by` until the matching
  // membership event lands and can resolve it to a real users.id, then gets cleared.
  pendingOwnerClerkUserId: text("pending_owner_clerk_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id),
    // Not globally unique on its own — a single Clerk identity can belong to more than one
    // Clerk organization (a consultant working with two firms, a duplicate invite accepted by
    // habit, etc.), and each membership needs its own row here since appRole/reviewLevel/name
    // are firm-specific. What must stay unique is this person's *membership in a given firm* —
    // see the table-level constraint below. Every lookup by clerkUserId elsewhere (firm-context,
    // the Clerk webhook) must also filter by firmId for the same reason.
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email").notNull(),
    fullName: text("full_name"),
    title: text("title"),
    appRole: appRoleEnum("app_role").notNull().default("practitioner"),
    // Position in the firm's review chain of command — orthogonal to appRole, same reasoning
    // isLogReviewer used to have (an admin can also be a reviewer, a practitioner can be one
    // without becoming admin; a firm's approval hierarchy doesn't have to match its
    // software-permission hierarchy). Level 1 = can only submit. A submission climbs one level
    // at a time (see lib/verification/review-chain.ts) until it reaches whoever currently holds
    // the firm's highest level, whose approval is what finally creates the permanent entry.
    // "Highest level" is computed dynamically (MAX(reviewLevel) per firm), never hardcoded.
    reviewLevel: integer("review_level").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("users_firm_clerk_user_unique").on(table.firmId, table.clerkUserId)]
);
