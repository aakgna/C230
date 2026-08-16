import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { verifyChain } from "@/lib/verification/hash-chain";
import { CHECKLIST_ITEMS, type ChecklistItemsReviewed } from "@/lib/verification/checklist-definitions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckIcon, XIcon } from "lucide-react";

export default async function VerificationEntryDetailPage(props: PageProps<"/verification/[id]">) {
  const { id } = await props.params;
  const ctx = await requireFirmContext();
  const db = getDb();

  const [entry] = await db
    .select({
      id: schema.verificationLog.id,
      sequenceNo: schema.verificationLog.sequenceNo,
      priorHash: schema.verificationLog.priorHash,
      entryHash: schema.verificationLog.entryHash,
      taskCategory: schema.verificationLog.taskCategory,
      outcome: schema.verificationLog.outcome,
      flagReason: schema.verificationLog.flagReason,
      checklistItemsReviewed: schema.verificationLog.checklistItemsReviewed,
      aiOutputGeneratedAt: schema.verificationLog.aiOutputGeneratedAt,
      reviewCompletedAt: schema.verificationLog.reviewCompletedAt,
      deliveredToClientAt: schema.verificationLog.deliveredToClientAt,
      reviewerRole: schema.verificationLog.reviewerRole,
      amendsEntryId: schema.verificationLog.amendsEntryId,
      toolName: schema.aiToolRegister.toolName,
      practitionerName: schema.users.fullName,
    })
    .from(schema.verificationLog)
    .innerJoin(schema.aiToolRegister, eq(schema.verificationLog.aiToolId, schema.aiToolRegister.id))
    .innerJoin(schema.users, eq(schema.verificationLog.practitionerId, schema.users.id))
    .where(and(eq(schema.verificationLog.id, id), eq(schema.verificationLog.firmId, ctx.firmId)))
    .limit(1);

  if (!entry) {
    notFound();
  }

  const chainResult = await verifyChain(ctx.firmId);
  const checklist = entry.checklistItemsReviewed as ChecklistItemsReviewed;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Verification entry #{entry.sequenceNo}</h1>
        <Badge variant={chainResult.valid ? "default" : "destructive"}>
          {chainResult.valid ? "Chain intact" : "Chain integrity FAILED"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Practitioner" value={entry.practitionerName ?? "—"} />
          <Row label="AI tool" value={entry.toolName} />
          <Row label="Task category" value={entry.taskCategory.replace(/_/g, " ")} />
          <Row label="Reviewer role" value={entry.reviewerRole.replace("_", " ")} />
          <Row label="Outcome" value={<Badge>{entry.outcome}</Badge>} />
          {entry.flagReason && <Row label="Flag reason" value={entry.flagReason} />}
          <Row label="AI output generated" value={entry.aiOutputGeneratedAt.toLocaleString()} />
          <Row label="Review completed" value={entry.reviewCompletedAt.toLocaleString()} />
          {entry.deliveredToClientAt && <Row label="Delivered to client" value={entry.deliveredToClientAt.toLocaleString()} />}
          {entry.amendsEntryId && <Row label="Amends entry" value={entry.amendsEntryId} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {CHECKLIST_ITEMS.map((item) => (
            <div key={item.key} className="flex items-center gap-2 text-sm">
              {checklist[item.key] ? (
                <CheckIcon className="size-4 text-primary" />
              ) : (
                <XIcon className="size-4 text-muted-foreground" />
              )}
              {item.label}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hash chain</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <Row label="Sequence no." value={String(entry.sequenceNo)} />
          <Row label="Prior hash" value={<code className="break-all">{entry.priorHash}</code>} />
          <Row label="Entry hash" value={<code className="break-all">{entry.entryHash}</code>} />
          <Separator className="my-2" />
          <p className="text-muted-foreground">
            {chainResult.valid
              ? `Firm chain verified: ${chainResult.entryCount} entries, tip ${chainResult.tipHash.slice(0, 16)}…`
              : `Firm chain INVALID at sequence_no=${chainResult.failedAtSequenceNo}: ${chainResult.reason}`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
