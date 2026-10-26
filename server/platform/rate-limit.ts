/** Fixed-window per-tenant rate limiter. In-memory per serverless instance: it is a
 * throttle against bursts, while the token hard cap remains the real spending limit. */
export interface RateBucket {
  count: number;
  resetAt: number;
}

/** Shared admission state for run executions: POST /v1/runs and the tRPC
 * platform.run mutation draw from the same per-tenant buckets so one valid key
 * cannot multiply the advertised limit by using both surfaces. */
export const RUNS_RATE_LIMIT_PER_MIN = Number(process.env.RUNS_RATE_LIMIT_PER_MIN ?? 60);
export const runsRateBuckets = new Map<string, RateBucket>();

export function checkRateLimit(
  buckets: Map<string, RateBucket>,
  key: string,
  limit: number,
  nowMs: number = Date.now()
): { allowed: boolean; retryAfterSec: number } {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < nowMs) {
    buckets.set(key, { count: 1, resetAt: nowMs + 60_000 });
    return { allowed: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000)) };
  }
  return { allowed: true, retryAfterSec: 0 };
}
