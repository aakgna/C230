import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const ctx = await requireFirmContext();
  const db = getDb();

  const [tools, users, activeModules, completions, verificationEntries] = await Promise.all([
    db.select().from(schema.aiToolRegister).where(eq(schema.aiToolRegister.firmId, ctx.firmId)),
    db.select().from(schema.users).where(eq(schema.users.firmId, ctx.firmId)),
    db.select().from(schema.trainingModules).where(eq(schema.trainingModules.isActive, true)),
    db.select().from(schema.trainingCompletions).where(eq(schema.trainingCompletions.firmId, ctx.firmId)),
    db
      .select({
        aiOutputGeneratedAt: schema.verificationLog.aiOutputGeneratedAt,
        reviewCompletedAt: schema.verificationLog.reviewCompletedAt,
      })
      .from(schema.verificationLog)
      .where(eq(schema.verificationLog.firmId, ctx.firmId)),
  ]);

  const toolCounts = tools.reduce(
    (acc, t) => ({ ...acc, [t.status]: (acc[t.status] ?? 0) + 1 }),
    {} as Record<string, number>
  );

  const totalSlots = users.length * activeModules.length;
  const trainingPct = totalSlots > 0 ? Math.round((completions.length / totalSlots) * 100) : 0;

  const latenciesMs = verificationEntries.map((e) => e.reviewCompletedAt.getTime() - e.aiOutputGeneratedAt.getTime());
  const rubberStampCount = latenciesMs.filter((ms) => ms < 60_000).length;
  const rubberStampPct = latenciesMs.length > 0 ? Math.round((rubberStampCount / latenciesMs.length) * 100) : 0;
  const avgLatencyMin =
    latenciesMs.length > 0 ? Math.round(latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length / 60000) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">AI Tool Register</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge>{toolCounts.approved ?? 0} approved</Badge>
            <Badge variant="secondary">{toolCounts.under_review ?? 0} under review</Badge>
            <Badge variant="destructive">{toolCounts.prohibited ?? 0} prohibited</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Training Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{trainingPct}%</p>
            <p className="text-xs text-muted-foreground">
              {completions.length} of {totalSlots} staff × module slots complete
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Review Latency Signal</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{rubberStampPct}%</p>
            <p className="text-xs text-muted-foreground">
              reviewed in under 60s (rubber-stamp risk){avgLatencyMin !== null ? ` · avg ${avgLatencyMin} min` : ""}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
