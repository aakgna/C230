"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getPoolDb } from "@/lib/db/pool";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { requireCurrentAssignee, requireIndependentReviewer } from "@/lib/auth/rbac";
import { appendVerificationEntry } from "@/lib/verification/hash-chain";
import { getEligibleNextReviewers } from "@/lib/verification/review-chain";
import type { ChecklistItemsReviewed } from "@/lib/verification/checklist-definitions";
import { decideSubmissionSchema } from "@/lib/validation/schemas";
import {
  parseVerificationEntryFormData,
  verifyPractitionerAndTool,
  toActionErrorState,
  type EntryFormState,
} from "../entry-helpers";

/**
 * Acts on a submission currently assigned to the caller: forward it up one review level,
 * approve it (only reachable once there's no one left above the caller — this is what actually
 * calls the existing appendVerificationEntry(), same as every finalized entry has always gone
 * through), or reject it back to the original submitter. Every action writes a
 * verificationSubmissionReviews row, since verificationSubmissions' own decidedBy/decidedAt/
 * decisionNotes only ever reflect the terminal (approve/reject) action — a mid-chain forward's
 * notes would otherwise be silently lost the moment the next person acts.
 */
export async function decideSubmission(formData: FormData) {
  const ctx = await requireFirmContext();

  const parsed = decideSubmissionSchema.parse({
    submissionId: formData.get("submissionId"),
    decision: formData.get("decision"),
    decisionNotes: formData.get("decisionNotes") || undefined,
    nextAssigneeId: formData.get("nextAssigneeId") || undefined,
  });

  // A real transaction (interactive BEGIN/COMMIT) is needed here — updating the submission and
  // recording the review step must be atomic, same reasoning as appendVerificationEntry's own
  // use of the pool driver. getDb()'s HTTP driver can't do this (see lib/db/pool.ts).
  const db = getPoolDb();

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

  requireCurrentAssignee(ctx, submission, "decide a verification submission");
  requireIndependentReviewer(
    ctx,
    { submittedBy: submission.submittedBy, practitionerId: submission.practitionerId },
    "decide this verification submission"
  );

  const decisionNotes = parsed.decisionNotes ?? null;

  if (parsed.decision === "rejected") {
    const decidedAt = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(schema.verificationSubmissions)
        .set({
          status: "rejected",
          currentAssigneeId: submission.submittedBy,
          decidedBy: ctx.userId,
          decidedAt,
          decisionNotes,
          updatedAt: decidedAt,
        })
        .where(eq(schema.verificationSubmissions.id, submission.id));

      await tx.insert(schema.verificationSubmissionReviews).values({
        submissionId: submission.id,
        reviewerId: ctx.userId,
        reviewerLevel: ctx.reviewLevel,
        action: "rejected",
        notes: decisionNotes,
      });
    });

    revalidatePath("/verification/pending");
    redirect("/verification/pending?rejected=1");
  }

  // Both "forward" and "approved" need to know whether the caller has anyone above them —
  // "approved" (final) is only reachable when they don't; "forward" needs a valid next assignee
  // when they do. Excludes the submitter and named practitioner, same as at submission time.
  const eligibleReviewers = await getEligibleNextReviewers(db, ctx.firmId, ctx.reviewLevel, [
    submission.submittedBy,
    submission.practitionerId,
  ]);

  if (parsed.decision === "forward") {
    if (eligibleReviewers.length === 0) {
      throw new Error("You're already the top review level for this submission — approve or reject it instead.");
    }
    const nextAssignee = eligibleReviewers.find((r) => r.id === parsed.nextAssigneeId);
    if (!nextAssignee) {
      throw new Error("Select who to forward this to");
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.verificationSubmissions)
        .set({ currentAssigneeId: nextAssignee.id, updatedAt: new Date() })
        .where(eq(schema.verificationSubmissions.id, submission.id));

      await tx.insert(schema.verificationSubmissionReviews).values({
        submissionId: submission.id,
        reviewerId: ctx.userId,
        reviewerLevel: ctx.reviewLevel,
        action: "forwarded",
        notes: decisionNotes,
        forwardedToId: nextAssignee.id,
      });
    });

    revalidatePath("/verification/pending");
    redirect("/verification/pending?forwarded=1");
  }

  // decision === "approved"
  if (eligibleReviewers.length > 0) {
    throw new Error("Someone above you in the review chain still needs to see this — forward it instead of approving.");
  }

  const decidedAt = new Date();
  const entry = await appendVerificationEntry({
    firmId: submission.firmId,
    practitionerId: submission.practitionerId,
    aiToolId: submission.aiToolId,
    taskCategory: submission.taskCategory,
    clientReference: submission.clientReference,
    checklistItemsReviewed: submission.checklistItemsReviewed as ChecklistItemsReviewed,
    assumptionsNoted: submission.assumptionsNoted,
    evidenceLocation: submission.evidenceLocation,
    documentReference: submission.documentReference,
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

  await db.transaction(async (tx) => {
    await tx
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

    await tx.insert(schema.verificationSubmissionReviews).values({
      submissionId: submission.id,
      reviewerId: ctx.userId,
      reviewerLevel: ctx.reviewLevel,
      action: "approved",
      notes: decisionNotes,
    });
  });

  revalidatePath("/verification/pending");
  redirect(`/verification/${entry.id}?approved=1`);
}

/**
 * Only the original submitter, only on a rejected submission — editing a submission that's
 * still pending review isn't supported (it would confuse an in-progress review). Restarts the
 * chain from the beginning: the submitter picks a next-assignee again, same as a fresh
 * submission — their own review level hasn't changed, so this is the same eligible-reviewers
 * lookup either way.
 */
export async function resubmitVerificationEntry(
  _prevState: EntryFormState,
  formData: FormData
): Promise<EntryFormState> {
  const ctx = await requireFirmContext();

  const submissionId = formData.get("submissionId");
  if (typeof submissionId !== "string") {
    return { message: "Missing submissionId" };
  }

  const db = getDb();

  let parsed;
  let resolvedAiToolId: string;
  try {
    parsed = parseVerificationEntryFormData(formData);
    resolvedAiToolId = await verifyPractitionerAndTool(
      db,
      ctx.firmId,
      ctx.userId,
      parsed.practitionerId,
      parsed.aiToolId,
      parsed.otherToolName,
      parsed.detectedDomain
    );
  } catch (error) {
    return toActionErrorState(error);
  }

  const eligibleReviewers = await getEligibleNextReviewers(db, ctx.firmId, ctx.reviewLevel, [
    ctx.userId,
    parsed.practitionerId,
  ]);
  const assignee = eligibleReviewers.find((r) => r.id === parsed.assignToId);
  if (!assignee) {
    return { message: "Select who to send this to for review", field: "assignToId" };
  }

  const result = await db
    .update(schema.verificationSubmissions)
    .set({
      practitionerId: parsed.practitionerId,
      aiToolId: resolvedAiToolId,
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
      currentAssigneeId: assignee.id,
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
    return { message: "Submission not found, not yours, or not rejected" };
  }

  revalidatePath("/verification/pending");
  redirect(`/verification/pending/${submissionId}?resubmitted=1`);
}
