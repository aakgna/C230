import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangleIcon, CheckIcon } from "lucide-react";
import { publishPolicyDocument, acknowledgePolicy } from "../actions";

export default async function PolicyDetailPage(props: PageProps<"/policies/[id]">) {
  const { id } = await props.params;
  const ctx = await requireFirmContext();
  const db = getDb();

  const [doc] = await db
    .select()
    .from(schema.policyDocuments)
    .where(and(eq(schema.policyDocuments.id, id), eq(schema.policyDocuments.firmId, ctx.firmId)))
    .limit(1);
  if (!doc) {
    notFound();
  }

  const clauses = await db
    .select({
      id: schema.policyDocumentClauses.id,
      clauseOrder: schema.policyDocumentClauses.clauseOrder,
      section: schema.policyDocumentClauses.circular230Section,
      clauseText: schema.policyDocumentClauses.clauseText,
      isRefusal: schema.policyDocumentClauses.isRefusal,
      refusalReason: schema.policyDocumentClauses.refusalReason,
      sourceTitle: schema.corpusDocuments.sourceTitle,
      sourceContent: schema.corpusChunks.content,
    })
    .from(schema.policyDocumentClauses)
    .leftJoin(schema.corpusChunks, eq(schema.policyDocumentClauses.citedChunkId, schema.corpusChunks.id))
    .leftJoin(schema.corpusDocuments, eq(schema.corpusChunks.documentId, schema.corpusDocuments.id))
    .where(eq(schema.policyDocumentClauses.policyDocumentId, doc.id))
    .orderBy(asc(schema.policyDocumentClauses.clauseOrder));

  const [latestEvalRun] = await db
    .select()
    .from(schema.evalRuns)
    .where(eq(schema.evalRuns.policyDocumentId, doc.id))
    .orderBy(desc(schema.evalRuns.runAt))
    .limit(1);

  const findingsByClauseId = new Map<string, { category: string; detail: string }[]>();
  if (latestEvalRun) {
    const findings = await db
      .select({
        clauseId: schema.evalFindings.clauseId,
        category: schema.evalFindings.category,
        detail: schema.evalFindings.detail,
      })
      .from(schema.evalFindings)
      .where(eq(schema.evalFindings.evalRunId, latestEvalRun.id));
    for (const f of findings) {
      if (!f.clauseId) continue;
      const list = findingsByClauseId.get(f.clauseId) ?? [];
      list.push({ category: f.category, detail: f.detail });
      findingsByClauseId.set(f.clauseId, list);
    }
  }

  const myAcknowledgment = doc.status === "published"
    ? await db
        .select({ acknowledgedAt: schema.policyAcknowledgments.acknowledgedAt })
        .from(schema.policyAcknowledgments)
        .where(
          and(
            eq(schema.policyAcknowledgments.policyDocumentId, doc.id),
            eq(schema.policyAcknowledgments.userId, ctx.userId)
          )
        )
        .limit(1)
        .then((rows) => rows[0])
    : undefined;

  let ackMatrix: { users: (typeof schema.users.$inferSelect)[]; acknowledgedIds: Set<string> } | null = null;
  if (ctx.appRole === "firm_admin" && doc.status === "published") {
    const [firmUsers, acks] = await Promise.all([
      db.select().from(schema.users).where(eq(schema.users.firmId, ctx.firmId)),
      db
        .select({ userId: schema.policyAcknowledgments.userId })
        .from(schema.policyAcknowledgments)
        .where(eq(schema.policyAcknowledgments.policyDocumentId, doc.id)),
    ]);
    ackMatrix = { users: firmUsers, acknowledgedIds: new Set(acks.map((a) => a.userId)) };
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI-Use Policy v{doc.version}</h1>
          <p className="text-sm text-muted-foreground">
            {doc.status === "published" ? `Effective ${doc.effectiveDate}` : "Draft — not yet published"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={doc.status === "published" ? "default" : "secondary"}>{doc.status}</Badge>
          {latestEvalRun && (
            <Badge variant={latestEvalRun.passed ? "default" : "destructive"}>
              {latestEvalRun.passed ? "Eval passed" : "Eval flagged issues"}
            </Badge>
          )}
          {doc.status === "draft" && (
            <form action={publishPolicyDocument}>
              <input type="hidden" name="policyDocumentId" value={doc.id} />
              <Button type="submit" size="sm">
                Publish
              </Button>
            </form>
          )}
          {doc.status === "published" &&
            (myAcknowledgment ? (
              <Badge variant="outline" className="gap-1">
                <CheckIcon className="size-3" /> Acknowledged
              </Badge>
            ) : (
              <form action={acknowledgePolicy}>
                <input type="hidden" name="policyDocumentId" value={doc.id} />
                <Button type="submit" size="sm">
                  Acknowledge
                </Button>
              </form>
            ))}
          <Button variant="outline" size="sm" render={<a href={`/policies/${doc.id}/pdf`} />}>
            PDF
          </Button>
          <Button variant="outline" size="sm" render={<a href={`/policies/${doc.id}/docx`} />}>
            DOCX
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {clauses.map((clause) => {
          const findings = findingsByClauseId.get(clause.id) ?? [];
          return (
            <Card key={clause.id} className={clause.isRefusal || findings.length > 0 ? "border-destructive/50" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  §{clause.section}
                  {clause.isRefusal && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangleIcon className="size-3" /> No grounded clause
                    </Badge>
                  )}
                  {!clause.isRefusal && findings.length > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangleIcon className="size-3" /> Eval flagged
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {clause.isRefusal ? (
                  <p className="text-sm text-muted-foreground">{clause.refusalReason}</p>
                ) : (
                  <>
                    <p className="text-sm">{clause.clauseText}</p>
                    {findings.map((f, i) => (
                      <p key={i} className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                        {f.detail}
                      </p>
                    ))}
                    {clause.sourceContent && (
                      <details className="rounded-md border bg-muted/30 p-3 text-xs">
                        <summary className="cursor-pointer font-medium text-muted-foreground">
                          Source: {clause.sourceTitle}
                        </summary>
                        <p className="mt-2 text-muted-foreground">{clause.sourceContent}</p>
                      </details>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {ackMatrix && (
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Firm-wide acknowledgment</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead className="text-center">Acknowledged</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ackMatrix.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.fullName ?? user.email}</TableCell>
                  <TableCell className="text-center">
                    {ackMatrix!.acknowledgedIds.has(user.id) ? (
                      <CheckIcon className="mx-auto size-4 text-primary" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
