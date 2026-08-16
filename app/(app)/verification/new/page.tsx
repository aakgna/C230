import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CHECKLIST_ITEMS } from "@/lib/verification/checklist-definitions";
import { taskCategoryValues, verificationOutcomeValues, reviewerRoleValues } from "@/lib/validation/schemas";
import { createVerificationEntry } from "../actions";

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function NewVerificationEntryPage() {
  const ctx = await requireFirmContext();
  const db = getDb();

  const [users, tools] = await Promise.all([
    db.select().from(schema.users).where(eq(schema.users.firmId, ctx.firmId)),
    db.select().from(schema.aiToolRegister).where(eq(schema.aiToolRegister.firmId, ctx.firmId)),
  ]);

  const now = toDatetimeLocal(new Date());

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Log a review</h1>
        <p className="text-sm text-muted-foreground">
          Once submitted, this entry is permanent — corrections are logged as new entries, not edits.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createVerificationEntry} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="practitionerId">Practitioner</Label>
                <Select name="practitionerId" required>
                  <SelectTrigger id="practitionerId" className="w-full">
                    <SelectValue placeholder="Select practitioner" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.fullName ?? u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reviewerRole">Reviewer role</Label>
                <Select name="reviewerRole" required>
                  <SelectTrigger id="reviewerRole" className="w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {reviewerRoleValues.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="aiToolId">AI tool used</Label>
                <Select name="aiToolId" required>
                  <SelectTrigger id="aiToolId" className="w-full">
                    <SelectValue placeholder="Select tool" />
                  </SelectTrigger>
                  <SelectContent>
                    {tools.map((tool) => (
                      <SelectItem key={tool.id} value={tool.id}>
                        {tool.toolName}
                        {tool.status === "prohibited" ? " (prohibited — do not use)" : ""}
                        {tool.status === "under_review" ? " (under review)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="taskCategory">Task category</Label>
                <Select name="taskCategory" required>
                  <SelectTrigger id="taskCategory" className="w-full">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {taskCategoryValues.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Checklist reviewed</Label>
              <div className="space-y-2 rounded-lg border p-3">
                {CHECKLIST_ITEMS.map((item) => (
                  <label key={item.key} className="flex items-center gap-2 text-sm">
                    <Checkbox name={item.key} />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="aiOutputGeneratedAt">AI output generated at</Label>
                <Input type="datetime-local" id="aiOutputGeneratedAt" name="aiOutputGeneratedAt" defaultValue={now} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reviewCompletedAt">Review completed at</Label>
                <Input type="datetime-local" id="reviewCompletedAt" name="reviewCompletedAt" defaultValue={now} required />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="deliveredToClientAt">Delivered to client at (optional)</Label>
              <Input type="datetime-local" id="deliveredToClientAt" name="deliveredToClientAt" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="outcome">Outcome</Label>
              <Select name="outcome" required>
                <SelectTrigger id="outcome" className="w-full">
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  {verificationOutcomeValues.map((outcome) => (
                    <SelectItem key={outcome} value={outcome}>
                      {outcome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="flagReason">Flag reason (required if outcome is &quot;flagged&quot;)</Label>
              <Textarea id="flagReason" name="flagReason" rows={3} />
            </div>

            <Button type="submit">Submit review</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
