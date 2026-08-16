import { pgTable, uuid, text, timestamp, date, integer, boolean, index } from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";

// text-embedding-3-small produces 1536-dim vectors.
export const EMBEDDING_DIMENSIONS = 1536;

export const corpusDocuments = pgTable("corpus_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceTitle: text("source_title").notNull(),
  sectionRef: text("section_ref").notNull(), // e.g. "31 CFR 10.35"
  versionLabel: text("version_label"),
  effectiveDate: date("effective_date").notNull(),
  expirationDate: date("expiration_date"), // null = still in force
  // Always true in Phase 0 — this corpus is placeholder/synthetic text, not real legal text.
  isSynthetic: boolean("is_synthetic").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const corpusChunks = pgTable(
  "corpus_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => corpusDocuments.id),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("corpus_chunks_embedding_hnsw").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ]
);
