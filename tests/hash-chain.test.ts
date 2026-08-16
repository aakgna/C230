import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, eq, asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getPoolDb } from "@/lib/db/pool";
import { appendVerificationEntry, verifyChain, computeGenesisHash } from "@/lib/verification/hash-chain";
import { emptyChecklist } from "@/lib/verification/checklist-definitions";

describe("verification log hash chain", () => {
  let firmId: string;
  let userId: string;
  let toolId: string;

  beforeAll(async () => {
    const db = getDb();
    const clerkOrgId = `test-org-${randomUUID()}`;
    const genesisHash = computeGenesisHash(clerkOrgId, new Date().toISOString());

    const [firm] = await db
      .insert(schema.firms)
      .values({ clerkOrgId, name: "Test Firm (hash-chain.test.ts)", chainGenesisHash: genesisHash })
      .returning();
    firmId = firm.id;

    await db.insert(schema.firmChainState).values({ firmId, lastSequenceNo: 0, lastHash: genesisHash });

    const [user] = await db
      .insert(schema.users)
      .values({ firmId, clerkUserId: `test-user-${randomUUID()}`, email: "test@example.com", appRole: "practitioner" })
      .returning();
    userId = user.id;

    const [tool] = await db
      .insert(schema.aiToolRegister)
      .values({ firmId, toolName: "Test Tool", status: "approved" })
      .returning();
    toolId = tool.id;
  });

  afterAll(async () => {
    const db = getDb();
    // verification_log rows are append-only (trigger-enforced) even for cleanup,
    // so disable the trigger for this one teardown operation.
    await db.execute(sql`ALTER TABLE verification_log DISABLE TRIGGER verification_log_no_delete`);
    await db.delete(schema.verificationLog).where(eq(schema.verificationLog.firmId, firmId));
    await db.execute(sql`ALTER TABLE verification_log ENABLE TRIGGER verification_log_no_delete`);
    await db.delete(schema.firmChainState).where(eq(schema.firmChainState.firmId, firmId));
    await db.delete(schema.aiToolRegister).where(eq(schema.aiToolRegister.firmId, firmId));
    await db.delete(schema.users).where(eq(schema.users.firmId, firmId));
    await db.delete(schema.firms).where(eq(schema.firms.id, firmId));
  });

  function baseEntry(overrides: Partial<Parameters<typeof appendVerificationEntry>[0]> = {}) {
    const now = new Date();
    return {
      firmId,
      practitionerId: userId,
      aiToolId: toolId,
      taskCategory: "return_prep" as const,
      checklistItemsReviewed: emptyChecklist(),
      outcome: "approved" as const,
      aiOutputGeneratedAt: now,
      reviewCompletedAt: new Date(now.getTime() + 60_000),
      reviewerRole: "preparer" as const,
      createdBy: userId,
      ...overrides,
    };
  }

  it("appends entries and verifies a valid chain", async () => {
    await appendVerificationEntry(baseEntry());
    await appendVerificationEntry(
      baseEntry({ outcome: "flagged", flagReason: "Citation could not be verified", taskCategory: "research_memo" })
    );
    await appendVerificationEntry(baseEntry({ taskCategory: "written_advice", reviewerRole: "reviewing_partner" }));

    const result = await verifyChain(firmId);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.entryCount).toBe(3);
    }
  });

  it("rejects a flagged entry with no flag_reason at the DB layer", async () => {
    await expect(appendVerificationEntry(baseEntry({ outcome: "flagged" }))).rejects.toThrow();
  });

  it("blocks direct UPDATE of verification_log via the append-only trigger", async () => {
    const db = getDb();
    const [entry] = await db.select().from(schema.verificationLog).where(eq(schema.verificationLog.firmId, firmId)).limit(1);

    const pool = getPoolDb();
    // The driver wraps the underlying Postgres exception, so we don't assert on
    // message text — the real proof is that the row is unchanged afterward.
    await expect(
      pool.execute(sql`UPDATE verification_log SET outcome = 'rejected' WHERE id = ${entry.id}`)
    ).rejects.toThrow();

    const [unchanged] = await db.select().from(schema.verificationLog).where(eq(schema.verificationLog.id, entry.id)).limit(1);
    expect(unchanged.outcome).toBe(entry.outcome);
  });

  it("detects tampering if the append-only trigger is bypassed (e.g. by a privileged attacker)", async () => {
    const db = getDb();
    const [entry] = await db
      .select()
      .from(schema.verificationLog)
      .where(eq(schema.verificationLog.firmId, firmId))
      .orderBy(asc(schema.verificationLog.sequenceNo))
      .limit(1);

    // Simulates an attacker with enough DB access to disable the trigger directly
    // (not just insufficient app-role privileges) — the scenario the hash chain
    // itself, not the trigger, is responsible for catching.
    await db.execute(sql`ALTER TABLE verification_log DISABLE TRIGGER verification_log_no_update`);
    await db.execute(sql`UPDATE verification_log SET outcome = 'rejected' WHERE id = ${entry.id}`);
    await db.execute(sql`ALTER TABLE verification_log ENABLE TRIGGER verification_log_no_update`);

    const result = await verifyChain(firmId);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.failedAtSequenceNo).toBe(entry.sequenceNo);
    }
  });
});
