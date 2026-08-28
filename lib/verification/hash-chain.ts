import { createHash } from "node:crypto";
import { eq, asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getPoolDb } from "@/lib/db/pool";
import type { ChecklistItemsReviewed } from "./checklist-definitions";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Seeds a firm's verification-log hash chain. Unique per firm/creation time so
 * two firms never share a genesis hash even with identical downstream data.
 */
export function computeGenesisHash(clerkOrgId: string, createdAtIso: string): string {
  return sha256Hex(`genesis:${clerkOrgId}:${createdAtIso}`);
}

type TaskCategory = (typeof schema.taskCategoryEnum.enumValues)[number];
type VerificationOutcome = (typeof schema.verificationOutcomeEnum.enumValues)[number];
type ReviewerRole = (typeof schema.reviewerRoleEnum.enumValues)[number];

export type NewVerificationEntryInput = {
  firmId: string;
  practitionerId: string;
  aiToolId: string;
  taskCategory: TaskCategory;
  // Not part of canonicalize()/entryHash — see note above appendVerificationEntry. Still
  // append-only/immutable via the DB trigger, just not covered by the SHA-256 recompute check.
  clientReference?: string | null;
  checklistItemsReviewed: ChecklistItemsReviewed;
  assumptionsNoted?: string | null;
  evidenceLocation?: string | null;
  documentReference?: string | null;
  outcome: VerificationOutcome;
  flagReason?: string | null;
  aiOutputGeneratedAt: Date;
  reviewCompletedAt: Date;
  deliveredToClientAt?: Date | null;
  reviewerRole: ReviewerRole;
  amendsEntryId?: string | null;
  createdBy: string;
  // Who independently approved this entry, and when — also NOT part of canonicalize(), same
  // reasoning as clientReference/assumptionsNoted/evidenceLocation above.
  approvedBy?: string | null;
  approvedAt?: Date | null;
  submissionId?: string | null;
};

/**
 * Deterministic serialization used for hashing. Not JSON.stringify on the row
 * directly — key order in jsonb's text form isn't a stable contract, and we
 * need the exact same bytes whether we're writing this entry or re-verifying
 * it later.
 */
function canonicalizeChecklist(checklist: ChecklistItemsReviewed): string {
  const sortedKeys = Object.keys(checklist).sort();
  return JSON.stringify(sortedKeys.map((key) => [key, checklist[key as keyof ChecklistItemsReviewed]]));
}

function canonicalize(fields: {
  firmId: string;
  practitionerId: string;
  aiToolId: string;
  taskCategory: string;
  checklistItemsReviewed: ChecklistItemsReviewed;
  outcome: string;
  flagReason: string | null;
  aiOutputGeneratedAt: Date;
  reviewCompletedAt: Date;
  deliveredToClientAt: Date | null;
  reviewerRole: string;
  sequenceNo: number;
  priorHash: string;
}): string {
  return [
    fields.firmId,
    fields.practitionerId,
    fields.aiToolId,
    fields.taskCategory,
    canonicalizeChecklist(fields.checklistItemsReviewed),
    fields.outcome,
    fields.flagReason ?? "",
    fields.aiOutputGeneratedAt.toISOString(),
    fields.reviewCompletedAt.toISOString(),
    fields.deliveredToClientAt?.toISOString() ?? "",
    fields.reviewerRole,
    String(fields.sequenceNo),
    fields.priorHash,
  ].join("|");
}

export class ChainStateMissingError extends Error {
  constructor(firmId: string) {
    super(`No firm_chain_state row for firm ${firmId}. Firms must be seeded with a genesis hash on creation.`);
    this.name = "ChainStateMissingError";
  }
}

/**
 * Appends a new verification-log entry to a firm's hash chain.
 *
 * Uses the WebSocket pool (not the HTTP driver) because this needs a real
 * transaction: lock the firm's chain-state row, read the tail, insert, and
 * advance the tail — all atomically, so concurrent appenders for the same
 * firm can never observe or write the same sequence_no/prior_hash.
 *
 * clientReference/assumptionsNoted are deliberately NOT passed into canonicalize(): adding
 * fields to that function changes what entryHash means, which would make every entry written
 * before the change look tampered-with when verifyChain() recomputes their hash. They're still
 * fully immutable (the append-only trigger from migration 0001 covers every column), just not
 * part of the SHA-256 recompute check the original fields are.
 */
