import { embed, embedMany, gateway } from "ai";
import { EMBEDDING_DIMENSIONS } from "@/lib/db/schema/corpus";
import { withRateLimitRetry, type RetryMode } from "./retry";

// text-embedding-3-small produces EMBEDDING_DIMENSIONS (1536)-dim vectors —
// keep these in sync if the model changes.
const EMBEDDING_MODEL_ID = "openai/text-embedding-3-small";

function embeddingModel() {
  return gateway.embeddingModel(EMBEDDING_MODEL_ID);
}

export async function embedText(text: string, retryMode: RetryMode = "fast"): Promise<number[]> {
  const { embedding } = await withRateLimitRetry(() => embed({ model: embeddingModel(), value: text }), retryMode);
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected ${EMBEDDING_DIMENSIONS}-dim embedding, got ${embedding.length}`);
  }
  return embedding;
}

export async function embedTexts(texts: string[], retryMode: RetryMode = "fast"): Promise<number[][]> {
  const { embeddings } = await withRateLimitRetry(() => embedMany({ model: embeddingModel(), values: texts }), retryMode);
  return embeddings;
}
