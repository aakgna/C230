import { requireFirmContext } from "@/lib/auth/firm-context";
import { generateAuditReport } from "@/lib/verification/audit-report";

export async function GET() {
  const ctx = await requireFirmContext();
  const report = await generateAuditReport(ctx.firmId, ctx.userId);

  return new Response(new Uint8Array(report.pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="audit-report-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  });
}
