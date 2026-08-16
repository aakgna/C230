import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { PolicyExportClause, PolicyExportDoc } from "./policy-export";

export async function renderPolicyDocx(doc: PolicyExportDoc, clauses: PolicyExportClause[]): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: `${doc.firmName} — AI-Use Policy`, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Version ${doc.version} · ${doc.status}${doc.effectiveDate ? ` · Effective ${doc.effectiveDate}` : ""}`,
          italics: true,
        }),
      ],
    }),
  ];

  for (const clause of clauses) {
    children.push(new Paragraph({ text: `Circular 230 §${clause.section}`, heading: HeadingLevel.HEADING_2 }));
    if (clause.isRefusal) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `No corpus-grounded clause available for this section: ${clause.refusalReason}`,
              italics: true,
            }),
          ],
        })
      );
    } else {
      children.push(new Paragraph({ text: clause.clauseText ?? "" }));
    }
  }

  const document = new Document({ sections: [{ children }] });
  return Packer.toBuffer(document);
}
