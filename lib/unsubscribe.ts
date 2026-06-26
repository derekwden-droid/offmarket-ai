import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * One-click unsubscribe token (CAN-SPAM).
 *
 * Every marketing email carries an unsubscribe link `/api/unsubscribe?e=<email>
 * &t=<token>` where the token is an HMAC of the normalized email under
 * `UNSUBSCRIBE_SECRET`. The endpoint verifies the token before suppressing, so
 * the link cannot be forged to suppress an arbitrary address, and it requires no
 * login (one click). Pure — unit-tested directly.
 */

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/** HMAC-SHA256 hex token binding the email to UNSUBSCRIBE_SECRET. */
export function signUnsubscribeToken(email: string, secret: string): string {
  return createHmac("sha256", secret).update(normalize(email)).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** Verify a token. Fails closed when the secret is unset. */
export function verifyUnsubscribeToken(
  email: string,
  token: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !token) return false;
  return safeEqualHex(token, signUnsubscribeToken(email, secret));
}

/** Build the absolute unsubscribe URL for an email (used in the footer). */
export function buildUnsubscribeUrl(
  baseUrl: string,
  email: string,
  secret: string,
): string {
  const token = signUnsubscribeToken(email, secret);
  const params = new URLSearchParams({ e: normalize(email), t: token });
  return `${baseUrl.replace(/\/$/, "")}/api/unsubscribe?${params.toString()}`;
}
