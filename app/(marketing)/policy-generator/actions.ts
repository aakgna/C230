"use server";

import { previewPolicyIntakeSchema } from "@/lib/validation/schemas";
import { generatePolicyClause, type GeneratedClause } from "@/lib/rag/generate-policy";
import { REQUIRED_POLICY_SECTIONS } from "@/lib/rag/sections";
import { sleep } from "@/lib/rag/retry";

export type PreviewState = {
  clauses: GeneratedClause[] | null;
  error: string | null;
};

// See app/(app)/policies/actions.ts for why this is sequential with a delay
// rather than concurrent.
const INTER_CALL_DELAY_MS = 5000;

export async function previewPolicyClauses(_prevState: PreviewState, formData: FormData): Promise<PreviewState> {
  const parsed = previewPolicyIntakeSchema.safeParse({
    clientDataSensitivity: formData.get("clientDataSensitivity"),
    practiceMix: formData.getAll("practiceMix"),
  });

  if (!parsed.success) {
    return { clauses: null, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // No persistence, no firm_id — this is a stateless preview. Signed-up
  // firms get the full generatePolicyClause pipeline via
  // app/(app)/policies/actions.ts, which does persist.
  const clauses: GeneratedClause[] = [];
  for (const section of REQUIRED_POLICY_SECTIONS) {
    if (clauses.length > 0) {
      await sleep(INTER_CALL_DELAY_MS);
    }
    clauses.push(await generatePolicyClause(section, parsed.data));
  }

  return { clauses, error: null };
}
