/**
 * Shared-secret authentication for the internal API surface.
 *
 * Every `/api/*` route is gated by `middleware.ts`. A request is authorized when
 * it presents the `INTERNAL_API_SECRET` via either:
 *   - `Authorization: Bearer <secret>`, or
 *   - `x-api-key: <secret>`.
 *
 * Fails closed: if `INTERNAL_API_SECRET` is unset or empty, every request is
 * rejected. The comparison is constant-time to avoid leaking the secret through
 * response timing. This module is Edge-runtime safe (no Node APIs) so it can be
 * imported by Next.js middleware.
 */

/** Constant-time string comparison. Returns false for length mismatch. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Extract the presented API token from request headers, or null if absent. */
export function extractApiToken(headers: Headers): string | null {
  const authorization = headers.get("authorization");
  if (authorization && authorization.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
  }

  const apiKey = headers.get("x-api-key");
  if (apiKey && apiKey.trim().length > 0) {
    return apiKey.trim();
  }

  return null;
}

/** Whether the request carries valid internal API credentials. */
export function isAuthorizedApiRequest(headers: Headers): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return false;
  }

  const token = extractApiToken(headers);
  if (!token) {
    return false;
  }

  return timingSafeEqual(token, secret);
}
