import { pgTable, uuid, text, timestamp, pgEnum, integer, jsonb, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { firms, users } from "./firms";
import { aiToolRegister } from "./tools";

export const taskCategoryEnum = pgEnum("task_category", [
  "return_prep",
  "research_memo",
  "client_correspondence",
  "written_advice",
  "other",
]);

export const verificationOutcomeEnum = pgEnum("verification_outcome", [
  "approved",
  "flagged",
  "escalated",
  "rejected",
]);

export const reviewerRoleEnum = pgEnum("reviewer_role", ["preparer", "reviewing_partner", "ea", "other"]);

// One row per firm. Holds the tail pointer of that firm's hash chain.
// Locked with SELECT ... FOR UPDATE on write to serialize concurrent appenders per firm.
export const firmChainState = pgTable("firm_chain_state", {
  firmId: uuid("firm_id")
    .primaryKey()
    .references(() => firms.id),
  lastSequenceNo: integer("last_sequence_no").notNull().default(0),
  lastHash: text("last_hash").notNull(),
});

export const verificationLog = pgTable(
  "verification_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id),
    practitionerId: uuid("practitioner_id")
      .notNull()
      .references(() => users.id),
    aiToolId: uuid("ai_tool_id")
      .notNull()
      .references(() => aiToolRegister.id),
    taskCategory: taskCategoryEnum("task_category").notNull(),
    // Shape defined by lib/verification/checklist-definitions.ts — keep in sync.
    checklistItemsReviewed: jsonb("checklist_items_reviewed").notNull(),
    outcome: verificationOutcomeEnum("outcome").notNull(),
    flagReason: text("flag_reason"),
    aiOutputGeneratedAt: timestamp("ai_output_generated_at", { withTimezone: true }).notNull(),
    reviewCompletedAt: timestamp("review_completed_at", { withTimezone: true }).notNull(),
    deliveredToClientAt: timestamp("delivered_to_client_at", { withTimezone: true }),
    reviewerRole: reviewerRoleEnum("reviewer_role").notNull(),
    // Corrections are new append-only rows pointing back at the entry they amend.
    // There is no UPDATE path for this table (see migration 0002 REVOKE).
    amendsEntryId: uuid("amends_entry_id"),
    sequenceNo: integer("sequence_no").notNull(),
    priorHash: text("prior_hash").notNull(),
    entryHash: text("entry_hash").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("verification_log_firm_sequence_unique").on(table.firmId, table.sequenceNo),
    check(
      "flag_reason_required_when_flagged",
      sql`${table.outcome} <> 'flagged' OR ${table.flagReason} IS NOT NULL`
    ),
    check(
      "review_after_generation",
      sql`${table.reviewCompletedAt} >= ${table.aiOutputGeneratedAt}`
    ),
    check(
      "delivery_after_review",
      sql`${table.deliveredToClientAt} IS NULL OR ${table.deliveredToClientAt} >= ${table.reviewCompletedAt}`
    ),
  ]
);
