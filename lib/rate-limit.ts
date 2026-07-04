/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Intended for throttling sensitive endpoints like login where even a coarse
 * limit meaningfully slows brute-force attempts. This is per-process state, so
 * in a multi-instance deployment it should be backed by a shared store (Redis)
 * for hard guarantees — but it is a strict improvement over no limit at all and
 * keeps single-instance / typical pharmacy deployments protected.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Opportunistically purge expired buckets so the map does not grow unbounded.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Records a hit for `key` and reports whether it is within the limit.
 *
 * @param key         Unique identifier for the caller (e.g. `login:<ip>`).
 * @param limit       Max attempts allowed within the window.
 * @param windowMs    Window length in milliseconds.
 */
export function rateLimit(key: string, limit = 10, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/**
 * Best-effort client IP extraction from standard proxy headers.
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}
