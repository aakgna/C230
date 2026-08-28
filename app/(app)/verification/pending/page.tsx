import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionToast } from "@/components/action-toast";

const STATUS_VARIANT: Record<string, "info" | "success" | "destructive"> = {
  pending: "info",
  approved: "success",
  rejected: "destructive",
};

export default async function PendingVerificationPage() {
  const ctx = await requireFirmContext();
  const db = getDb();

  const mySubmissions = await db
    .select({
      id: schema.verificationSubmissions.id,
      status: schema.verificationSubmissions.status,
      taskCategory: schema.verificationSubmissions.taskCategory,
      submittedAt: schema.verificationSubmissions.submittedAt,
      toolName: schema.aiToolRegister.toolName,
    })
    .from(schema.verificationSubmissions)
    .innerJoin(schema.aiToolRegister, eq(schema.verificationSubmissions.aiToolId, schema.aiToolRegister.id))
    .where(
      and(eq(schema.verificationSubmissions.firmId, ctx.firmId), eq(schema.verificationSubmissions.submittedBy, ctx.userId))
    )
    .orderBy(desc(schema.verificationSubmissions.updatedAt));

  // "Needs your review" — scoped to whoever it's actually assigned to right now, not every
  // qualified reviewer at this firm. This *is* the in-app notification: if it's here, it's your
  // turn.
  const needsReview = await db
    .select({
      id: schema.verificationSubmissions.id,
      taskCategory: schema.verificationSubmissions.taskCategory,
      submittedAt: schema.verificationSubmissions.submittedAt,
      submittedBy: schema.verificationSubmissions.submittedBy,
      practitionerId: schema.verificationSubmissions.practitionerId,
      toolName: schema.aiToolRegister.toolName,
      submittedByName: schema.users.fullName,
    })
    .from(schema.verificationSubmissions)
    .innerJoin(schema.aiToolRegister, eq(schema.verificationSubmissions.aiToolId, schema.aiToolRegister.id))
    .innerJoin(schema.users, eq(schema.verificationSubmissions.submittedBy, schema.users.id))
    .where(
      and(
        eq(schema.verificationSubmissions.firmId, ctx.firmId),
        eq(schema.verificationSubmissions.status, "pending"),
        eq(schema.verificationSubmissions.currentAssigneeId, ctx.userId)
      )
    )
    .orderBy(desc(schema.verificationSubmissions.submittedAt));

  return (
    <div className="space-y-6">
      <ActionToast
        outcomes={[
          { param: "rejected", message: "Submission rejected", description: "Sent back to the submitter.", tone: "warning" },
          { param: "forwarded", message: "Forwarded", description: "Sent to the next reviewer.", tone: "info" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold">Pending review</h1>
        <p className="text-sm text-muted-foreground">
          Submissions only become part of the permanent verification log once approved by someone other than the
          submitter.
        </p>
      </div>

      <Tabs defaultValue={needsReview.length > 0 ? "needs-review" : "mine"}>
        <TabsList>
          <TabsTrigger value="needs-review">Needs your review ({needsReview.length})</TabsTrigger>
          <TabsTrigger value="mine">My submissions ({mySubmissions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="needs-review">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Tool</TableHead>
                <TableHead>Submitted by</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {needsReview.map((s, i) => {
                // Assignment already excludes the submitter/practitioner (see
                // getEligibleNextReviewers) — this is a defensive fallback, not the primary
                // enforcement, in case of pre-existing data from before assignment tracking.
                const selfConflicted = s.submittedBy === ctx.userId || s.practitionerId === ctx.userId;
                return (
                  <TableRow key={s.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-row-settle">
                    <TableCell>{s.taskCategory.replace(/_/g, " ")}</TableCell>
                    <TableCell>{s.toolName}</TableCell>
                    <TableCell>{s.submittedByName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{s.submittedAt.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      {selfConflicted ? (
                        <span className="text-xs text-muted-foreground">You can&apos;t review your own submission</span>
                      ) : (
                        <Link href={`/verification/pending/${s.id}`} className="text-sm underline underline-offset-4">
                          Review
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {needsReview.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nothing waiting on review.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="mine">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Tool</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mySubmissions.map((s, i) => (
                <TableRow key={s.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-row-settle">
                  <TableCell>{s.taskCategory.replace(/_/g, " ")}</TableCell>
                  <TableCell>{s.toolName}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[s.status] ?? "secondary"}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.submittedAt.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/verification/pending/${s.id}`} className="text-sm underline underline-offset-4">
                      {s.status === "rejected" ? "View / edit" : "View"}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {mySubmissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No submissions yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
