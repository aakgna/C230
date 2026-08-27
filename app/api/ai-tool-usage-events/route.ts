import type { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getFirmContextForApi } from "@/lib/auth/firm-context";
import { findToolByDomain } from "@/lib/tools/match-domain";

// Flushed by a content script running on the app's own origin — see
// lib/db/schema/usage-events.ts for why the extension can't POST here directly, and
// lib/auth/firm-context.ts's getFirmContextForApi() for why this route can't just call
// requireFirmContext() (a redirect Response is meaningless to a fetch() caller).
const bodySchema = z.object({
  events: z
    .array(
      z.object({
        clientEventId: z.uuid(),
        domain: z.string().trim().min(1).max(255),
        detectedAt: z.iso.datetime({ offset: true }),
      })
    )
    .min(1)
    .max(100),
});

export async function POST(request: NextRequest) {
  const result = await getFirmContextForApi();
  if (!result.ok) {
    return Response.json({ error: result.message }, { status: result.status });
  }
  const ctx = result.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const db = getDb();
  const tools = await db.select().from(schema.aiToolRegister).where(eq(schema.aiToolRegister.firmId, ctx.firmId));

  const rows = parsed.data.events.map((event) => {
    const domain = event.domain.toLowerCase();
    const matchedTool = findToolByDomain(domain, tools);
    return {
      firmId: ctx.firmId,
      userId: ctx.userId,
      domain,
      matchedToolId: matchedTool?.id,
      detectedAt: new Date(event.detectedAt),
      clientEventId: event.clientEventId,
    };
  });

  await db.insert(schema.aiToolUsageEvents).values(rows).onConflictDoNothing({ target: schema.aiToolUsageEvents.clientEventId });

  return Response.json({ accepted: rows.length }, { status: 200 });
}
