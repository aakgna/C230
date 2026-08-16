import { z } from "zod";

export const clauseJudgeSchema = z
  .object({
    verdict: z.enum(["grounded", "ungrounded", "partially_grounded"]),
    explanation: z.string(),
  })
  .describe('{"verdict": "grounded"|"ungrounded"|"partially_grounded", "explanation": string}');

export type ClauseJudgeResult = z.infer<typeof clauseJudgeSchema>;

export const JUDGE_SYSTEM_PROMPT = `You are auditing a single policy clause for a compliance product. You will be given a clause and the exact source text it claims to be grounded in.

Determine ONLY whether the clause's substantive claims are actually supported by that source text — do not evaluate writing quality, tone, or completeness.
- "grounded": every substantive claim in the clause is directly supported by the source text.
- "partially_grounded": some claims are supported, but the clause also asserts something the source text doesn't cover.
- "ungrounded": the clause asserts something the source text doesn't support, or contradicts it.

Be strict — this is a legal compliance context where an unsupported claim is a real defect, not a stylistic nitpick.`;
