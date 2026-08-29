"use server";

import { redirect } from "next/navigation";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { getEligibleNextReviewers } from "@/lib/verification/review-chain";
import {
  parseVerificationEntryFormData,
  verifyPractitionerAndTool,
  toActionErrorState,
  type EntryFormState,
} from "./entry-helpers";

/**
 * Opens a verification-log "PR": writes a pending submission, not a permanent entry. It only
 * enters the tamper-evident hash chain once it climbs the review chain to whoever currently
 * holds the firm's top review level — see app/(app)/verification/pending/actions.ts's
 * decideSubmission(). Bad input (invalid dates, no eligible reviewer) is returned as state, not
 * thrown — see toActionErrorState's comment. redirect() below is deliberately outside any
 * try/catch: it works by throwing a special Next.js-internal signal, which a catch block here
 * would intercept and misreport as a real error.
 */
export async function submitVerificationEntry(
  _prevState: EntryFormState,
  formData: FormData
): Promise<EntryFormState> {
  const ctx = await requireFirmContext();
  const db = getDb();

  let parsed;
  try {
    parsed = parseVerificationEntryFormData(formData);
    await verifyPractitionerAndTool(db, ctx.firmId, parsed.practitionerId, parsed.aiToolId);
  } catch (error) {
    return toActionErrorState(error);
  }

  const eligibleReviewers = await getEligibleNextReviewers(db, ctx.firmId, ctx.reviewLevel, [
    ctx.userId,
    parsed.practitionerId,
  ]);

  if (eligibleReviewers.length === 0) {
    return {
      message:
        "No one is available to review this — you're already at the firm's top review level, or nobody else qualifies. Ask a firm admin to check review levels under Settings > Members.",
    };
  }

  const assignee = eligibleReviewers.find((r) => r.id === parsed.assignToId);
  if (!assignee) {
    return { message: "Select who to send this to for review", field: "assignToId" };
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
