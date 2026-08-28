import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const OUTCOME_VARIANT: Record<string, "success" | "secondary" | "destructive"> = {
  approved: "success",
  flagged: "destructive",
  escalated: "destructive",
  rejected: "secondary",
};

function formatLatency(generatedAt: Date, completedAt: Date): string {
  const ms = completedAt.getTime() - generatedAt.getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${(minutes / 60).toFixed(1)} hr`;
}

export default async function VerificationLogPage() {
  const ctx = await requireFirmContext();
  const db = getDb();

  const entries = await db
    .select({
      id: schema.verificationLog.id,
      sequenceNo: schema.verificationLog.sequenceNo,
      taskCategory: schema.verificationLog.taskCategory,
      outcome: schema.verificationLog.outcome,
      reviewerRole: schema.verificationLog.reviewerRole,
      aiOutputGeneratedAt: schema.verificationLog.aiOutputGeneratedAt,
      reviewCompletedAt: schema.verificationLog.reviewCompletedAt,
      toolName: schema.aiToolRegister.toolName,
      practitionerName: schema.users.fullName,
    })
    .from(schema.verificationLog)
    .innerJoin(schema.aiToolRegister, eq(schema.verificationLog.aiToolId, schema.aiToolRegister.id))
    .innerJoin(schema.users, eq(schema.verificationLog.practitionerId, schema.users.id))
    .where(eq(schema.verificationLog.firmId, ctx.firmId))
    .orderBy(desc(schema.verificationLog.sequenceNo));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Verification Log</h1>
          <p className="text-sm text-muted-foreground">
            Append-only, hash-chained record of every independently-approved AI-assisted review.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/verification/export" />}>
            Export audit report
          </Button>
          <Button variant="outline" render={<Link href="/verification/pending" />}>
            Pending review
          </Button>
          <Button render={<Link href="/verification/new" />}>Log a review</Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Task</TableHead>
            <TableHead>Tool</TableHead>
            <TableHead>Practitioner</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>Review latency</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry, i) => (
            <TableRow key={entry.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-row-settle">
              <TableCell className="text-muted-foreground">{entry.sequenceNo}</TableCell>
              <TableCell>{entry.taskCategory.replace(/_/g, " ")}</TableCell>
              <TableCell>{entry.toolName}</TableCell>
              <TableCell>{entry.practitionerName ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={OUTCOME_VARIANT[entry.outcome] ?? "secondary"}>{entry.outcome}</Badge>
              </TableCell>
              <TableCell>{formatLatency(entry.aiOutputGeneratedAt, entry.reviewCompletedAt)}</TableCell>
              <TableCell className="text-right">
                <Link href={`/verification/${entry.id}`} className="text-sm underline underline-offset-4">
                  View
                </Link>
              </TableCell>
            </TableRow>
          ))}
          {entries.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No verification events logged yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
