import { pgTable, uuid, text, timestamp, pgEnum, integer, jsonb, unique, check, type AnyPgColumn } from "drizzle-orm/pg-core";
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

export const verificationSubmissionStatusEnum = pgEnum("verification_submission_status", [
  "pending",
  "approved",
  "rejected",
]);

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
    // Client name, return ID, or matter number — free text so this doesn't depend on a client
    // identity system existing. Optional: not every entry (e.g. an internal research memo) maps
    // to one client, but without it a client-specific record can't be found again on request.
    clientReference: text("client_reference"),
    // Shape defined by lib/verification/checklist-definitions.ts — keep in sync.
    checklistItemsReviewed: jsonb("checklist_items_reviewed").notNull(),
    // Assumptions the AI made that the reviewer identified and verified/revised/removed —
    // relevant to the §10.37 written-advice standard of reasonable factual/legal assumptions.
    assumptionsNoted: text("assumptions_noted"),
    // Where the actual AI transcript lives — a DMS path or the AI provider's own chat URL.
    // Deliberately a pointer, not the content itself: the app never takes custody of a second
    // copy of client data. See docs/ai-trace-attachments-plan.md for why full storage was
    // considered and not pursued.
    evidenceLocation: text("evidence_location"),
    // Free text, deliberately unstructured: the document's name/ID per the firm's own DMS
    // convention (e.g. "Smith_1040_2026", or an iManage/NetDocuments doc ID), purely so the
    // firm can look this entry's evidence up in their own system later. This app can't enforce
    // one naming scheme across firms, same reasoning as clientReference below.
    documentReference: text("document_reference"),
    outcome: verificationOutcomeEnum("outcome").notNull(),
    flagReason: text("flag_reason"),
    aiOutputGeneratedAt: timestamp("ai_output_generated_at", { withTimezone: true }).notNull(),
    reviewCompletedAt: timestamp("review_completed_at", { withTimezone: true }).notNull(),
    deliveredToClientAt: timestamp("delivered_to_client_at", { withTimezone: true }),
    reviewerRole: reviewerRoleEnum("reviewer_role").notNull(),
    // Corrections are new append-only rows pointing back at the entry they amend.
    // There is no UPDATE path for this table (enforced by a trigger, see migration 0001).
    amendsEntryId: uuid("amends_entry_id"),
    // Who independently approved this entry (someone other than the submitter and the named
    // practitioner — see requireIndependentReviewer in lib/auth/rbac.ts), and when. Nullable:
    // entries written directly by scripts/seed.ts or predating the review workflow have none.
    // Deliberately NOT part of canonicalize()/entryHash — see hash-chain.ts for why.
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    submissionId: uuid("submission_id").references((): AnyPgColumn => verificationSubmissions.id),
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

