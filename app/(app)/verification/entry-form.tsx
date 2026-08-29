"use client";

import { useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CHECKLIST_ITEMS, type ChecklistItemsReviewed } from "@/lib/verification/checklist-definitions";
import { taskCategoryValues, verificationOutcomeValues, reviewerRoleValues } from "@/lib/validation/schemas";
import type { EntryFormState } from "./entry-helpers";

type EntryFormDefaultValues = {
  practitionerId?: string;
  reviewerRole?: string;
  clientReference?: string;
  aiToolId?: string;
  taskCategory?: string;
  evidenceLocation?: string;
  documentReference?: string;
  assignToId?: string;
  checklistItemsReviewed?: ChecklistItemsReviewed;
  assumptionsNoted?: string;
  aiOutputGeneratedAt: string;
  reviewCompletedAt: string;
  deliveredToClientAt?: string;
  outcome?: string;
  flagReason?: string;
};

/**
 * Shared by the fresh-submission form (verification/new) and the edit-and-resubmit form
 * (verification/pending/[id], when viewed by its own submitter after rejection) — same content
 * shape either way, just a different action and starting values.
 */
export function EntryForm({
  action,
  users,
  tools,
  eligibleReviewers,
  defaultValues,
  submissionId,
  submitLabel = "Submit for review",
  helperText = "This needs approval from a reviewer other than you before it becomes part of the permanent record.",
}: {
  action: (prevState: EntryFormState, formData: FormData) => Promise<EntryFormState>;
  users: Array<{ id: string; fullName: string | null; email: string }>;
  tools: Array<{ id: string; toolName: string; status: string }>;
  // Whoever's one review level above the submitter — empty means the submitter is already the
  // firm's top level, so no "assign to" field is shown at all (see lib/verification/review-chain.ts).
  eligibleReviewers: Array<{ id: string; fullName: string | null; email: string; reviewLevel: number }>;
  defaultValues: EntryFormDefaultValues;
  submissionId?: string;
  submitLabel?: string;
  helperText?: string;
}) {
  const checklist = defaultValues.checklistItemsReviewed;
  const [state, formAction, pending] = useActionState(action, null);
  // Renders right under the specific input that caused it, not just as a banner at the bottom —
  // with ~15 fields on this form, "Delivery must be at or after review completion" is much more
  // useful sitting next to "Delivered to client at" than floating disconnected near the button.
  const fieldError = (name: string) => (state?.field === name ? state.message : undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Review details</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-5">
          {submissionId && <input type="hidden" name="submissionId" value={submissionId} />}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="practitionerId">Practitioner</Label>
              <Select
                name="practitionerId"
                required
                defaultValue={defaultValues.practitionerId}
                items={users.map((u) => ({ value: u.id, label: u.fullName ?? u.email }))}
              >
                <SelectTrigger id="practitionerId" className="w-full">
                  <SelectValue placeholder="Select practitioner" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName ?? u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reviewerRole">Reviewer role</Label>
              <Select name="reviewerRole" required defaultValue={defaultValues.reviewerRole}>
                <SelectTrigger id="reviewerRole" className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {reviewerRoleValues.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="clientReference">Client / engagement reference (optional)</Label>
            <Input
              id="clientReference"
              name="clientReference"
              maxLength={300}
              defaultValue={defaultValues.clientReference ?? ""}
              placeholder="Client name, return ID, or matter number"
            />
            <p className="text-xs text-muted-foreground">
              Without it, this entry can&apos;t be found again if asked about a specific client&apos;s return.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="evidenceLocation">Evidence location (optional)</Label>
              <Input
                id="evidenceLocation"
                name="evidenceLocation"
                maxLength={2000}
                defaultValue={defaultValues.evidenceLocation ?? ""}
                placeholder="Chat URL, or a path/link into your firm's own file storage"
              />
              <p className="text-xs text-muted-foreground">
                A pointer to the AI transcript — this app doesn&apos;t store the transcript itself. Auto-filled from the
                browser extension.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="documentReference">Document reference (optional)</Label>
              <Input
                id="documentReference"
                name="documentReference"
                maxLength={300}
                defaultValue={defaultValues.documentReference ?? ""}
                placeholder="Whatever your firm calls this file — DMS ID, filename, etc."
              />
              <p className="text-xs text-muted-foreground">
                Free text — your firm&apos;s own naming/filing convention, so this entry is easy to look up on your end.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="aiToolId">AI tool used</Label>
              <Select
                name="aiToolId"
                required
                defaultValue={defaultValues.aiToolId}
                items={tools.map((tool) => ({
                  value: tool.id,
                  label: `${tool.toolName}${
                    tool.status === "prohibited"
                      ? " (prohibited — do not use)"
                      : tool.status === "under_review"
                        ? " (under review)"
                        : ""
                  }`,
                }))}
              >
                <SelectTrigger id="aiToolId" className="w-full">
                  <SelectValue placeholder="Select tool" />
                </SelectTrigger>
                <SelectContent>
                  {tools.map((tool) => (
                    <SelectItem key={tool.id} value={tool.id}>
                      {tool.toolName}
                      {tool.status === "prohibited" ? " (prohibited — do not use)" : ""}
                      {tool.status === "under_review" ? " (under review)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="taskCategory">Task category</Label>
              <Select name="taskCategory" required defaultValue={defaultValues.taskCategory}>
                <SelectTrigger id="taskCategory" className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {taskCategoryValues.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {eligibleReviewers.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="assignToId">Assign to</Label>
              <Select
                name="assignToId"
                required
                defaultValue={defaultValues.assignToId}
                items={eligibleReviewers.map((r) => ({
                  value: r.id,
                  label: `${r.fullName ?? r.email} (Level ${r.reviewLevel})`,
                }))}
              >
                <SelectTrigger id="assignToId" className="w-full">
                  <SelectValue placeholder="Select reviewer" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleReviewers.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.fullName ?? r.email} (Level {r.reviewLevel})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldError("assignToId") ? (
                <p className="text-xs text-destructive" role="alert">
                  {fieldError("assignToId")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Anyone at a higher review level — not necessarily the next tier up. They&apos;ll see this in their
                  &quot;Needs your review&quot; list.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Checklist reviewed</Label>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border p-3">
              {CHECKLIST_ITEMS.map((item) => (
                <label key={item.key} className="flex items-center gap-2 text-sm">
                  <Checkbox name={item.key} defaultChecked={checklist?.[item.key]} />
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="aiOutputGeneratedAt">AI output generated at</Label>
              <Input
                type="datetime-local"
                id="aiOutputGeneratedAt"
                name="aiOutputGeneratedAt"
                defaultValue={defaultValues.aiOutputGeneratedAt}
                required
              />
              {fieldError("aiOutputGeneratedAt") && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldError("aiOutputGeneratedAt")}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reviewCompletedAt">Review completed at</Label>
              <Input
                type="datetime-local"
                id="reviewCompletedAt"
                name="reviewCompletedAt"
                defaultValue={defaultValues.reviewCompletedAt}
                required
              />
              {fieldError("reviewCompletedAt") && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldError("reviewCompletedAt")}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="outcome">Outcome</Label>
              <Select name="outcome" required defaultValue={defaultValues.outcome}>
                <SelectTrigger id="outcome" className="w-full">
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  {verificationOutcomeValues.map((outcome) => (
                    <SelectItem key={outcome} value={outcome}>
                      {outcome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="deliveredToClientAt">Delivered to client at (optional)</Label>
              <Input
                type="datetime-local"
                id="deliveredToClientAt"
                name="deliveredToClientAt"
                defaultValue={defaultValues.deliveredToClientAt ?? ""}
              />
              {fieldError("deliveredToClientAt") && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldError("deliveredToClientAt")}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="assumptionsNoted">Assumptions the AI made (optional)</Label>
              <Textarea
                id="assumptionsNoted"
                name="assumptionsNoted"
                rows={3}
                defaultValue={defaultValues.assumptionsNoted ?? ""}
                placeholder="Any factual/legal assumptions in the AI output, and whether you verified, revised, or removed them"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="flagReason">Flag reason (required if outcome is &quot;flagged&quot;)</Label>
              <Textarea id="flagReason" name="flagReason" rows={3} defaultValue={defaultValues.flagReason ?? ""} />
              {fieldError("flagReason") && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldError("flagReason")}
                </p>
              )}
            </div>
          </div>

          {state?.message && !state.field && (
            <p className="text-sm text-destructive" role="alert">
              {state.message}
            </p>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? "Submitting…" : submitLabel}
          </Button>
          <p className="text-xs text-muted-foreground">{helperText}</p>
        </form>
      </CardContent>
    </Card>
  );
}
