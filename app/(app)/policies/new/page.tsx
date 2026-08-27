import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PolicyIntakeForm } from "./PolicyIntakeForm";

// createPolicyDocument fans out to ~10 sequential-risk LLM calls (5 clause
// generations + up to 5 grounding judges), each with its own rate-limit
// retry backoff (lib/rag/retry.ts). Even parallelized, a couple of calls
// hitting sustained 429s can run past the platform default — set explicitly
// so the Server Action isn't capped by a lower plan/legacy default.
export const maxDuration = 300;

export default async function NewPolicyPage() {
  const ctx = await requireFirmContext();
  const db = getDb();

  const tools = await db.select().from(schema.aiToolRegister).where(eq(schema.aiToolRegister.firmId, ctx.firmId));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Generate AI-use policy</h1>
        <p className="text-sm text-muted-foreground">
          Every clause below will be grounded in a specific retrieved source — sections we can&apos;t ground will be
          shown as explicit refusals instead of a guess.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Firm intake</CardTitle>
        </CardHeader>
        <CardContent>
          <PolicyIntakeForm tools={tools} />
        </CardContent>
      </Card>
    </div>
  );
}
