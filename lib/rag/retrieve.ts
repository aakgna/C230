import { and, cosineDistance, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { embedText } from "./embed";
import type { RetryMode } from "./retry";

// Below this similarity, we don't trust the match enough to ground a policy
// clause on it — retrieveForSection returns empty, which the caller (the
// policy generator) must treat as "no coverage" and refuse rather than
// generate an unsupported claim.
const MIN_SIMILARITY = 0.3;

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  sourceTitle: string;
  sectionRef: string;
  content: string;
  similarity: number;
};

/**
 * Retrieves the top-k corpus chunks for a query, restricted to chunks whose
 * source document is currently in force (effective now, not expired) and
 * above a minimum similarity threshold. Returns [] when nothing qualifies —
 * that's the refusal signal, not an error.
 */
export async function retrieveForSection(query: string, k = 3, retryMode?: RetryMode): Promise<RetrievedChunk[]> {
  const db = getDb();
  const queryEmbedding = await embedText(query, retryMode);

  const similarity = sql<number>`1 - (${cosineDistance(schema.corpusChunks.embedding, queryEmbedding)})`;
  const today = sql`current_date`;

  const rows = await db
    .select({
      chunkId: schema.corpusChunks.id,
      documentId: schema.corpusChunks.documentId,
      content: schema.corpusChunks.content,
      sourceTitle: schema.corpusDocuments.sourceTitle,
      sectionRef: schema.corpusDocuments.sectionRef,
      similarity,
    })
    .from(schema.corpusChunks)
    .innerJoin(schema.corpusDocuments, eq(schema.corpusChunks.documentId, schema.corpusDocuments.id))
    .where(
      and(
        lte(schema.corpusDocuments.effectiveDate, today),
        or(isNull(schema.corpusDocuments.expirationDate), gte(schema.corpusDocuments.expirationDate, today))
      )
    )
    .orderBy(desc(similarity))
    .limit(k);

  return rows.filter((row) => row.similarity >= MIN_SIMILARITY);
}

/**
 * Retrieves chunks scoped to a specific Circular 230 section reference (e.g.
 * "10.35"), used by the policy generator where the section is already known
 * rather than inferred from a free-text query.
 */
export async function retrieveForSectionRef(sectionRef: string, query: string, k = 3, retryMode?: RetryMode): Promise<RetrievedChunk[]> {
  const db = getDb();
  const queryEmbedding = await embedText(query, retryMode);

  const similarity = sql<number>`1 - (${cosineDistance(schema.corpusChunks.embedding, queryEmbedding)})`;
  const today = sql`current_date`;

  const rows = await db
    .select({
      chunkId: schema.corpusChunks.id,
      documentId: schema.corpusChunks.documentId,
      content: schema.corpusChunks.content,
      sourceTitle: schema.corpusDocuments.sourceTitle,
      sectionRef: schema.corpusDocuments.sectionRef,
      similarity,
    })
    .from(schema.corpusChunks)
    .innerJoin(schema.corpusDocuments, eq(schema.corpusChunks.documentId, schema.corpusDocuments.id))
    .where(
      and(
        eq(schema.corpusDocuments.sectionRef, sectionRef),
        lte(schema.corpusDocuments.effectiveDate, today),
        or(isNull(schema.corpusDocuments.expirationDate), gte(schema.corpusDocuments.expirationDate, today))
      )
    )
    .orderBy(desc(similarity))
    .limit(k);

  return rows.filter((row) => row.similarity >= MIN_SIMILARITY);
}
