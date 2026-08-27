"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { requireLogReviewer, requireIndependentReviewer } from "@/lib/auth/rbac";
import { appendVerificationEntry } from "@/lib/verification/hash-chain";
import type { ChecklistItemsReviewed } from "@/lib/verification/checklist-definitions";
import { decideSubmissionSchema } from "@/lib/validation/schemas";
import { parseVerificationEntryFormData, verifyPractitionerAndTool } from "../entry-helpers";

/**
 * Approve or reject a pending submission. Approval calls the existing appendVerificationEntry()
 * as-is — the same function every finalized entry has always gone through — with createdBy set
 * to the original submitter (not the approver) so that field keeps meaning what it always has.
 */
export async function decideSubmission(formData: FormData) {
  const ctx = await requireFirmContext();

  const parsed = decideSubmissionSchema.parse({
    submissionId: formData.get("submissionId"),
    decision: formData.get("decision"),
    decisionNotes: formData.get("decisionNotes") || undefined,
  });

  const db = getDb();

  const [submission] = await db
    .select()
    .from(schema.verificationSubmissions)
    .where(
      and(
        eq(schema.verificationSubmissions.id, parsed.submissionId),
        eq(schema.verificationSubmissions.firmId, ctx.firmId),
        eq(schema.verificationSubmissions.status, "pending")
      )
    )
    .limit(1);

  if (!submission) {
    throw new Error("Submission not found, not pending, or already decided");
  }

  requireLogReviewer(ctx, "decide a verification submission");
  requireIndependentReviewer(
    ctx,
    { submittedBy: submission.submittedBy, practitionerId: submission.practitionerId },
    "decide this verification submission"
  );

  const decidedAt = new Date();
  const decisionNotes = parsed.decisionNotes ?? null;

  if (parsed.decision === "approved") {
    const entry = await appendVerificationEntry({
      firmId: submission.firmId,
      practitionerId: submission.practitionerId,
      aiToolId: submission.aiToolId,
      taskCategory: submission.taskCategory,
      clientReference: submission.clientReference,
      checklistItemsReviewed: submission.checklistItemsReviewed as ChecklistItemsReviewed,
      assumptionsNoted: submission.assumptionsNoted,
      evidenceLocation: submission.evidenceLocation,
      outcome: submission.outcome,
      flagReason: submission.flagReason,
      aiOutputGeneratedAt: submission.aiOutputGeneratedAt,
      reviewCompletedAt: submission.reviewCompletedAt,
      deliveredToClientAt: submission.deliveredToClientAt,
      reviewerRole: submission.reviewerRole,
      createdBy: submission.submittedBy,
      approvedBy: ctx.userId,
      approvedAt: decidedAt,
      submissionId: submission.id,
    });

    await db
      .update(schema.verificationSubmissions)
      .set({
        status: "approved",
        decidedBy: ctx.userId,
        decidedAt,
        decisionNotes,
        verificationLogId: entry.id,
        updatedAt: decidedAt,
      })
      .where(eq(schema.verificationSubmissions.id, submission.id));

    revalidatePath("/verification/pending");
    redirect(`/verification/${entry.id}`);
  }

  await db
    .update(schema.verificationSubmissions)
    .set({
      status: "rejected",
      decidedBy: ctx.userId,
      decidedAt,
      decisionNotes,
      updatedAt: decidedAt,
    })
    .where(eq(schema.verificationSubmissions.id, submission.id));

  revalidatePath("/verification/pending");
  redirect("/verification/pending");
}

/**
 * Only the original submitter, only on a rejected submission — editing a submission that's
 * still pending review isn't supported (it would confuse an in-progress review). Resets it
 * back to pending so it re-enters the queue.
 */
export async function resubmitVerificationEntry(formData: FormData) {
  const ctx = await requireFirmContext();

  const submissionId = formData.get("submissionId");
  if (typeof submissionId !== "string") {
    throw new Error("Missing submissionId");
  }

  const parsed = parseVerificationEntryFormData(formData);
  const db = getDb();

  await verifyPractitionerAndTool(db, ctx.firmId, parsed.practitionerId, parsed.aiToolId);

  const result = await db
    .update(schema.verificationSubmissions)
    .set({
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
      decidedBy: null,
      decidedAt: null,
      decisionNotes: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.verificationSubmissions.id, submissionId),
        eq(schema.verificationSubmissions.firmId, ctx.firmId),
        eq(schema.verificationSubmissions.submittedBy, ctx.userId),
        eq(schema.verificationSubmissions.status, "rejected")
      )
    )
    .returning({ id: schema.verificationSubmissions.id });

  if (result.length === 0) {
    throw new Error("Submission not found, not yours, or not rejected");
  }

  revalidatePath("/verification/pending");
  redirect(`/verification/pending/${submissionId}`);
}
