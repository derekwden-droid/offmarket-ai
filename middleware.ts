import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedApiRequest } from "@/lib/auth";

/**
 * Authentication gate for the internal API surface.
 *
 * Every `/api/*` route requires the `INTERNAL_API_SECRET` (see `lib/auth.ts`).
 * Unauthenticated requests receive a 401 in the standard error envelope so
 * callers get a consistent shape. The browser UI never calls these routes
 * directly — it reads/writes through server actions — so locking the HTTP API
 * does not affect the app.
 *
 * Exceptions (self-authenticating routes that must bypass the shared secret):
 *   - /api/inngest      — Inngest verifies its own request signatures.
 *   - /api/scrape       — verifies an HMAC signature (SCRAPE_WEBHOOK_SECRET).
 *   - /api/inbound/*    — inbound SMS webhooks verify a provider signature
 *                         (Twilio HMAC-SHA1 / Telnyx Ed25519). Phase 4.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/api/inngest") ||
    pathname.startsWith("/api/scrape") ||
    pathname.startsWith("/api/inbound")
  ) {
    return NextResponse.next();
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
