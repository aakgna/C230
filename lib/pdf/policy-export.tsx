import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

export type PolicyExportClause = {
  section: string;
  clauseText: string | null;
  isRefusal: boolean;
  refusalReason: string | null;
};

export type PolicyExportDoc = {
  firmName: string;
  version: number;
  status: string;
  effectiveDate: string | null;
};

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#666", marginBottom: 24 },
  clauseBlock: { marginBottom: 16 },
  sectionHeading: { fontSize: 12, fontWeight: 700, marginBottom: 4 },
  clauseText: { lineHeight: 1.5 },
  refusalText: { lineHeight: 1.5, color: "#991b1b", fontStyle: "italic" },
});

function PolicyDocument({ doc, clauses }: { doc: PolicyExportDoc; clauses: PolicyExportClause[] }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{doc.firmName} — AI-Use Policy</Text>
        <Text style={styles.subtitle}>
          Version {doc.version} · {doc.status}
          {doc.effectiveDate ? ` · Effective ${doc.effectiveDate}` : ""}
        </Text>
        {clauses.map((clause) => (
          <View key={clause.section} style={styles.clauseBlock}>
            <Text style={styles.sectionHeading}>Circular 230 §{clause.section}</Text>
            {clause.isRefusal ? (
              <Text style={styles.refusalText}>
                No corpus-grounded clause available for this section: {clause.refusalReason}
              </Text>
            ) : (
              <Text style={styles.clauseText}>{clause.clauseText}</Text>
            )}
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function renderPolicyPdf(doc: PolicyExportDoc, clauses: PolicyExportClause[]): Promise<Buffer> {
  return renderToBuffer(<PolicyDocument doc={doc} clauses={clauses} />);
}
