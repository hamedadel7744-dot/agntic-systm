/** Fixed-window per-tenant rate limiter. In-memory per serverless instance: it is a
 * throttle against bursts, while the token hard cap remains the real spending limit. */
export interface RateBucket {
  count: number;
  resetAt: number;
}

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
