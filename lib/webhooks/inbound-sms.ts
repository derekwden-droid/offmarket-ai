import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";

/**
 * Inbound SMS webhook verification — provider-agnostic (Twilio + Telnyx).
 *
 * These are the keys to the suppression backbone: a forged inbound could fake a
 * STOP (denial of service) or, worse, a START to un-suppress someone. So every
 * inbound delivery is cryptographically verified before we touch the ledger.
 * All functions are pure (no I/O) so they unit-test directly.
 */

export type InboundProvider = "twilio" | "telnyx";

export interface InboundSms {
  provider: InboundProvider;
  /** The recipient (sender of the inbound text), e.g. the property owner. */
  from: string;
  /** Our number that received it. */
  to: string;
  body: string;
  providerSid: string | null;
}

// --------------------------------------------------------------------------
// Twilio — HMAC-SHA1 over (URL + sorted POST params), base64.
// --------------------------------------------------------------------------

/** Build the exact string Twilio signs: full URL + each sorted key/value. */
export function buildTwilioSignatureBase(
  url: string,
  params: Record<string, string>,
): string {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  return data;
}

function safeEqualUtf8(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Compute the Twilio X-Twilio-Signature value (exported for senders/tests). */
export function computeTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
): string {
  const data = buildTwilioSignatureBase(url, params);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

export function verifyTwilioSignature(input: {
  url: string;
  params: Record<string, string>;
  signature: string | null;
  authToken: string | undefined;
}): boolean {
  if (!input.authToken || !input.signature) return false; // fail closed
  const expected = computeTwilioSignature(input.url, input.params, input.authToken);
  return safeEqualUtf8(expected, input.signature);
}

// --------------------------------------------------------------------------
// Telnyx — Ed25519 over `${timestamp}|${rawBody}`.
// --------------------------------------------------------------------------

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Wrap a raw 32-byte base64 Ed25519 public key into a verifiable KeyObject. */
export function ed25519PublicKeyFromBase64(publicKeyBase64: string) {
  const raw = Buffer.from(publicKeyBase64, "base64");
  const der = Buffer.concat([ED25519_SPKI_PREFIX, raw]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}

const DEFAULT_TELNYX_TOLERANCE_SEC = 300;

export function verifyTelnyxSignature(input: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  publicKeyBase64: string | undefined;
  toleranceSec?: number;
  nowSec?: number;
}): boolean {
  const { rawBody, signature, timestamp, publicKeyBase64 } = input;
  if (!publicKeyBase64 || !signature || !timestamp) return false; // fail closed

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSec ?? DEFAULT_TELNYX_TOLERANCE_SEC;
  if (Math.abs(nowSec - ts) > tolerance) return false; // replay window

  try {
    const key = ed25519PublicKeyFromBase64(publicKeyBase64);
    const message = Buffer.from(`${timestamp}|${rawBody}`, "utf8");
    const sig = Buffer.from(signature, "base64");
    return verify(null, message, key, sig);
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------
// Normalization to a single inbound shape.
// --------------------------------------------------------------------------

/** Parse a verified Twilio form payload into the common inbound shape. */
export function parseTwilioInbound(params: Record<string, string>): InboundSms {
  return {
    provider: "twilio",
    from: params.From ?? "",
    to: params.To ?? "",
    body: params.Body ?? "",
    providerSid: params.MessageSid ?? params.SmsSid ?? null,
  };
}

interface TelnyxInboundPayload {
  data?: {
    payload?: {
      from?: { phone_number?: string };
      to?: Array<{ phone_number?: string }>;
      text?: string;
      id?: string;
    };
  };
}

/** Parse a verified Telnyx JSON payload into the common inbound shape. */
export function parseTelnyxInbound(body: TelnyxInboundPayload): InboundSms {
  const payload = body.data?.payload;
  return {
    provider: "telnyx",
    from: payload?.from?.phone_number ?? "",
    to: payload?.to?.[0]?.phone_number ?? "",
    body: payload?.text ?? "",
    providerSid: payload?.id ?? null,
  };
}
