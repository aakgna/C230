import { generateObject } from "ai";
import { z } from "zod";
import { withRateLimitRetry } from "@/lib/rag/retry";
const schema = z.object({ ok: z.boolean() });
async function main() {
  const model = process.argv[2] ?? "openai/gpt-4o-mini";
  try {
    const { object } = await withRateLimitRetry(() => generateObject({ model, schema, prompt: "Return ok:true" }));
    console.log(`${model}: OK ->`, JSON.stringify(object));
  } catch (e) {
    console.log(`${model}: FAILED ->`, (e as Error).message.slice(0, 200));
  }
}
main().then(() => process.exit(0));
