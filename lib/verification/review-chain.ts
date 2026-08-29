import { and, eq, gt, notInArray } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import type { getPoolDb } from "@/lib/db/pool";

export type EligibleReviewer = { id: string; fullName: string | null; email: string; reviewLevel: number };

/**
 * Who a submission can go to next: every active user at any review level *above* fromLevel —
 * the submitter picks whoever they want from this set, not just the nearest tier (e.g. a level-1
 * submitter can send straight to a level-4 partner, skipping 2 and 3). excludeUserIds should
 * always include the submitter and the named practitioner, so someone who'd be rejected by the
 * independence check can never even be offered as an option. Empty result means fromLevel is
 * already the firm's top (or nobody eligible exists at any higher level — see the plan's "edge
 * case to flag, not solve"). Accepts either driver (see lib/db/pool.ts) — callers doing a real
 * transaction (decideSubmission) need the pool driver, plain reads elsewhere use getDb()'s HTTP
 * driver.
 */
export async function getEligibleNextReviewers(
  db: Db | ReturnType<typeof getPoolDb>,
  firmId: string,
  fromLevel: number,
  excludeUserIds: string[]
): Promise<EligibleReviewer[]> {
  return db
    .select({
      id: schema.users.id,
      fullName: schema.users.fullName,
      email: schema.users.email,
      reviewLevel: schema.users.reviewLevel,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.firmId, firmId),
        eq(schema.users.isActive, true),
        gt(schema.users.reviewLevel, fromLevel),
        excludeUserIds.length > 0 ? notInArray(schema.users.id, excludeUserIds) : undefined
      )
    )
    .orderBy(schema.users.reviewLevel);
}
