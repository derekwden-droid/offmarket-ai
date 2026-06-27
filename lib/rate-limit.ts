/**
 * Edge-safe, in-memory fixed-window rate limiter (Phase 6).
 *
 * Applied by `middleware.ts` to the public, self-authenticating routes
 * (/api/scrape, /api/inbound/*, /api/unsubscribe, /api/inngest) which are NOT
 * behind the INTERNAL_API_SECRET gate and are therefore reachable by anyone.
 * The shared-secret routes are already protected, so this focuses abuse
 * protection where it is actually needed.
 *
 * Constraints: middleware runs on the Edge runtime, so this uses only a
 * module-level Map + Date.now() — no Node APIs, no external store. State is
 * per-isolate (not global), which is the right trade-off for cheap burst
 * protection without a Redis dependency; it caps a single hot isolate and is
 * fail-open by construction. For strict global limits, point `RATE_LIMIT_STORE`
 * at a shared store in a future iteration (documented in RUNBOOK.md).
 *
 * Config:
 *   RATE_LIMIT_ENABLED      "false" disables entirely (default enabled)
 *   RATE_LIMIT_WINDOW_MS    window length in ms (default 60000)
 *   RATE_LIMIT_MAX          max requests per window per key (default 60)
 */

interface Counter {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Counter>();

/** Periodically evict expired counters so the Map cannot grow unbounded. */
function sweep(now: number): void {
  if (buckets.size < 5000) return;
  for (const [key, counter] of buckets) {
    if (counter.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitConfig {
  enabled: boolean;
  windowMs: number;
  max: number;
}

/** Resolve limiter config from env with safe defaults. */
export function rateLimitConfig(): RateLimitConfig {
  const enabled = (process.env.RATE_LIMIT_ENABLED ?? "true").toLowerCase() !== "false";
  const windowMs = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "", 10);
  const max = Number.parseInt(process.env.RATE_LIMIT_MAX ?? "", 10);
  return {
    enabled,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60_000,
    max: Number.isFinite(max) && max > 0 ? max : 60,
  };
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets (for Retry-After / X-RateLimit-Reset). */
  retryAfterSeconds: number;
}

/**
 * Account one request against `key`. Pure given (key, config, now) so it is
 * unit-testable. Returns whether the request is allowed plus header values.
 */
export function rateLimit(
  key: string,
  config: RateLimitConfig = rateLimitConfig(),
  now: number = Date.now(),
): RateLimitResult {
  if (!config.enabled) {
    return { allowed: true, limit: config.max, remaining: config.max, retryAfterSeconds: 0 };
  }

  sweep(now);
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, limit: config.max, remaining: config.max - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const remaining = config.max - existing.count;
  if (remaining < 0) {
    return {
      allowed: false,
      limit: config.max,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, limit: config.max, remaining, retryAfterSeconds: 0 };
}

/**
 * Derive a best-effort client key from request headers. Prefers the left-most
 * x-forwarded-for hop (the original client on Vercel), falling back to other
 * proxy headers, then a constant so the limiter still functions.
 */
export function clientKey(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

/** Reset all counters. Test-only helper. */
export function __resetRateLimitStore(): void {
  buckets.clear();
}
