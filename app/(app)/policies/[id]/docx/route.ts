import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireFirmContext } from "@/lib/auth/firm-context";
import { renderPolicyDocx } from "@/lib/pdf/policy-export-docx";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireFirmContext();
  const db = getDb();

  const [doc] = await db
    .select({
      version: schema.policyDocuments.version,
      status: schema.policyDocuments.status,
      effectiveDate: schema.policyDocuments.effectiveDate,
      firmName: schema.firms.name,
    })
    .from(schema.policyDocuments)
    .innerJoin(schema.firms, eq(schema.policyDocuments.firmId, schema.firms.id))
    .where(and(eq(schema.policyDocuments.id, id), eq(schema.policyDocuments.firmId, ctx.firmId)))
    .limit(1);
  if (!doc) {
    notFound();
  }

  const clauses = await db
    .select({
      section: schema.policyDocumentClauses.circular230Section,
      clauseText: schema.policyDocumentClauses.clauseText,
      isRefusal: schema.policyDocumentClauses.isRefusal,
      refusalReason: schema.policyDocumentClauses.refusalReason,
    })
    .from(schema.policyDocumentClauses)
    .where(eq(schema.policyDocumentClauses.policyDocumentId, id))
    .orderBy(asc(schema.policyDocumentClauses.clauseOrder));

  const buffer = await renderPolicyDocx(doc, clauses);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="ai-use-policy-v${doc.version}.docx"`,
    },
  });
}
