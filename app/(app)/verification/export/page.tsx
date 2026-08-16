import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { verifyChain } from "@/lib/verification/hash-chain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function ExportAuditReportPage() {
  const ctx = await requireFirmContext();
  const db = getDb();

  const chainResult = await verifyChain(ctx.firmId);
  const priorExports = await db
    .select()
    .from(schema.auditReportExports)
    .where(eq(schema.auditReportExports.firmId, ctx.firmId));

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Export audit report</h1>
        <p className="text-sm text-muted-foreground">
          A signed PDF listing every verification log entry and the current hash-chain integrity verdict.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current chain status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant={chainResult.valid ? "default" : "destructive"}>
            {chainResult.valid ? "Chain intact" : "Chain integrity FAILED"}
          </Badge>
          <p className="text-sm text-muted-foreground">
            {chainResult.valid
              ? `${chainResult.entryCount} entries verified.`
              : `Invalid at sequence_no=${chainResult.failedAtSequenceNo}: ${chainResult.reason}`}
          </p>
          <Button render={<Link href="/verification/export/pdf" />}>Download signed PDF</Button>
        </CardContent>
      </Card>

      {priorExports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Export history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {priorExports.map((exp) => (
              <div key={exp.id} className="flex justify-between text-muted-foreground">
                <span>{exp.generatedAt.toLocaleString()}</span>
                <Badge variant={exp.chainValid ? "default" : "destructive"}>{exp.chainValid ? "valid" : "invalid"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
