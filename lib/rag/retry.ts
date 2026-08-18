import { RetryError } from "ai";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 429 (rate limit) plus the 5xx statuses that mean "the provider/gateway had
// a transient hiccup, not that anything is wrong with the request" — free
// tier models have been observed returning 503 "Service temporarily
// unavailable" independent of rate limiting.
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function hasRetryableStatusCode(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    RETRYABLE_STATUS_CODES.has((error as { statusCode: unknown }).statusCode as number)
  );
}

function isRetryableGatewayError(error: unknown): boolean {
  if (hasRetryableStatusCode(error)) {
    return true;
  }
  // The AI SDK's own internal retries (a handful of fast attempts) get
  // exhausted and rethrown wrapped in a RetryError — the status code is on
  // .lastError (a GatewayRateLimitError/GatewayInternalServerError, not an
  // APICallError — both expose statusCode directly, so we check that rather
  // than a specific class).
  if (RetryError.isInstance(error)) {
    return isRetryableGatewayError(error.lastError);
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
 * The AI Gateway free/low tier rate-limits fairly aggressively, and free-tier
 * models have also been observed returning transient 5xx errors — both
 * tighter/flakier than the AI SDK's own built-in retry (a few fast attempts)
 * can ride out. This backs off much harder specifically for those cases.
 * Pass "patient" from bursty background contexts (seed scripts, standalone
 * eval runs); interactive request-path callers should keep the "fast"
 * default.
 */
export async function withRateLimitRetry<T>(fn: () => Promise<T>, mode: RetryMode = "fast"): Promise<T> {
  const { attempts, baseDelayMs } = RETRY_PROFILES[mode];
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryableGatewayError(error) || attempt === attempts - 1) {
        throw error;
      }
      const delayMs = baseDelayMs * (attempt + 1);
      console.warn(`Retryable gateway error, retrying in ${delayMs}ms (attempt ${attempt + 1}/${attempts})`);
      await sleep(delayMs);
    }
  }
  throw new Error("unreachable");
}
