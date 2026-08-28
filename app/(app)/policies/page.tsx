import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const STATUS_VARIANT: Record<string, "success" | "secondary" | "outline"> = {
  draft: "secondary",
  published: "success",
  superseded: "outline",
};

export default async function PoliciesPage() {
  const ctx = await requireFirmContext();
  const db = getDb();

  const docs = await db
    .select()
    .from(schema.policyDocuments)
    .where(eq(schema.policyDocuments.firmId, ctx.firmId))
    .orderBy(desc(schema.policyDocuments.version));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI-Use Policy</h1>
          <p className="text-sm text-muted-foreground">
            Generated from Circular 230, with every clause traceable to a specific source citation.
          </p>
        </div>
        <Button render={<Link href="/policies/new" />}>Generate new version</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Version</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Effective date</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((doc, i) => (
            <TableRow key={doc.id} style={{ animationDelay: `${i * 40}ms` }} className="animate-row-settle">
              <TableCell>v{doc.version}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[doc.status] ?? "secondary"}>{doc.status}</Badge>
              </TableCell>
              <TableCell>{doc.effectiveDate ?? "—"}</TableCell>
              <TableCell className="text-right">
                <Link href={`/policies/${doc.id}`} className="text-sm underline underline-offset-4">
                  View
                </Link>
              </TableCell>
            </TableRow>
          ))}
          {docs.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No policy generated yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
