import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { REQUIRED_POLICY_SECTIONS } from "@/lib/rag/sections";
import { sleep, type RetryMode } from "@/lib/rag/retry";
import { judgeClause, judgeCoverage } from "./judge";

const JUDGE_MODEL_LABEL = "anthropic/claude-sonnet-4.6";
// See app/(app)/policies/actions.ts for why judge calls are spaced out
// sequentially rather than fired concurrently.
const INTER_CALL_DELAY_MS = 5000;

export type EvalSummary = {
  evalRunId: string;
  passed: boolean;
  findingCount: number;
};

/**
 * Runs the grounding + coverage eval for a generated policy document and
 * persists the result. Called synchronously right after generation (cheap at
 * MVP volume) and standalone via scripts/run-eval.ts.
 */
export async function runEvalForPolicy(policyDocumentId: string, retryMode?: RetryMode): Promise<EvalSummary> {
  const db = getDb();

  const clauses = await db
    .select({
      id: schema.policyDocumentClauses.id,
      section: schema.policyDocumentClauses.circular230Section,
      clauseText: schema.policyDocumentClauses.clauseText,
      isRefusal: schema.policyDocumentClauses.isRefusal,
      citedChunkId: schema.policyDocumentClauses.citedChunkId,
    })
    .from(schema.policyDocumentClauses)
    .where(eq(schema.policyDocumentClauses.policyDocumentId, policyDocumentId));

  type Finding = {
    clauseId: string | null;
    category: "ungrounded_claim" | "citation_mismatch" | "missed_refusal" | "other";
    severity: "low" | "medium" | "high";
    detail: string;
  };

  const findings: Finding[] = [];

  let judgeCallCount = 0;
  for (const clause of clauses) {
    if (clause.isRefusal) continue;

    if (!clause.citedChunkId) {
      findings.push({
        clauseId: clause.id,
        category: "citation_mismatch",
        severity: "high",
        detail: `Clause for §${clause.section} has no cited source chunk but was not marked as a refusal.`,
      });
      continue;
    }

    const [chunk] = await db
      .select({ content: schema.corpusChunks.content })
      .from(schema.corpusChunks)
      .where(eq(schema.corpusChunks.id, clause.citedChunkId))
      .limit(1);

    if (!chunk) {
      findings.push({
        clauseId: clause.id,
        category: "citation_mismatch",
        severity: "high",
        detail: `Clause for §${clause.section} cites a chunk id that no longer exists in the corpus.`,
      });
      continue;
    }

    if (judgeCallCount > 0) {
      await sleep(INTER_CALL_DELAY_MS);
    }
    judgeCallCount++;

    const verdict = await judgeClause(clause.clauseText, chunk.content, retryMode);
    if (verdict.verdict !== "grounded") {
      findings.push({
        clauseId: clause.id,
        category: "ungrounded_claim",
        severity: verdict.verdict === "ungrounded" ? "high" : "medium",
        detail: verdict.explanation,
      });
    }
  }

  const coverage = judgeCoverage(REQUIRED_POLICY_SECTIONS, clauses);
  for (const missingSection of coverage.missingSections) {
    findings.push({
      clauseId: null,
      category: "missed_refusal",
      severity: "high",
      detail: `§${missingSection} has neither a clause nor an explicit refusal — it was silently dropped.`,
    });
  }

  const passed = findings.length === 0;

  const [evalRun] = await db
    .insert(schema.evalRuns)
    .values({ policyDocumentId, judgeModel: JUDGE_MODEL_LABEL, passed })
    .returning();

  if (findings.length > 0) {
    await db.insert(schema.evalFindings).values(
      findings.map((f) => ({
        evalRunId: evalRun.id,
        clauseId: f.clauseId,
        category: f.category,
        severity: f.severity,
        detail: f.detail,
      }))
    );
  }

  return { evalRunId: evalRun.id, passed, findingCount: findings.length };
}
