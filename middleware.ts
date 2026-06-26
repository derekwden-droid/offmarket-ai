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
 * Exception: `/api/inngest` is the queue's own endpoint. Inngest authenticates
 * its calls with `INNGEST_SIGNING_KEY` (request-signature verification), so the
 * shared-secret gate must let it through or background jobs would never run.
 */
export function middleware(request: NextRequest): NextResponse {
  // These routes authenticate callers themselves and must bypass the
  // shared-secret gate: Inngest verifies its own request signatures, and
  // /api/scrape verifies an HMAC signature (SCRAPE_WEBHOOK_SECRET).
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/api/inngest") ||
    pathname.startsWith("/api/scrape")
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
