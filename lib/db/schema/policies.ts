import { pgTable, uuid, text, timestamp, date, integer, boolean, jsonb, pgEnum, unique } from "drizzle-orm/pg-core";
import { firms, users } from "./firms";
import { corpusChunks } from "./corpus";

export const policyStatusEnum = pgEnum("policy_status", ["draft", "published", "superseded"]);

export const policyDocuments = pgTable(
  "policy_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id),
    policySlug: text("policy_slug").notNull(), // stable identifier across versions, e.g. "ai-use-policy"
    version: integer("version").notNull(),
    effectiveDate: date("effective_date"),
    status: policyStatusEnum("status").notNull().default("draft"),
    intakeAnswers: jsonb("intake_answers").notNull(), // raw questionnaire responses, for regeneration/audit trail
    createdBy: uuid("created_by").references(() => users.id),
    supersededById: uuid("superseded_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("policy_documents_firm_slug_version_unique").on(table.firmId, table.policySlug, table.version)]
);

export const policyDocumentClauses = pgTable("policy_document_clauses", {
  id: uuid("id").primaryKey().defaultRandom(),
  policyDocumentId: uuid("policy_document_id")
    .notNull()
    .references(() => policyDocuments.id),
  clauseOrder: integer("clause_order").notNull(),
  circular230Section: text("circular230_section").notNull(), // "10.35", "10.27(a)", etc.
  clauseText: text("clause_text").notNull(),
  citedChunkId: uuid("cited_chunk_id").references(() => corpusChunks.id),
  isRefusal: boolean("is_refusal").notNull().default(false),
  refusalReason: text("refusal_reason"),
  isManuallyEdited: boolean("is_manually_edited").notNull().default(false),
  originalText: text("original_text"), // preserved pre-edit text for audit
});
