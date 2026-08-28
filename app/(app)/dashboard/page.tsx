import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangleIcon } from "lucide-react";
import { getAttentionFlags } from "@/lib/dashboard/attention-flags";
import { DonutChart, RadialProgress, LatencyHistogram, BarList } from "@/components/dashboard/charts";

const LATENCY_BUCKETS = [
  { label: "<1 min", maxMs: 60_000 },
  { label: "1–5 min", maxMs: 5 * 60_000 },
  { label: "5–30 min", maxMs: 30 * 60_000 },
  { label: "30+ min", maxMs: Infinity },
];

function bucketLatencies(latenciesMs: number[]) {
  const counts = LATENCY_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const ms of latenciesMs) {
    const idx = LATENCY_BUCKETS.findIndex((b) => ms < b.maxMs);
    counts[idx].count += 1;
  }
  return counts;
}

const TASK_CATEGORY_LABELS: Record<string, string> = {
  return_prep: "Return prep",
  research_memo: "Research memo",
  client_correspondence: "Client correspondence",
  written_advice: "Written advice",
  other: "Other",
};

export default async function DashboardPage() {
  const ctx = await requireFirmContext();
  const db = getDb();

  const [tools, users, activeModules, completions, verificationEntries, attentionFlags] = await Promise.all([
    db.select().from(schema.aiToolRegister).where(eq(schema.aiToolRegister.firmId, ctx.firmId)),
    db.select().from(schema.users).where(eq(schema.users.firmId, ctx.firmId)),
    db.select().from(schema.trainingModules).where(eq(schema.trainingModules.isActive, true)),
    db.select().from(schema.trainingCompletions).where(eq(schema.trainingCompletions.firmId, ctx.firmId)),
    db
      .select({
        aiOutputGeneratedAt: schema.verificationLog.aiOutputGeneratedAt,
        reviewCompletedAt: schema.verificationLog.reviewCompletedAt,
        taskCategory: schema.verificationLog.taskCategory,
      })
      .from(schema.verificationLog)
      .where(eq(schema.verificationLog.firmId, ctx.firmId)),
    getAttentionFlags(ctx),
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
  const latencyBuckets = bucketLatencies(latenciesMs);

  const elevatedCount = attentionFlags.filter((f) => f.severity === "elevated").length;
  const standardCount = attentionFlags.length - elevatedCount;

  // Per-staff training completion, worst-first — the same underlying numbers behind the
  // "Training Completion" card above and the training-gap attention flag, just broken out by
  // person instead of aggregated into one percentage.
  const completionsByUser = new Map<string, number>();
  for (const c of completions) {
    completionsByUser.set(c.userId, (completionsByUser.get(c.userId) ?? 0) + 1);
  }
  const staffTraining = users
    .map((u) => {
      const completed = completionsByUser.get(u.id) ?? 0;
      const pct = activeModules.length > 0 ? Math.round((completed / activeModules.length) * 100) : 0;
      return { label: u.fullName ?? u.email, value: pct, sublabel: `${completed} of ${activeModules.length} (${pct}%)` };
    })
    .sort((a, b) => a.value - b.value)
    .slice(0, 12);

  // Verification-log volume by task category — every category shown (not just ones with
  // entries) so the shape of the distribution is visible even early on, before it fills in.
  const categoryCounts = new Map<string, number>();
  for (const e of verificationEntries) {
    categoryCounts.set(e.taskCategory, (categoryCounts.get(e.taskCategory) ?? 0) + 1);
  }
  const categoryBreakdown = Object.entries(TASK_CATEGORY_LABELS)
    .map(([key, label]) => ({ label, value: categoryCounts.get(key) ?? 0, sublabel: `${categoryCounts.get(key) ?? 0}` }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="animate-row-settle" style={{ animationDelay: "0ms" }}>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">AI Tool Register</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-5">
            <DonutChart
              centerLabel={String(tools.length)}
              centerSublabel="tools"
              segments={[
                { value: toolCounts.approved ?? 0, className: "stroke-success" },
                { value: toolCounts.under_review ?? 0, className: "stroke-muted-foreground" },
                { value: toolCounts.prohibited ?? 0, className: "stroke-destructive" },
              ]}
            />
            <div className="flex flex-col gap-2">
              <Badge variant="success">{toolCounts.approved ?? 0} approved</Badge>
              <Badge variant="secondary">{toolCounts.under_review ?? 0} under review</Badge>
              <Badge variant="destructive">{toolCounts.prohibited ?? 0} prohibited</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="animate-row-settle" style={{ animationDelay: "60ms" }}>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Training Completion</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-5">
            <RadialProgress percent={trainingPct} label={`${trainingPct}%`} size={120} strokeWidth={12} />
            <p className="text-xs text-muted-foreground">
              {completions.length} of {totalSlots} staff × module slots complete
            </p>
          </CardContent>
        </Card>
        <Card className="animate-row-settle" style={{ animationDelay: "120ms" }}>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Review Latency Signal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              <span className="text-2xl font-semibold">{rubberStampPct}%</span>
              <span className="ml-1.5 text-xs text-muted-foreground">
                reviewed in under 60s (rubber-stamp risk){avgLatencyMin !== null ? ` · avg ${avgLatencyMin} min` : ""}
              </span>
            </p>
            <LatencyHistogram buckets={latencyBuckets} />
          </CardContent>
        </Card>
      </div>

      {attentionFlags.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Attention needed</h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {elevatedCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-destructive" />
                  {elevatedCount} elevated
                </span>
              )}
              {standardCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-muted-foreground" />
                  {standardCount} standard
                </span>
              )}
            </div>
          </div>
          {/* Already sorted elevated-first by getAttentionFlags(). Severity is shown as an icon
              color + accent border, not a text verdict — see attention-flags.ts for why it's an
              urgency-of-follow-up signal, not a compliance rating. */}
          <div className="divide-y rounded-lg border">
            {attentionFlags.map((flag, i) => (
              <Link
                key={flag.id}
                href={flag.href}
                style={{ animationDelay: `${180 + i * 40}ms` }}
                className={`animate-row-settle flex items-start gap-3 border-l-2 px-4 py-3 text-sm hover:bg-muted/50 ${
                  flag.severity === "elevated" ? "border-l-destructive" : "border-l-transparent"
                }`}
              >
                <AlertTriangleIcon
                  className={`mt-0.5 size-4 shrink-0 ${
                    flag.severity === "elevated" ? "text-destructive" : "text-muted-foreground"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p>{flag.summary}</p>
                  <p className="truncate text-xs text-muted-foreground">{flag.detail}</p>
                </div>
                <Badge variant="outline" className="shrink-0 capitalize">
                  {flag.module}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="animate-row-settle" style={{ animationDelay: "220ms" }}>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Training completion by staff</CardTitle>
          </CardHeader>
          <CardContent>
            {staffTraining.length > 0 ? (
              <BarList items={staffTraining} />
            ) : (
              <p className="text-xs text-muted-foreground">No staff on file yet.</p>
            )}
          </CardContent>
        </Card>
        <Card className="animate-row-settle" style={{ animationDelay: "260ms" }}>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Verification entries by task category</CardTitle>
          </CardHeader>
          <CardContent>
            {verificationEntries.length > 0 ? (
              <BarList items={categoryBreakdown} />
            ) : (
              <p className="text-xs text-muted-foreground">No verification entries logged yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
