import "server-only";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type FirmContext = {
  firmId: string;
  userId: string; // internal users.id, not the Clerk user id
  clerkUserId: string;
  clerkOrgId: string;
  appRole: "firm_admin" | "practitioner";
};

export class FirmNotSyncedError extends Error {
  constructor(clerkOrgId: string) {
    super(
      `No firm record found for Clerk org ${clerkOrgId} yet. The organization.created webhook may not have run — see app/api/webhooks/clerk/route.ts.`
    );
    this.name = "FirmNotSyncedError";
  }
}

/**
 * Resolves the current session to firm-scoped identifiers. Every tenant-scoped
 * query must filter on the returned firmId — never trust a client-supplied one.
 */
export async function requireFirmContext(): Promise<FirmContext> {
  const { userId: clerkUserId, orgId: clerkOrgId } = await auth.protect();

  if (!clerkOrgId) {
    redirect("/settings/organization?needsOrg=1");
  }

  const db = getDb();

  const [firm] = await db.select().from(schema.firms).where(eq(schema.firms.clerkOrgId, clerkOrgId)).limit(1);
  if (!firm) {
    throw new FirmNotSyncedError(clerkOrgId);
  }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.clerkUserId, clerkUserId)).limit(1);
  if (!user) {
    throw new FirmNotSyncedError(clerkOrgId);
  }

  return {
    firmId: firm.id,
    userId: user.id,
    clerkUserId,
    clerkOrgId,
    appRole: user.appRole,
  };
}
