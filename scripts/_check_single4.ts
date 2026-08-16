import { generateObject } from "ai";
import { z } from "zod";
import { withRateLimitRetry } from "@/lib/rag/retry";
const schema = z.object({
  isRefusal: z.boolean(),
  refusalReason: z.string().nullable(),
  clauseText: z.string().nullable(),
  citedChunkIndex: z.number().int().nullable(),
});
async function main() {
  const model = "alibaba/qwen3.7-flash";
  try {
    const { object } = await withRateLimitRetry(() => generateObject({
      model,
      schema,
      system: "Only use the provided source text. If it doesn't support a clause, set isRefusal=true.",
      prompt: "Section: 10.36\nSource context:\n[chunk 0] A practitioner must maintain adequate firm procedures for AI tool use.",
    }));
    console.log(`${model}: OK ->`, JSON.stringify(object));
  } catch (e) {
    console.log(`${model}: FAILED ->`, (e as Error).message.slice(0, 300));
  }
}
main().then(() => process.exit(0));
