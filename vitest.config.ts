import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // The RAG tests make live AI Gateway calls, which can trigger multiple
    // rate-limit backoff retries (see lib/rag/retry.ts) — 20s wasn't enough
    // headroom for that on a constrained tier.
    testTimeout: 60000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
