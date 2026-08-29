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
  isOwner: boolean; // firm.ownerId === user.id — the sole power to demote a firm_admin
  reviewLevel: number; // position in the review chain of command — see lib/db/schema/firms.ts
  fullName: string | null; // null until they complete /welcome — see app/(app)/layout.tsx's gate
};

export type FirmContextResult = { ok: true; ctx: FirmContext } | { ok: false; status: number; message: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The firm/user rows are synced by Clerk webhooks (organization.created,
// organizationMembership.created — see app/api/webhooks/clerk/route.ts),
// which land asynchronously. A user redirected straight to /dashboard right
// after sign-up can beat that sync, so give it a few short retries before
// treating it as still-pending.
const SYNC_RETRY_ATTEMPTS = 4;
const SYNC_RETRY_DELAY_MS = 400;

/**
 * Core resolver shared by requireFirmContext() (pages/layouts) and getFirmContextForApi()
 * (route handlers). Takes already-resolved Clerk ids rather than calling auth() itself, since
 * the two callers need different auth() variants (auth.protect() vs plain auth()).
 */
async function resolveFirmContext(clerkUserId: string | null, clerkOrgId: string | null): Promise<FirmContextResult> {
  if (!clerkUserId) {
    return { ok: false, status: 401, message: "Not signed in" };
  }
  if (!clerkOrgId) {
    return { ok: false, status: 403, message: "No active organization" };
  }

  const db = getDb();

  let firm: typeof schema.firms.$inferSelect | undefined;
  let user: typeof schema.users.$inferSelect | undefined;

  for (let attempt = 0; attempt < SYNC_RETRY_ATTEMPTS; attempt++) {
    [firm] = await db.select().from(schema.firms).where(eq(schema.firms.clerkOrgId, clerkOrgId)).limit(1);
    if (firm) {
      [user] = await db.select().from(schema.users).where(eq(schema.users.clerkUserId, clerkUserId)).limit(1);
    }
    if (firm && user) {
      break;
    }
    if (attempt < SYNC_RETRY_ATTEMPTS - 1) {
      await sleep(SYNC_RETRY_DELAY_MS);
    }
  }

  if (!firm || !user) {
    return { ok: false, status: 409, message: "Firm or user sync still pending" };
  }

  return {
    ok: true,
    ctx: {
      firmId: firm.id,
      userId: user.id,
      clerkUserId,
      clerkOrgId,
      appRole: user.appRole,
      isOwner: firm.ownerId === user.id,
      reviewLevel: user.reviewLevel,
      fullName: user.fullName,
    },
  };
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

  const result = await resolveFirmContext(clerkUserId, clerkOrgId);
  if (!result.ok) {
    redirect("/onboarding-pending");
  }

  return result.ctx;
}

/**
 * Same resolution as requireFirmContext(), for route handlers instead of pages/layouts: a
 * redirect Response isn't meaningful to a fetch() caller (the extension's content-script flush,
 * in particular, per lib/db/schema/usage-events.ts), so this returns a discriminated result
 * instead of throwing or redirecting. Callers must check `.ok` and respond accordingly.
 */
export async function getFirmContextForApi(): Promise<FirmContextResult> {
  const { userId: clerkUserId, orgId: clerkOrgId } = await auth();
  return resolveFirmContext(clerkUserId ?? null, clerkOrgId ?? null);
}
