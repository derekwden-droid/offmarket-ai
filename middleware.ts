import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedApiRequest } from "@/lib/auth";
import { rateLimit, clientKey } from "@/lib/rate-limit";

/**
 * Authentication gate + abuse protection for the internal API surface.
 *
 * Every `/api/*` route requires the `INTERNAL_API_SECRET` (see `lib/auth.ts`).
 * Unauthenticated requests receive a 401 in the standard error envelope so
 * callers get a consistent shape. The browser UI never calls these routes
 * directly — it reads/writes through server actions — so locking the HTTP API
 * does not affect the app.
 *
 * Exceptions (self-authenticating / public routes that bypass the shared secret):
 *   - /api/inngest      — Inngest verifies its own request signatures.
 *   - /api/scrape       — verifies an HMAC signature (SCRAPE_WEBHOOK_SECRET).
 *   - /api/inbound/*    — inbound SMS webhooks verify a provider signature
 *                         (Twilio HMAC-SHA1 / Telnyx Ed25519). Phase 4.
 *   - /api/unsubscribe  — one-click CAN-SPAM unsubscribe; authenticated by a
 *                         per-email HMAC token, must work without a login. Phase 5.
 *
 * Phase 6: because those four routes are reachable without the shared secret,
 * they are additionally rate-limited per client IP (see `lib/rate-limit.ts`) to
 * blunt abuse. The signature/token checks inside each route remain the real
 * authentication; the limiter only caps request volume.
 */

const PUBLIC_PREFIXES = [
  "/api/inngest",
  "/api/scrape",
  "/api/inbound",
  "/api/unsubscribe",
] as const;

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Build a 429 in the standard error envelope with rate-limit headers. */
function tooManyRequests(retryAfterSeconds: number, limit: number): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please retry later.",
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    // Rate-limit per IP + route family so one noisy route cannot exhaust another.
    const family = PUBLIC_PREFIXES.find((p) => pathname.startsWith(p)) ?? "public";
    const result = rateLimit(`${family}:${clientKey(request.headers)}`);
    if (!result.allowed) {
      return tooManyRequests(result.retryAfterSeconds, result.limit);
    }
    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(result.limit));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    return response;
  }

  if (isAuthorizedApiRequest(request.headers)) {
    return NextResponse.next();
  }

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid API credentials.",
      },
    },
    { status: 401 },
  );
}

export const config = {
  matcher: ["/api/:path*"],
};
