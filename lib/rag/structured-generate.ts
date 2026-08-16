import { generateText } from "ai";
import type { z } from "zod";
import { withRateLimitRetry, type RetryMode } from "./retry";

/**
 * Structured output via generateObject (JSON-schema/tool-calling mode) isn't
 * reliably available across AI Gateway free-tier models — some 400 on the
 * schema itself, others appear to rate-limit that request shape specifically
 * even when plain generateText on the same model succeeds. This gets JSON
 * out of any model that can follow instructions: ask for raw JSON in the
 * prompt, strip markdown fences defensively, then validate with the same
 * Zod schema we'd have passed to generateObject.
 */
export async function generateJsonObject<T>(options: {
  model: string;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  retryMode?: RetryMode;
}): Promise<T> {
  const jsonInstruction = `\n\nRespond with ONLY a raw JSON object (no markdown code fences, no explanation before or after) that validates against this shape: ${options.schema.description ?? "the required schema"}.`;

  const { text } = await withRateLimitRetry(
    () =>
      generateText({
        model: options.model,
        system: options.system + jsonInstruction,
        prompt: options.prompt,
      }),
    options.retryMode
  );

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch {
    throw new Error(`Model did not return valid JSON: ${text.slice(0, 200)}`);
  }

  return options.schema.parse(parsedJson);
}
