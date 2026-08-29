import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { getEligibleNextReviewers } from "@/lib/verification/review-chain";
import { CHECKLIST_ITEMS, type ChecklistItemsReviewed } from "@/lib/verification/checklist-definitions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CheckIcon, XIcon } from "lucide-react";
import { toDatetimeLocal } from "@/lib/verification/format-datetime";
import { EntryForm } from "../../entry-form";
import { decideSubmission, resubmitVerificationEntry } from "../actions";
import { ActionToast } from "@/components/action-toast";

const STATUS_VARIANT: Record<string, "info" | "success" | "destructive"> = {
  pending: "info",
  approved: "success",
  rejected: "destructive",
};

const REVIEW_ACTION_LABEL: Record<string, string> = {
  forwarded: "Forwarded",
  approved: "Approved",
  rejected: "Rejected",
};

export default async function PendingSubmissionDetailPage(props: PageProps<"/verification/pending/[id]">) {
  const { id } = await props.params;
  const ctx = await requireFirmContext();
  const db = getDb();
  const assignees = alias(schema.users, "assignees");

  const [submission] = await db
    .select({
      id: schema.verificationSubmissions.id,
      firmId: schema.verificationSubmissions.firmId,
      status: schema.verificationSubmissions.status,
      practitionerId: schema.verificationSubmissions.practitionerId,
      aiToolId: schema.verificationSubmissions.aiToolId,
      taskCategory: schema.verificationSubmissions.taskCategory,
      clientReference: schema.verificationSubmissions.clientReference,
      checklistItemsReviewed: schema.verificationSubmissions.checklistItemsReviewed,
      assumptionsNoted: schema.verificationSubmissions.assumptionsNoted,
      evidenceLocation: schema.verificationSubmissions.evidenceLocation,
      documentReference: schema.verificationSubmissions.documentReference,
      outcome: schema.verificationSubmissions.outcome,
      flagReason: schema.verificationSubmissions.flagReason,
      aiOutputGeneratedAt: schema.verificationSubmissions.aiOutputGeneratedAt,
      reviewCompletedAt: schema.verificationSubmissions.reviewCompletedAt,
      deliveredToClientAt: schema.verificationSubmissions.deliveredToClientAt,
      reviewerRole: schema.verificationSubmissions.reviewerRole,
      submittedBy: schema.verificationSubmissions.submittedBy,
      submittedAt: schema.verificationSubmissions.submittedAt,
      currentAssigneeId: schema.verificationSubmissions.currentAssigneeId,
      currentAssigneeName: assignees.fullName,
      currentAssigneeEmail: assignees.email,
      decidedAt: schema.verificationSubmissions.decidedAt,
      decisionNotes: schema.verificationSubmissions.decisionNotes,
      verificationLogId: schema.verificationSubmissions.verificationLogId,
      toolName: schema.aiToolRegister.toolName,
      practitionerName: schema.users.fullName,
    })
    .from(schema.verificationSubmissions)
    .innerJoin(schema.aiToolRegister, eq(schema.verificationSubmissions.aiToolId, schema.aiToolRegister.id))
    .innerJoin(schema.users, eq(schema.verificationSubmissions.practitionerId, schema.users.id))
    .innerJoin(assignees, eq(schema.verificationSubmissions.currentAssigneeId, assignees.id))
    .where(and(eq(schema.verificationSubmissions.id, id), eq(schema.verificationSubmissions.firmId, ctx.firmId)))
    .limit(1);

  if (!submission) {
    notFound();
  }

  const checklist = submission.checklistItemsReviewed as ChecklistItemsReviewed;
  // Assignment excludes the submitter/practitioner going forward (see getEligibleNextReviewers),
  // but this defensive check still matters for submissions from before assignment tracking
  // existed, where current_assignee_id was backfilled to submitted_by with no one else to pick.
  const selfConflicted = submission.submittedBy === ctx.userId || submission.practitionerId === ctx.userId;
  const canDecide = submission.status === "pending" && ctx.userId === submission.currentAssigneeId && !selfConflicted;
  const canResubmit = submission.status === "rejected" && submission.submittedBy === ctx.userId;

  const [reviewSteps, eligibleNextForDecision, eligibleNextForResubmit] = await Promise.all([
    db
      .select({
        id: schema.verificationSubmissionReviews.id,
        reviewerId: schema.verificationSubmissionReviews.reviewerId,
        reviewerLevel: schema.verificationSubmissionReviews.reviewerLevel,
        action: schema.verificationSubmissionReviews.action,
        notes: schema.verificationSubmissionReviews.notes,
        createdAt: schema.verificationSubmissionReviews.createdAt,
        reviewerName: schema.users.fullName,
        reviewerEmail: schema.users.email,
      })
      .from(schema.verificationSubmissionReviews)
      .innerJoin(schema.users, eq(schema.verificationSubmissionReviews.reviewerId, schema.users.id))
      .where(eq(schema.verificationSubmissionReviews.submissionId, submission.id))
      .orderBy(asc(schema.verificationSubmissionReviews.createdAt)),
    canDecide
      ? getEligibleNextReviewers(db, ctx.firmId, ctx.reviewLevel, [submission.submittedBy, submission.practitionerId])
      : Promise.resolve([]),
    canResubmit
      ? getEligibleNextReviewers(db, ctx.firmId, ctx.reviewLevel, [ctx.userId, submission.practitionerId])
      : Promise.resolve([]),
  ]);

  let resubmitOptions: {
    users: Array<{ id: string; fullName: string | null; email: string }>;
    tools: Array<{ id: string; toolName: string; status: string }>;
  } | null = null;
  if (canResubmit) {
    const [users, tools] = await Promise.all([
      db.select().from(schema.users).where(eq(schema.users.firmId, ctx.firmId)),
      db.select().from(schema.aiToolRegister).where(eq(schema.aiToolRegister.firmId, ctx.firmId)),
    ]);
    resubmitOptions = { users, tools };
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ActionToast
        outcomes={[
          {
            param: "submitted",
            message: "Submitted",
            description: "Waiting on an independent reviewer.",
            tone: "info",
            celebrate: true,
          },
          { param: "resubmitted", message: "Resubmitted", description: "Back in the review queue.", tone: "info" },
        ]}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Submission review</h1>
        <Badge variant={STATUS_VARIANT[submission.status] ?? "secondary"}>{submission.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Practitioner" value={submission.practitionerName ?? "—"} />
          {submission.clientReference && <Row label="Client / engagement" value={submission.clientReference} />}
          <Row label="AI tool" value={submission.toolName} />
          <Row label="Task category" value={submission.taskCategory.replace(/_/g, " ")} />
          <Row label="Reviewer role" value={submission.reviewerRole.replace("_", " ")} />
          <Row label="Outcome" value={<Badge>{submission.outcome}</Badge>} />
          {submission.flagReason && <Row label="Flag reason" value={submission.flagReason} />}
          {submission.assumptionsNoted && <Row label="Assumptions noted" value={submission.assumptionsNoted} />}
          {submission.evidenceLocation && <Row label="Evidence location" value={submission.evidenceLocation} />}
          {submission.documentReference && <Row label="Document reference" value={submission.documentReference} />}
          <Row label="AI output generated" value={submission.aiOutputGeneratedAt.toLocaleString()} />
          <Row label="Review completed" value={submission.reviewCompletedAt.toLocaleString()} />
          {submission.deliveredToClientAt && (
            <Row label="Delivered to client" value={submission.deliveredToClientAt.toLocaleString()} />
          )}
          <Row label="Submitted" value={submission.submittedAt.toLocaleString()} />
          {submission.status === "pending" && (
            <Row
              label="Currently with"
              value={submission.currentAssigneeName ?? submission.currentAssigneeEmail}
            />
          )}
          {submission.decidedAt && <Row label="Decided" value={submission.decidedAt.toLocaleString()} />}
          {submission.decisionNotes && <Row label="Decision notes" value={submission.decisionNotes} />}
          {submission.verificationLogId && (
            <Row
              label="Permanent entry"
              value={
                <Link href={`/verification/${submission.verificationLogId}`} className="underline underline-offset-4">
                  View
                </Link>
              }
            />
          )}
        </CardContent>
      </Card>

      {reviewSteps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {reviewSteps.map((step) => (
              <div key={step.id} className="space-y-0.5 border-b pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {REVIEW_ACTION_LABEL[step.action] ?? step.action} by {step.reviewerName ?? step.reviewerEmail}
                    <span className="ml-1.5 font-normal text-muted-foreground">(Level {step.reviewerLevel})</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{step.createdAt.toLocaleString()}</span>
                </div>
                {step.notes && <p className="text-muted-foreground">{step.notes}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {CHECKLIST_ITEMS.map((item) => (
            <div key={item.key} className="flex items-center gap-2 text-sm">
              {checklist[item.key] ? (
                <CheckIcon className="size-4 text-primary" />
              ) : (
                <XIcon className="size-4 text-muted-foreground" />
              )}
              {item.label}
            </div>
          ))}
        </CardContent>
      </Card>

      {submission.status === "pending" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Decision</CardTitle>
          </CardHeader>
          <CardContent>
            {canDecide ? (
              <form action={decideSubmission} className="space-y-3">
                <input type="hidden" name="submissionId" value={submission.id} />
                {eligibleNextForDecision.length > 0 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="nextAssigneeId">Forward to</Label>
                    <Select
                      name="nextAssigneeId"
                      items={eligibleNextForDecision.map((r) => ({
                        value: r.id,
                        label: `${r.fullName ?? r.email} (Level ${r.reviewLevel})`,
                      }))}
                    >
                      <SelectTrigger id="nextAssigneeId" className="w-full">
                        <SelectValue placeholder="Select next reviewer" />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleNextForDecision.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.fullName ?? r.email} (Level {r.reviewLevel})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Textarea name="decisionNotes" rows={3} placeholder="Required if rejecting, optional otherwise" />
                <div className="flex gap-2">
                  {eligibleNextForDecision.length > 0 ? (
                    <Button type="submit" name="decision" value="forward">
                      Forward
                    </Button>
                  ) : (
                    <Button type="submit" name="decision" value="approved">
                      Approve
                    </Button>
                  )}
                  <Button type="submit" name="decision" value="rejected" variant="destructive">
                    Reject
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                {selfConflicted
                  ? "You submitted this entry (or are the practitioner named on it), so you can't also be the one who approves it."
                  : "This isn't currently assigned to you — only the person it's assigned to can act on it."}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {canResubmit && resubmitOptions && (
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Edit and resubmit</h2>
          <EntryForm
            action={resubmitVerificationEntry}
            users={resubmitOptions.users}
            tools={resubmitOptions.tools}
            eligibleReviewers={eligibleNextForResubmit}
            submissionId={submission.id}
            submitLabel="Resubmit for review"
            defaultValues={{
              practitionerId: submission.practitionerId,
              reviewerRole: submission.reviewerRole,
              clientReference: submission.clientReference ?? undefined,
              aiToolId: submission.aiToolId,
              taskCategory: submission.taskCategory,
              evidenceLocation: submission.evidenceLocation ?? undefined,
              documentReference: submission.documentReference ?? undefined,
              checklistItemsReviewed: checklist,
              assumptionsNoted: submission.assumptionsNoted ?? undefined,
              aiOutputGeneratedAt: toDatetimeLocal(submission.aiOutputGeneratedAt),
              reviewCompletedAt: toDatetimeLocal(submission.reviewCompletedAt),
              deliveredToClientAt: submission.deliveredToClientAt
                ? toDatetimeLocal(submission.deliveredToClientAt)
                : undefined,
              outcome: submission.outcome,
              flagReason: submission.flagReason ?? undefined,
            }}
          />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
