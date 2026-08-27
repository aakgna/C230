import { z } from "zod";
import { CHECKLIST_ITEMS } from "@/lib/verification/checklist-definitions";

export const toolStatusValues = ["approved", "under_review", "prohibited"] as const;

// Comma-separated hostnames from a form field, normalized to bare lowercase domains
// (matches what the browser extension reports via `new URL(url).hostname`).
export function parseDomainsInput(raw: string | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
        .filter(Boolean)
    ),
  ];
}

export const updateToolStatusSchema = z.object({
  toolId: z.uuid(),
  status: z.enum(toolStatusValues),
  vettingNotes: z.string().trim().max(4000).optional(),
  domains: z.string().trim().max(500).optional(),
});

export const addCustomToolSchema = z.object({
  toolName: z.string().trim().min(1).max(200),
  vettingNotes: z.string().trim().max(4000).optional(),
  domains: z.string().trim().max(500).optional(),
});

export const taskCategoryValues = [
  "return_prep",
  "research_memo",
  "client_correspondence",
  "written_advice",
  "other",
] as const;

export const verificationOutcomeValues = ["approved", "flagged", "escalated", "rejected"] as const;

export const reviewerRoleValues = ["preparer", "reviewing_partner", "ea", "other"] as const;

const isoDatetimeLocal = z
  .string()
  .min(1, "Required")
  .transform((val, ctx) => {
    const date = new Date(val);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date/time" });
      return z.NEVER;
    }
    return date;
  });

export const createVerificationEntrySchema = z
  .object({
    practitionerId: z.uuid(),
    aiToolId: z.uuid(),
    taskCategory: z.enum(taskCategoryValues),
    clientReference: z.string().trim().max(300).optional(),
    evidenceLocation: z.string().trim().max(2000).optional(),
    checklistItemsReviewed: z.object(
      Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item.key, z.boolean()])) as Record<
        (typeof CHECKLIST_ITEMS)[number]["key"],
        z.ZodBoolean
      >
    ),
    assumptionsNoted: z.string().trim().max(2000).optional(),
    outcome: z.enum(verificationOutcomeValues),
    flagReason: z.string().trim().max(4000).optional(),
    aiOutputGeneratedAt: isoDatetimeLocal,
    reviewCompletedAt: isoDatetimeLocal,
    deliveredToClientAt: isoDatetimeLocal.optional(),
    reviewerRole: z.enum(reviewerRoleValues),
  })
  .refine((data) => data.outcome !== "flagged" || !!data.flagReason, {
    message: "Flag reason is required when outcome is 'flagged'",
    path: ["flagReason"],
  })
  .refine((data) => data.reviewCompletedAt >= data.aiOutputGeneratedAt, {
    message: "Review completion must be at or after AI output generation",
    path: ["reviewCompletedAt"],
  })
  .refine((data) => !data.deliveredToClientAt || data.deliveredToClientAt >= data.reviewCompletedAt, {
    message: "Delivery must be at or after review completion",
    path: ["deliveredToClientAt"],
  });

export const decisionValues = ["approved", "rejected"] as const;

export const decideSubmissionSchema = z
  .object({
    submissionId: z.uuid(),
    decision: z.enum(decisionValues),
    decisionNotes: z.string().trim().max(4000).optional(),
  })
  .refine((data) => data.decision !== "rejected" || !!data.decisionNotes, {
    message: "Notes are required when rejecting a submission",
    path: ["decisionNotes"],
  });

export const appRoleValues = ["firm_admin", "practitioner"] as const;

export const updateMemberSchema = z.object({
  userId: z.uuid(),
  appRole: z.enum(appRoleValues),
  isLogReviewer: z.boolean(),
});

export const transferOwnershipSchema = z.object({
  newOwnerId: z.uuid(),
});

export const clientDataSensitivityValues = ["low", "moderate", "high"] as const;

export const practiceMixValues = ["individual", "business", "estate"] as const;

export const policyIntakeSchema = z.object({
  firmSize: z.coerce.number().int().min(1).max(500),
  aiToolIds: z.array(z.uuid()).default([]),
  clientDataSensitivity: z.enum(clientDataSensitivityValues),
  practiceMix: z.array(z.enum(practiceMixValues)).min(1, "Select at least one practice area"),
});

export type PolicyIntake = z.infer<typeof policyIntakeSchema>;

// Simplified intake for the public, anonymous policy-generator preview — no
// firm size or tool register (there's no firm yet to scope those to).
export const previewPolicyIntakeSchema = z.object({
  clientDataSensitivity: z.enum(clientDataSensitivityValues),
  practiceMix: z.array(z.enum(practiceMixValues)).min(1, "Select at least one practice area"),
});
