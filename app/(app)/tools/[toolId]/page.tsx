import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toolStatusValues } from "@/lib/validation/schemas";
import { updateToolStatus } from "../actions";

export default async function ToolDetailPage(props: PageProps<"/tools/[toolId]">) {
  const { toolId } = await props.params;
  const ctx = await requireFirmContext();
  const db = getDb();

  // Scoped by firmId in the query itself — a cross-firm id returns 404, not
  // an empty state, so this can't be used to enumerate other firms' tools.
  const [tool] = await db
    .select()
    .from(schema.aiToolRegister)
    .where(and(eq(schema.aiToolRegister.id, toolId), eq(schema.aiToolRegister.firmId, ctx.firmId)))
    .limit(1);

  if (!tool) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">{tool.toolName}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status &amp; vetting notes</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateToolStatus} className="space-y-4">
            <input type="hidden" name="toolId" value={tool.id} />
            <div className="space-y-1.5">
              <label htmlFor="status" className="text-sm font-medium">
                Status
              </label>
              <Select name="status" defaultValue={tool.status}>
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {toolStatusValues.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vettingNotes" className="text-sm font-medium">
                Vetting notes
              </label>
              <Textarea
                id="vettingNotes"
                name="vettingNotes"
                rows={6}
                defaultValue={tool.vettingNotes ?? ""}
                placeholder="Data handling posture, confidentiality safeguards, vendor terms flags…"
              />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
