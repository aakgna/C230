"use server";

import { previewPolicyIntakeSchema } from "@/lib/validation/schemas";
import { generatePolicyClause, type GeneratedClause } from "@/lib/rag/generate-policy";
import { REQUIRED_POLICY_SECTIONS } from "@/lib/rag/sections";

export type PreviewState = {
  clauses: GeneratedClause[] | null;
  error: string | null;
};

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
  const clauses = await Promise.all(REQUIRED_POLICY_SECTIONS.map((section) => generatePolicyClause(section, parsed.data)));

  return { clauses, error: null };
}
