// Single source of truth for the verification-log checklist. The UI, the Zod
// schema, and the jsonb shape stored in verification_log.checklist_items_reviewed
// are all derived from this so they can never drift apart.
export const CHECKLIST_ITEMS = [
  { key: "citations_verified", label: "Citations verified against primary source" },
  { key: "calculations_spot_checked", label: "Calculations spot-checked" },
  { key: "superseded_law_check", label: "Checked for superseded law/regulation changes" },
  { key: "client_facts_confirmed", label: "Client-specific facts confirmed accurate" },
  { key: "output_reviewed_in_full", label: "AI output reviewed in full (not skimmed)" },
  { key: "client_consent_confirmed", label: "Client consent for AI use on this data confirmed (IRC §7216)" },
] as const;

export type ChecklistKey = (typeof CHECKLIST_ITEMS)[number]["key"];

export type ChecklistItemsReviewed = Record<ChecklistKey, boolean>;

export function emptyChecklist(): ChecklistItemsReviewed {
  return Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item.key, false])) as ChecklistItemsReviewed;
}
