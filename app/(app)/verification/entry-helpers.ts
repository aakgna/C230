import "server-only";
import { ZodError } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { CHECKLIST_ITEMS, type ChecklistItemsReviewed } from "@/lib/verification/checklist-definitions";
import { createVerificationEntrySchema } from "@/lib/validation/schemas";

// Passed to useActionState in entry-form.tsx (a Client Component, hence type-only import there —
// the "server-only" guard above only fires on a runtime import, so the type erases cleanly).
// `field` is a form field name (matches an <input>/<select> "name") when the error traces back
// to one specific input — entry-form.tsx renders the message right under that field instead of
// as a generic banner, so it's obvious which of the ~15 fields on this form needs fixing.
export type EntryFormState = { message: string; field?: string } | null;

/**
 * Form submission failures (bad dates, no eligible reviewer, etc.) are expected errors, not
 * bugs — per Next.js's own guidance they should be modeled as returned state via useActionState,
 * not thrown, so a mistake doesn't nuke the whole filled-in form back to a generic error page.
 * Picks the first Zod issue and its field path (already written to be human-readable, e.g.
 * "Delivery must be at or after review completion") rather than surfacing the raw JSON-array
 * error text. A refine()'s path is always the field named in its `path` option (see
 * lib/validation/schemas.ts) — object-level refinements without one just get shown generically.
 */
export function toActionErrorState(error: unknown): EntryFormState {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    if (!issue) return { message: "Some of the information provided wasn't valid." };
    return { message: issue.message, field: typeof issue.path[0] === "string" ? issue.path[0] : undefined };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: "Something went wrong. Please try again." };
}

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
    documentReference: formData.get("documentReference") || undefined,
    assignToId: formData.get("assignToId") || undefined,
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
