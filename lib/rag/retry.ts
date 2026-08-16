import { RetryError } from "ai";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasStatusCode429(error: unknown): boolean {
  return typeof error === "object" && error !== null && "statusCode" in error && (error as { statusCode: unknown }).statusCode === 429;
}

function isRateLimitError(error: unknown): boolean {
  if (hasStatusCode429(error)) {
    return true;
  }
  // The AI SDK's own internal retries (a handful of fast attempts) get
  // exhausted and rethrown wrapped in a RetryError — the 429 is on
  // .lastError (a GatewayRateLimitError, not an APICallError — both expose
  // statusCode directly, so we check that rather than a specific class).
  if (RetryError.isInstance(error)) {
    return isRateLimitError(error.lastError);
  }
  return false;
}

export type RetryMode = "fast" | "patient";

const RETRY_PROFILES: Record<RetryMode, { attempts: number; baseDelayMs: number }> = {
  // Default for calls made on a live request path (Server Actions). A 429
  // from the free tier is a hard access-tier block, not a burst — riding it
  // out with a long backoff just spends the function's time budget
  // discovering the same failure slower. A couple of quick retries rule out
  // a genuine one-off blip, then surface the error so the UI can show it.
  fast: { attempts: 2, baseDelayMs: 1500 },
  // For bursty background contexts (seed scripts, standalone eval runs)
  // where nothing is waiting on an HTTP response and riding out the free
  // tier's limit is worth the wall-clock cost.
  patient: { attempts: 6, baseDelayMs: 10000 },
};

/**
 * The AI Gateway free/low tier rate-limits fairly aggressively, tighter than
 * the AI SDK's own built-in retry (a few fast attempts) can ride out. This
 * backs off much harder specifically for 429s. Pass "patient" from bursty
 * background contexts (seed scripts, standalone eval runs); interactive
 * request-path callers should keep the "fast" default.
 */
export async function withRateLimitRetry<T>(fn: () => Promise<T>, mode: RetryMode = "fast"): Promise<T> {
  const { attempts, baseDelayMs } = RETRY_PROFILES[mode];
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRateLimitError(error) || attempt === attempts - 1) {
        throw error;
      }
      const delayMs = baseDelayMs * (attempt + 1);
      console.warn(`Rate-limited, retrying in ${delayMs}ms (attempt ${attempt + 1}/${attempts})`);
      await sleep(delayMs);
    }
  }
  throw new Error("unreachable");
}
