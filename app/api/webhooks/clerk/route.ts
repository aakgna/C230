import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { eq } from "drizzle-orm";
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
        console.error(`organizationMembership.created for unknown org ${clerkOrgId}; organization.created may not have been processed yet`);
        break;
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
        .onConflictDoNothing({ target: schema.users.clerkUserId });
      break;
    }

    default:
      break;
  }

  return new Response("OK", { status: 200 });
}
