import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { clientDataSensitivityValues, practiceMixValues } from "@/lib/validation/schemas";
import { createPolicyDocument } from "../actions";

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
          <form action={createPolicyDocument} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="firmSize">Number of practitioners</Label>
              <Input type="number" id="firmSize" name="firmSize" min={1} max={500} defaultValue={2} required />
            </div>

            <div className="space-y-2">
              <Label>AI tools currently in use</Label>
              <div className="space-y-2 rounded-lg border p-3">
                {tools.map((tool) => (
                  <label key={tool.id} className="flex items-center gap-2 text-sm">
                    <Checkbox name="aiToolIds" value={tool.id} />
                    {tool.toolName}
                  </label>
                ))}
                {tools.length === 0 && <p className="text-sm text-muted-foreground">No tools registered yet.</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="clientDataSensitivity">Client data sensitivity</Label>
              <Select name="clientDataSensitivity" required defaultValue="moderate">
                <SelectTrigger id="clientDataSensitivity" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {clientDataSensitivityValues.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Practice mix</Label>
              <div className="space-y-2 rounded-lg border p-3">
                {practiceMixValues.map((v) => (
                  <label key={v} className="flex items-center gap-2 text-sm">
                    <Checkbox name="practiceMix" value={v} defaultChecked={v === "individual"} />
                    {v}
                  </label>
                ))}
              </div>
            </div>

            <Button type="submit">Generate policy</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
