import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedApiRequest } from "@/lib/auth";

/**
 * Authentication gate for the internal API surface.
 *
 * Every `/api/*` route requires the `INTERNAL_API_SECRET` (see `lib/auth.ts`).
 * Unauthenticated requests receive a 401 in the standard error envelope so
 * callers get a consistent shape. The browser UI never calls these routes
 * directly — it reads dashboard data through a server action — so locking the
 * HTTP API does not affect the app.
 */
export function middleware(request: NextRequest): NextResponse {
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
