import { prisma } from '@/lib/db';

/**
 * Fixed-window rate limiter backed by Postgres (RateLimitBucket), so every
 * app instance — including each serverless lambda — shares the same counts.
 *
 * Each hit is one atomic INSERT ... ON CONFLICT UPDATE, so concurrent hits
 * cannot both see the old count. If the database is unreachable the limiter
 * falls back to per-process memory rather than failing the request.
 */

type Bucket = { count: number; resetAt: number };

const fallbackBuckets = new Map<string, Bucket>();

// Opportunistically purge expired buckets so the map does not grow unbounded.
function sweep(now: number) {
  if (fallbackBuckets.size < 5000) return;
  for (const [key, bucket] of fallbackBuckets) {
    if (bucket.resetAt <= now) fallbackBuckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function result(count: number, resetAt: number, limit: number, now: number): RateLimitResult {
  if (count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
  }
  return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
}

function memoryHit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const existing = fallbackBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    fallbackBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  existing.count += 1;
  return result(existing.count, existing.resetAt, limit, now);
}

/**
 * Records a hit for `key` and reports whether it is within the limit.
 *
 * @param key         Unique identifier for the caller (e.g. `login:<ip>`).
 * @param limit       Max attempts allowed within the window.
 * @param windowMs    Window length in milliseconds.
 */
export async function rateLimit(key: string, limit = 10, windowMs = 60_000): Promise<RateLimitResult> {
  const now = new Date();
  const freshResetAt = new Date(now.getTime() + windowMs);
  try {
    const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${freshResetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN EXCLUDED."resetAt" ELSE "RateLimitBucket"."resetAt" END
      RETURNING "count", "resetAt"`;
    // Occasional cleanup of expired buckets; never block the request on it.
    if (Math.random() < 0.01) {
      prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: now } } }).catch(() => {});
    }
    const row = rows[0];
    return result(Number(row.count), new Date(row.resetAt).getTime(), limit, now.getTime());
  } catch (error) {
    console.error('Rate limit store unavailable; using in-memory buckets:', error instanceof Error ? error.message : 'unknown error');
    return memoryHit(key, limit, windowMs);
  }
}

/**
 * Whether `key` is already over `limit`, without recording a hit. Lets a
 * route refuse a locked caller up front but count only failed attempts.
 */
export async function rateLimitExceeded(key: string, limit: number): Promise<RateLimitResult | null> {
  const now = Date.now();
  try {
    const row = await prisma.rateLimitBucket.findUnique({ where: { key } });
    if (!row || row.resetAt.getTime() <= now || row.count < limit) return null;
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((row.resetAt.getTime() - now) / 1000)) };
  } catch {
    const bucket = fallbackBuckets.get(key);
    if (!bucket || bucket.resetAt <= now || bucket.count < limit) return null;
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
}

const IP_PATTERN = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * Client IP for rate limiting and login history.
 *
 * X-Forwarded-For is never read: a client can put anything in it and
 * Cloudflare only appends to it. With TRUST_PROXY=cloudflare the app reads
 * CF-Connecting-IP, which Cloudflare always overwrites with the real client
 * address. That is only safe when the app listens on 127.0.0.1 so the tunnel
 * is the sole way in (see DEPLOYMENT.md). With TRUST_PROXY unset on Vercel
 * (VERCEL=1), the platform's x-vercel-forwarded-for is used: Vercel's edge
 * sets it and clients cannot override it. Otherwise there is no reliable
 * address and every caller shares the 'unknown' bucket.
 */
export function getClientIp(request: Request): string {
  if (process.env.TRUST_PROXY === 'cloudflare') {
    const ip = request.headers.get('cf-connecting-ip')?.trim();
    if (ip && IP_PATTERN.test(ip)) return ip;
  } else if (!process.env.TRUST_PROXY && process.env.VERCEL === '1') {
    const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
    if (ip && IP_PATTERN.test(ip)) return ip;
  }
  return 'unknown';
}

/** Clears every bucket. For tests only. */
export async function resetRateLimits() {
  fallbackBuckets.clear();
  await prisma.rateLimitBucket.deleteMany();
}
