import { generateJsonObject } from "@/lib/rag/structured-generate";
import { clauseJudgeSchema, JUDGE_SYSTEM_PROMPT, type ClauseJudgeResult } from "./rubric";
import type { RequiredPolicySection } from "@/lib/rag/sections";
import type { RetryMode } from "@/lib/rag/retry";

// See lib/rag/generate-policy.ts for why this isn't a flagship model.
const JUDGE_MODEL_ID = "alibaba/qwen3.7-flash";

/**
 * Grounding check for one clause. The judge sees only the clause and its
 * claimed source chunk — not the whole corpus — so it's strictly checking
 * "is this specific claim supported by this specific cited text."
 */
export async function judgeClause(clauseText: string, citedChunkText: string, retryMode?: RetryMode): Promise<ClauseJudgeResult> {
  return generateJsonObject({
    model: JUDGE_MODEL_ID,
    schema: clauseJudgeSchema,
    system: JUDGE_SYSTEM_PROMPT,
    prompt: `Clause:\n${clauseText}\n\nSource text it claims to be grounded in:\n${citedChunkText}`,
    retryMode,
  });
}

export type CoverageResult = { missingSections: RequiredPolicySection[] };

/**
 * Deterministic structural check, not an LLM call: every required section
 * must appear exactly once as either a real clause or an explicit refusal.
 * No judgment call needed — this is a completeness check our own code can
 * verify directly.
 */
export function judgeCoverage(
  requiredSections: readonly RequiredPolicySection[],
  clauses: Array<{ section: string }>
): CoverageResult {
  const covered = new Set(clauses.map((c) => c.section));
  return { missingSections: requiredSections.filter((s) => !covered.has(s)) };
}
