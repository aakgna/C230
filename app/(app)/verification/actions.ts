"use server";

import { redirect } from "next/navigation";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { parseVerificationEntryFormData, verifyPractitionerAndTool } from "./entry-helpers";

/**
 * Opens a verification-log "PR": writes a pending submission, not a permanent entry. It only
 * enters the tamper-evident hash chain once an independent reviewer approves it — see
 * app/(app)/verification/pending/actions.ts's decideSubmission().
 */
export async function submitVerificationEntry(formData: FormData) {
  const ctx = await requireFirmContext();
  const parsed = parseVerificationEntryFormData(formData);
  const db = getDb();

  await verifyPractitionerAndTool(db, ctx.firmId, parsed.practitionerId, parsed.aiToolId);

  const [submission] = await db
    .insert(schema.verificationSubmissions)
    .values({
      firmId: ctx.firmId,
      practitionerId: parsed.practitionerId,
      aiToolId: parsed.aiToolId,
      taskCategory: parsed.taskCategory,
      clientReference: parsed.clientReference ?? null,
      checklistItemsReviewed: parsed.checklistItemsReviewed,
      assumptionsNoted: parsed.assumptionsNoted ?? null,
      evidenceLocation: parsed.evidenceLocation ?? null,
      outcome: parsed.outcome,
      flagReason: parsed.flagReason ?? null,
      aiOutputGeneratedAt: parsed.aiOutputGeneratedAt,
      reviewCompletedAt: parsed.reviewCompletedAt,
      deliveredToClientAt: parsed.deliveredToClientAt ?? null,
      reviewerRole: parsed.reviewerRole,
      status: "pending",
      submittedBy: ctx.userId,
    })
    .returning();

  redirect(`/verification/pending/${submission.id}`);
}