// Mutable pending/approved/rejected workflow state — deliberately NOT append-only (no trigger
// like verification_log's). A submission only becomes permanent, tamper-evident history once
// approved, at which point appendVerificationEntry() writes it into verification_log. Content
// columns mirror verification_log's; the fields below that are unique to this table are the
// submit/decide workflow metadata.
export const verificationSubmissions = pgTable(
  "verification_submissions",
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
    clientReference: text("client_reference"),
    checklistItemsReviewed: jsonb("checklist_items_reviewed").notNull(),
    assumptionsNoted: text("assumptions_noted"),
    evidenceLocation: text("evidence_location"),
    documentReference: text("document_reference"),
    outcome: verificationOutcomeEnum("outcome").notNull(),
    flagReason: text("flag_reason"),
    aiOutputGeneratedAt: timestamp("ai_output_generated_at", { withTimezone: true }).notNull(),
    reviewCompletedAt: timestamp("review_completed_at", { withTimezone: true }).notNull(),
    deliveredToClientAt: timestamp("delivered_to_client_at", { withTimezone: true }),
    reviewerRole: reviewerRoleEnum("reviewer_role").notNull(),
    amendsEntryId: uuid("amends_entry_id").references((): AnyPgColumn => verificationLog.id),

    status: verificationSubmissionStatusEnum("status").notNull().default("pending"),
    submittedBy: uuid("submitted_by")
      .notNull()
      .references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    // Whoever needs to act right now — a mid-chain reviewer one level up, or back to
    // submittedBy after a rejection at any level. Only meaningful while status='pending';
    // decidedBy/decidedAt/decisionNotes below are reserved for the terminal action (the
    // top-of-chain approval, or a rejection), not every intermediate forward — see
    // verificationSubmissionReviews for the full per-hop history.
    currentAssigneeId: uuid("current_assignee_id")
      .notNull()
      .references(() => users.id),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNotes: text("decision_notes"),
    // Set once approved — the resulting permanent entry. verificationLog.submissionId points
    // back the other way, so the link is navigable from either side.
    verificationLogId: uuid("verification_log_id").references(() => verificationLog.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("verification_submissions_log_unique").on(table.verificationLogId),
    check(
      "submission_flag_reason_required_when_flagged",
      sql`${table.outcome} <> 'flagged' OR ${table.flagReason} IS NOT NULL`
    ),
    check(
      "submission_review_after_generation",
      sql`${table.reviewCompletedAt} >= ${table.aiOutputGeneratedAt}`
    ),
    check(
      "submission_delivery_after_review",
      sql`${table.deliveredToClientAt} IS NULL OR ${table.deliveredToClientAt} >= ${table.reviewCompletedAt}`
    ),
    check(
      "submission_decision_notes_required_when_rejected",
      sql`${table.status} <> 'rejected' OR ${table.decisionNotes} IS NOT NULL`
    ),
    check(
      "submission_decided_fields_consistent",
      sql`${table.status} = 'pending' OR (${table.decidedBy} IS NOT NULL AND ${table.decidedAt} IS NOT NULL)`
    ),
    check(
      "submission_log_id_set_iff_approved",
      sql`(${table.status} = 'approved') = (${table.verificationLogId} IS NOT NULL)`
    ),
    // DB-level backstop for the independence rule — application code (requireIndependentReviewer
    // in lib/auth/rbac.ts) is the primary enforcement, this is defense-in-depth.
    check(
      "submission_decider_independent",
      sql`${table.decidedBy} IS NULL OR (${table.decidedBy} <> ${table.submittedBy} AND ${table.decidedBy} <> ${table.practitionerId})`
    ),
    // Same independence guarantee, but for whoever's currently holding the submission — only
    // while it's actively climbing the chain (status='pending'). Once rejected, currentAssigneeId
    // is *intentionally* submittedBy (that's the real "sent back to the submitter" state), so the
    // constraint deliberately doesn't apply there. Application code
    // (getEligibleNextReviewers excluding the submitter/practitioner) is the primary
    // enforcement; this is defense-in-depth.
    check(
      "submission_assignee_independent_while_pending",
      sql`${table.status} <> 'pending' OR (${table.currentAssigneeId} <> ${table.submittedBy} AND ${table.currentAssigneeId} <> ${table.practitionerId})`
    ),
  ]
);

// One row per hop in a submission's review chain — a mid-chain approve-and-forward, the final
// top-of-chain approval, or a rejection. verificationSubmissions.decidedBy/decidedAt/
// decisionNotes only ever reflect the terminal action, so without this table an intermediate
// reviewer's notes would be silently overwritten by whoever acts next. Not append-only at the
// DB level (no trigger) — unlike verification_log, this is workflow history, not the
// tamper-evident record itself.
export const reviewStepActionEnum = pgEnum("review_step_action", ["forwarded", "approved", "rejected"]);

export const verificationSubmissionReviews = pgTable("verification_submission_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => verificationSubmissions.id),
  reviewerId: uuid("reviewer_id")
    .notNull()
    .references(() => users.id),
  // Snapshot at the time of this action, not a live join to users.reviewLevel — stays
  // historically accurate even if this person's level changes later.
  reviewerLevel: integer("reviewer_level").notNull(),
  action: reviewStepActionEnum("action").notNull(),
  notes: text("notes"),
  // Set only when action = 'forwarded'.
  forwardedToId: uuid("forwarded_to_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
