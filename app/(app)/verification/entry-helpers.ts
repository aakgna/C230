import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { CHECKLIST_ITEMS, type ChecklistItemsReviewed } from "@/lib/verification/checklist-definitions";
import { createVerificationEntrySchema } from "@/lib/validation/schemas";

/**
 * Shared by submitVerificationEntry (verification/actions.ts) and resubmitVerificationEntry
 * (verification/pending/actions.ts) — both forms have the identical content shape. Deliberately
 * NOT in either "use server" actions file: every export from a "use server" file must be an
 * async Server Action, and this is a plain synchronous parsing helper, not one.
 */
export function parseVerificationEntryFormData(formData: FormData) {
  // A checked checkbox is present in FormData (value defaults to "on" but we
  // don't rely on the exact string); an unchecked one is simply absent.
  const checklistItemsReviewed = Object.fromEntries(
    CHECKLIST_ITEMS.map((item) => [item.key, formData.get(item.key) !== null])
  ) as ChecklistItemsReviewed;

  return createVerificationEntrySchema.parse({
    practitionerId: formData.get("practitionerId"),
    aiToolId: formData.get("aiToolId"),
    taskCategory: formData.get("taskCategory"),
    clientReference: formData.get("clientReference") || undefined,
    checklistItemsReviewed,
    assumptionsNoted: formData.get("assumptionsNoted") || undefined,
    evidenceLocation: formData.get("evidenceLocation") || undefined,
    outcome: formData.get("outcome"),
    flagReason: formData.get("flagReason") || undefined,
    aiOutputGeneratedAt: formData.get("aiOutputGeneratedAt"),
    reviewCompletedAt: formData.get("reviewCompletedAt"),
    deliveredToClientAt: formData.get("deliveredToClientAt") || undefined,
    reviewerRole: formData.get("reviewerRole"),
  });
}

/**
 * The practitioner/tool dropdowns are rendered from this firm's own data, but a client could
 * still tamper with the submitted ids — re-check both actually belong to this firm before
 * writing a submission. Shared by submit and resubmit.
 */
export async function verifyPractitionerAndTool(
  db: ReturnType<typeof getDb>,
  firmId: string,
  practitionerId: string,
  aiToolId: string
) {
  const [practitioner] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, practitionerId), eq(schema.users.firmId, firmId)))
    .limit(1);
  if (!practitioner) {
    throw new Error("Practitioner not found for this firm");
  }

  const [tool] = await db
    .select({ id: schema.aiToolRegister.id })
    .from(schema.aiToolRegister)
    .where(and(eq(schema.aiToolRegister.id, aiToolId), eq(schema.aiToolRegister.firmId, firmId)))
    .limit(1);
  if (!tool) {
    throw new Error("Tool not found for this firm");
  }
}
