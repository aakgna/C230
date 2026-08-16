import { pgTable, uuid, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { policyDocuments } from "./policies";
import { policyDocumentClauses } from "./policies";

export const evalFindingCategoryEnum = pgEnum("eval_finding_category", [
  "ungrounded_claim",
  "citation_mismatch",
  "missed_refusal",
  "other",
]);

export const evalFindingSeverityEnum = pgEnum("eval_finding_severity", ["low", "medium", "high"]);

export const evalRuns = pgTable("eval_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  policyDocumentId: uuid("policy_document_id")
    .notNull()
    .references(() => policyDocuments.id),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  judgeModel: text("judge_model").notNull(),
  passed: boolean("passed").notNull(),
});

export const evalFindings = pgTable("eval_findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  evalRunId: uuid("eval_run_id")
    .notNull()
    .references(() => evalRuns.id),
  clauseId: uuid("clause_id").references(() => policyDocumentClauses.id),
  category: evalFindingCategoryEnum("category").notNull(),
  severity: evalFindingSeverityEnum("severity").notNull(),
  detail: text("detail").notNull(),
});
