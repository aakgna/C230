import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { computeGenesisHash } from "@/lib/verification/hash-chain";

export async function POST(request: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch (error) {
    console.error("Clerk webhook signature verification failed", error);
    return new Response("Invalid signature", { status: 400 });
  }

  const db = getDb();

  switch (event.type) {
    case "organization.created": {
      const org = event.data;
      const createdAtIso = new Date(org.created_at).toISOString();
      const chainGenesisHash = computeGenesisHash(org.id, createdAtIso);

      const [firm] = await db
        .insert(schema.firms)
        .values({
          clerkOrgId: org.id,
          name: org.name,
          chainGenesisHash,
          // Resolved to a real users.id once organizationMembership.created lands for this
          // Clerk user — the creator's users row doesn't exist yet at this point.
          pendingOwnerClerkUserId: org.created_by ?? null,
        })
        .onConflictDoNothing({ target: schema.firms.clerkOrgId })
        .returning();

      if (firm) {
        await db.insert(schema.firmChainState).values({
          firmId: firm.id,
          lastSequenceNo: 0,
          lastHash: chainGenesisHash,
        });

        const catalog = await db.select().from(schema.aiToolCatalog);
        if (catalog.length > 0) {
          await db.insert(schema.aiToolRegister).values(
            catalog.map((tool) => ({
              firmId: firm.id,
              catalogId: tool.id,
              toolName: tool.name,
              status: "under_review" as const,
            }))
          );
        }
      }
      break;
    }

    case "organizationMembership.created": {
      const membership = event.data;
      const clerkOrgId = membership.organization.id;
      const clerkUserId = membership.public_user_data.user_id;

      const [firm] = await db.select().from(schema.firms).where(eq(schema.firms.clerkOrgId, clerkOrgId)).limit(1);
      if (!firm) {
        // Svix delivers organization.created and organizationMembership.created with no
        // ordering guarantee and near-zero delay between them, so this can legitimately race
        // ahead of the firm's own insert landing — especially on a brand-new signup, where
        // both fire back-to-back. A 200 here would tell Svix this delivery succeeded and it
        // would never retry, silently dropping the membership forever. Returning non-2xx makes
        // Svix retry with backoff instead, by which point organization.created has long since
        // committed.
        console.error(`organizationMembership.created for unknown org ${clerkOrgId}; will retry`);
        return new Response("Firm not yet synced", { status: 409 });
      }

      const fullName = [membership.public_user_data.first_name, membership.public_user_data.last_name]
        .filter(Boolean)
        .join(" ") || null;

      await db
        .insert(schema.users)
        .values({
          firmId: firm.id,
          clerkUserId,
          email: membership.public_user_data.identifier,
          fullName,
          appRole: membership.role === "org:admin" ? "firm_admin" : "practitioner",
        })
        // Composite target, not just clerkUserId — this person may already have a row under a
        // different firm (see lib/db/schema/firms.ts); only a redelivery of *this* firm's
        // membership event should be a no-op, not a first-time join to a second firm.
        .onConflictDoNothing({ target: [schema.users.firmId, schema.users.clerkUserId] });

      // Resolve firm ownership now that this user's row is guaranteed to exist (either just
      // inserted, or already there on a webhook redelivery).
      if (!firm.ownerId) {
        const [user] = await db
          .select()
          .from(schema.users)
          .where(and(eq(schema.users.clerkUserId, clerkUserId), eq(schema.users.firmId, firm.id)))
          .limit(1);

        if (user) {
          if (firm.pendingOwnerClerkUserId === clerkUserId) {
            await db
              .update(schema.firms)
              .set({ ownerId: user.id, pendingOwnerClerkUserId: null })
              .where(eq(schema.firms.id, firm.id));
          } else if (!firm.pendingOwnerClerkUserId) {
            // organization.created didn't give us a created_by — fall back to "the firm's
            // first-ever recorded member is its owner" (Clerk always adds the creator as
            // org:admin immediately on creation, so the first membership can only be them).
            const [{ count }] = await db
              .select({ count: sql<number>`count(*)::int` })
              .from(schema.users)
              .where(eq(schema.users.firmId, firm.id));

            if (count === 1) {
              await db.update(schema.firms).set({ ownerId: user.id }).where(eq(schema.firms.id, firm.id));
            }
          }
        }
      }
      break;
    }

    default:
      break;
  }

  return new Response("OK", { status: 200 });
}
