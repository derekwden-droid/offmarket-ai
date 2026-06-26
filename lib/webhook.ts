import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 verification for the inbound `/api/scrape` webhook.
 *
 * External scrapers/providers authenticate by signing each delivery with the
 * shared `SCRAPE_WEBHOOK_SECRET` rather than holding the internal API secret.
 * The signature covers `"{timestamp}.{rawBody}"` so the body cannot be altered
 * and old deliveries cannot be replayed outside the tolerance window.
 *
 * Header contract:
 *   x-scrape-timestamp: <unix seconds>
 *   x-scrape-signature: sha256=<hex>   (the "sha256=" prefix is optional)
 */

const DEFAULT_TOLERANCE_SEC = 300;

export interface VerifyInput {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string | undefined;
  toleranceSec?: number;
  /** Injectable for tests; defaults to the real clock. */
  nowSec?: number;
}

export interface VerifyResult {
  valid: boolean;
  reason: string;
}

/** Compute the hex signature for a payload (also used by senders/tests). */
export function signWebhookPayload(
  rawBody: string,
  secret: string,
  timestamp: string | number,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** Verify a webhook delivery. Fails closed when the secret is unset. */
export function verifyWebhookSignature(input: VerifyInput): VerifyResult {
  const { rawBody, signature, timestamp, secret } = input;
  const tolerance = input.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);

  if (!secret) {
    return { valid: false, reason: "Webhook secret is not configured." };
  }
  if (!signature || !timestamp) {
    return { valid: false, reason: "Missing signature or timestamp header." };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { valid: false, reason: "Malformed timestamp header." };
  }
  if (Math.abs(nowSec - ts) > tolerance) {
    return { valid: false, reason: "Signature timestamp outside tolerance." };
  }

  const provided = signature.startsWith("sha256=")
    ? signature.slice("sha256=".length)
    : signature;
  const expected = signWebhookPayload(rawBody, secret, timestamp);

  if (!safeEqualHex(provided, expected)) {
    return { valid: false, reason: "Signature mismatch." };
  }
  return { valid: true, reason: "ok" };
}