export async function appendVerificationEntry(input: NewVerificationEntryInput) {
  const db = getPoolDb();

  return db.transaction(async (tx) => {
    const [chainState] = await tx
      .select()
      .from(schema.firmChainState)
      .where(eq(schema.firmChainState.firmId, input.firmId))
      .for("update");

    if (!chainState) {
      throw new ChainStateMissingError(input.firmId);
    }

    const sequenceNo = chainState.lastSequenceNo + 1;
    const priorHash = chainState.lastHash;
    const flagReason = input.flagReason ?? null;
    const deliveredToClientAt = input.deliveredToClientAt ?? null;

    const entryHash = sha256Hex(
      canonicalize({
        firmId: input.firmId,
        practitionerId: input.practitionerId,
        aiToolId: input.aiToolId,
        taskCategory: input.taskCategory,
        checklistItemsReviewed: input.checklistItemsReviewed,
        outcome: input.outcome,
        flagReason,
        aiOutputGeneratedAt: input.aiOutputGeneratedAt,
        reviewCompletedAt: input.reviewCompletedAt,
        deliveredToClientAt,
        reviewerRole: input.reviewerRole,
        sequenceNo,
        priorHash,
      })
    );

    const [inserted] = await tx
      .insert(schema.verificationLog)
      .values({
        firmId: input.firmId,
        practitionerId: input.practitionerId,
        aiToolId: input.aiToolId,
        taskCategory: input.taskCategory,
        clientReference: input.clientReference ?? null,
        checklistItemsReviewed: input.checklistItemsReviewed,
        assumptionsNoted: input.assumptionsNoted ?? null,
        evidenceLocation: input.evidenceLocation ?? null,
        documentReference: input.documentReference ?? null,
        outcome: input.outcome,
        flagReason,
        aiOutputGeneratedAt: input.aiOutputGeneratedAt,
        reviewCompletedAt: input.reviewCompletedAt,
        deliveredToClientAt,
        reviewerRole: input.reviewerRole,
        amendsEntryId: input.amendsEntryId ?? null,
        sequenceNo,
        priorHash,
        entryHash,
        createdBy: input.createdBy,
        approvedBy: input.approvedBy ?? null,
        approvedAt: input.approvedAt ?? null,
        submissionId: input.submissionId ?? null,
      })
      .returning();

    await tx
      .update(schema.firmChainState)
      .set({ lastSequenceNo: sequenceNo, lastHash: entryHash })
      .where(eq(schema.firmChainState.firmId, input.firmId));

    return inserted;
  });
}

export type ChainVerificationResult =
  | { valid: true; entryCount: number; tipHash: string }
  | { valid: false; entryCount: number; failedAtSequenceNo: number; reason: string };

/**
 * Recomputes every entry's hash from its stored fields and confirms the chain
 * links back to the firm's genesis hash. Read-only; safe to run anytime,
 * including against the plain HTTP db client.
 */
export async function verifyChain(firmId: string): Promise<ChainVerificationResult> {
  const db = getDb();

  const [firm] = await db.select().from(schema.firms).where(eq(schema.firms.id, firmId)).limit(1);
  if (!firm) {
    throw new Error(`No firm ${firmId}`);
  }

  const entries = await db
    .select()
    .from(schema.verificationLog)
    .where(eq(schema.verificationLog.firmId, firmId))
    .orderBy(asc(schema.verificationLog.sequenceNo));

  let expectedPriorHash = firm.chainGenesisHash;

  for (const entry of entries) {
    if (entry.priorHash !== expectedPriorHash) {
      return {
        valid: false,
        entryCount: entries.length,
        failedAtSequenceNo: entry.sequenceNo,
        reason: `prior_hash does not match previous entry's entry_hash (chain linkage broken)`,
      };
    }

    const recomputed = sha256Hex(
      canonicalize({
        firmId: entry.firmId,
        practitionerId: entry.practitionerId,
        aiToolId: entry.aiToolId,
        taskCategory: entry.taskCategory,
        checklistItemsReviewed: entry.checklistItemsReviewed as ChecklistItemsReviewed,
        outcome: entry.outcome,
        flagReason: entry.flagReason,
        aiOutputGeneratedAt: entry.aiOutputGeneratedAt,
        reviewCompletedAt: entry.reviewCompletedAt,
        deliveredToClientAt: entry.deliveredToClientAt,
        reviewerRole: entry.reviewerRole,
        sequenceNo: entry.sequenceNo,
        priorHash: entry.priorHash,
      })
    );

    if (recomputed !== entry.entryHash) {
      return {
        valid: false,
        entryCount: entries.length,
        failedAtSequenceNo: entry.sequenceNo,
        reason: "recomputed hash does not match stored entry_hash (content tampered)",
      };
    }

    expectedPriorHash = entry.entryHash;
  }

  return { valid: true, entryCount: entries.length, tipHash: expectedPriorHash };
}
