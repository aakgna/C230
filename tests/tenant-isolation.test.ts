import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { appendVerificationEntry, computeGenesisHash } from "@/lib/verification/hash-chain";
import { emptyChecklist } from "@/lib/verification/checklist-definitions";

/**
 * Exercises the same query pattern every page/server action uses
 * (requireFirmContext() -> .where(eq(table.firmId, ctx.firmId))) directly at
 * the data layer, since simulating two distinct authenticated Clerk sessions
 * in a unit test isn't practical. This is the mechanism cross-firm
 * isolation actually depends on: a mismatched firmId must return nothing,
 * not just an empty UI list.
 */
describe("cross-tenant data isolation", () => {
  const firms: { id: string; userId: string; toolId: string; verificationEntryId: string }[] = [];

  async function seedFirm(label: string) {
    const db = getDb();
    const clerkOrgId = `test-org-isolation-${label}-${randomUUID()}`;
    const genesisHash = computeGenesisHash(clerkOrgId, new Date().toISOString());

    const [firm] = await db
      .insert(schema.firms)
      .values({ clerkOrgId, name: `Isolation Test Firm ${label}`, chainGenesisHash: genesisHash })
      .returning();
    await db.insert(schema.firmChainState).values({ firmId: firm.id, lastSequenceNo: 0, lastHash: genesisHash });

    const [user] = await db
      .insert(schema.users)
      .values({ firmId: firm.id, clerkUserId: `test-user-isolation-${label}-${randomUUID()}`, email: `${label}@example.com`, appRole: "practitioner" })
      .returning();

    const [tool] = await db.insert(schema.aiToolRegister).values({ firmId: firm.id, toolName: `Tool ${label}`, status: "approved" }).returning();

    const now = new Date();
    const entry = await appendVerificationEntry({
      firmId: firm.id,
      practitionerId: user.id,
      aiToolId: tool.id,
      taskCategory: "other",
      checklistItemsReviewed: emptyChecklist(),
      outcome: "approved",
      aiOutputGeneratedAt: now,
      reviewCompletedAt: now,
      reviewerRole: "other",
      createdBy: user.id,
    });

    return { id: firm.id, userId: user.id, toolId: tool.id, verificationEntryId: entry.id };
  }

  beforeAll(async () => {
    firms.push(await seedFirm("A"));
    firms.push(await seedFirm("B"));
  });

  afterAll(async () => {
    const db = getDb();
    await db.execute(sql`ALTER TABLE verification_log DISABLE TRIGGER verification_log_no_delete`);
    for (const firm of firms) {
      await db.delete(schema.verificationLog).where(eq(schema.verificationLog.firmId, firm.id));
    }
    await db.execute(sql`ALTER TABLE verification_log ENABLE TRIGGER verification_log_no_delete`);
    for (const firm of firms) {
      await db.delete(schema.firmChainState).where(eq(schema.firmChainState.firmId, firm.id));
      await db.delete(schema.aiToolRegister).where(eq(schema.aiToolRegister.firmId, firm.id));
      await db.delete(schema.users).where(eq(schema.users.firmId, firm.id));
      await db.delete(schema.firms).where(eq(schema.firms.id, firm.id));
    }
  });

  it("does not return another firm's verification log entry by id", async () => {
    const [firmA, firmB] = firms;
    const db = getDb();

    const [crossFirmLookup] = await db
      .select()
      .from(schema.verificationLog)
      .where(and(eq(schema.verificationLog.id, firmB.verificationEntryId), eq(schema.verificationLog.firmId, firmA.id)))
      .limit(1);

    expect(crossFirmLookup).toBeUndefined();

    const [sameFirmLookup] = await db
      .select()
      .from(schema.verificationLog)
      .where(and(eq(schema.verificationLog.id, firmB.verificationEntryId), eq(schema.verificationLog.firmId, firmB.id)))
      .limit(1);

    expect(sameFirmLookup).toBeDefined();
  });

  it("does not return another firm's tool by id", async () => {
    const [firmA, firmB] = firms;
    const db = getDb();

    const [crossFirmLookup] = await db
      .select()
      .from(schema.aiToolRegister)
      .where(and(eq(schema.aiToolRegister.id, firmB.toolId), eq(schema.aiToolRegister.firmId, firmA.id)))
      .limit(1);

    expect(crossFirmLookup).toBeUndefined();
  });

  it("firm-scoped tool listing excludes the other firm's tools", async () => {
    const [firmA, firmB] = firms;
    const db = getDb();

    const firmATools = await db.select().from(schema.aiToolRegister).where(eq(schema.aiToolRegister.firmId, firmA.id));
    expect(firmATools.every((t) => t.id !== firmB.toolId)).toBe(true);
    expect(firmATools.some((t) => t.id === firmA.toolId)).toBe(true);
  });
});
