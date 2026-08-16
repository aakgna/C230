"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { appendVerificationEntry } from "@/lib/verification/hash-chain";
import { CHECKLIST_ITEMS, type ChecklistItemsReviewed } from "@/lib/verification/checklist-definitions";
import { createVerificationEntrySchema } from "@/lib/validation/schemas";

export async function createVerificationEntry(formData: FormData) {
  const ctx = await requireFirmContext();

  // A checked checkbox is present in FormData (value defaults to "on" but we
  // don't rely on the exact string); an unchecked one is simply absent.
  const checklistItemsReviewed = Object.fromEntries(
    CHECKLIST_ITEMS.map((item) => [item.key, formData.get(item.key) !== null])
  ) as ChecklistItemsReviewed;

  const parsed = createVerificationEntrySchema.parse({
    practitionerId: formData.get("practitionerId"),
    aiToolId: formData.get("aiToolId"),
    taskCategory: formData.get("taskCategory"),
    checklistItemsReviewed,
    outcome: formData.get("outcome"),
    flagReason: formData.get("flagReason") || undefined,
    aiOutputGeneratedAt: formData.get("aiOutputGeneratedAt"),
    reviewCompletedAt: formData.get("reviewCompletedAt"),
    deliveredToClientAt: formData.get("deliveredToClientAt") || undefined,
    reviewerRole: formData.get("reviewerRole"),
  });

  const db = getDb();

  // The practitioner and tool dropdowns are rendered from this firm's own
  // data, but a client could still tamper with the submitted ids — re-check
  // both actually belong to this firm before writing an immutable log entry.
  const [practitioner] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, parsed.practitionerId), eq(schema.users.firmId, ctx.firmId)))
    .limit(1);
  if (!practitioner) {
    throw new Error("Practitioner not found for this firm");
  }

  const [tool] = await db
    .select({ id: schema.aiToolRegister.id })
    .from(schema.aiToolRegister)
    .where(and(eq(schema.aiToolRegister.id, parsed.aiToolId), eq(schema.aiToolRegister.firmId, ctx.firmId)))
    .limit(1);
  if (!tool) {
    throw new Error("Tool not found for this firm");
  }

  const entry = await appendVerificationEntry({
    firmId: ctx.firmId,
    practitionerId: parsed.practitionerId,
    aiToolId: parsed.aiToolId,
    taskCategory: parsed.taskCategory,
    checklistItemsReviewed: parsed.checklistItemsReviewed,
    outcome: parsed.outcome,
    flagReason: parsed.flagReason ?? null,
    aiOutputGeneratedAt: parsed.aiOutputGeneratedAt,
    reviewCompletedAt: parsed.reviewCompletedAt,
    deliveredToClientAt: parsed.deliveredToClientAt ?? null,
    reviewerRole: parsed.reviewerRole,
    createdBy: ctx.userId,
  });

  redirect(`/verification/${entry.id}`);
}
