"use server";

import { redirect } from "next/navigation";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { getEligibleNextReviewers } from "@/lib/verification/review-chain";
import { parseVerificationEntryFormData, verifyPractitionerAndTool } from "./entry-helpers";

/**
 * Opens a verification-log "PR": writes a pending submission, not a permanent entry. It only
 * enters the tamper-evident hash chain once it climbs the review chain to whoever currently
 * holds the firm's top review level — see app/(app)/verification/pending/actions.ts's
 * decideSubmission().
 */
export async function submitVerificationEntry(formData: FormData) {
  const ctx = await requireFirmContext();
  const parsed = parseVerificationEntryFormData(formData);
  const db = getDb();

  await verifyPractitionerAndTool(db, ctx.firmId, parsed.practitionerId, parsed.aiToolId);

  const eligibleReviewers = await getEligibleNextReviewers(db, ctx.firmId, ctx.reviewLevel, [
    ctx.userId,
    parsed.practitionerId,
  ]);

  if (eligibleReviewers.length === 0) {
    throw new Error(
      "No one is available to review this — you're already at the firm's top review level, or nobody else qualifies. Ask a firm admin to check review levels under Settings > Members."
    );
  }

  const assignee = eligibleReviewers.find((r) => r.id === parsed.assignToId);
  if (!assignee) {
    throw new Error("Select who to send this to for review");
  }

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
      documentReference: parsed.documentReference ?? null,
      outcome: parsed.outcome,
      flagReason: parsed.flagReason ?? null,
      aiOutputGeneratedAt: parsed.aiOutputGeneratedAt,
      reviewCompletedAt: parsed.reviewCompletedAt,
      deliveredToClientAt: parsed.deliveredToClientAt ?? null,
      reviewerRole: parsed.reviewerRole,
      status: "pending",
      submittedBy: ctx.userId,
      currentAssigneeId: assignee.id,
    })
    .returning();

  redirect(`/verification/pending/${submission.id}?submitted=1`);
}
