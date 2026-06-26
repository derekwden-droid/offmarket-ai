import { describe, it, expect } from "vitest";
import {
  generateKeyPairSync,
  sign as edSign,
  type KeyObject,
} from "node:crypto";
import {
  computeTwilioSignature,
  verifyTwilioSignature,
  verifyTelnyxSignature,
  parseTwilioInbound,
  parseTelnyxInbound,
} from "@/lib/webhooks/inbound-sms";

// --------------------------------------------------------------------------
// Twilio — HMAC-SHA1 over (URL + sorted params), base64.
// --------------------------------------------------------------------------

describe("Twilio signature", () => {
  const url = "https://app.offmarket.ai/api/inbound/sms";
  const token = "twilio-test-auth-token";
  const params = { From: "+13055551234", To: "+13055550000", Body: "STOP", MessageSid: "SM1" };

  it("verifies a correctly-signed request", () => {
    const signature = computeTwilioSignature(url, params, token);
    expect(verifyTwilioSignature({ url, params, signature, authToken: token })).toBe(true);
  });

  it("rejects a tampered body", () => {
    const signature = computeTwilioSignature(url, params, token);
    const tampered = { ...params, Body: "BUY NOW" };
    expect(verifyTwilioSignature({ url, params: tampered, signature, authToken: token })).toBe(false);
  });

  it("rejects the wrong auth token", () => {
    const signature = computeTwilioSignature(url, params, token);
    expect(verifyTwilioSignature({ url, params, signature, authToken: "wrong" })).toBe(false);
  });

  it("fails closed when token or signature is missing", () => {
    const signature = computeTwilioSignature(url, params, token);
    expect(verifyTwilioSignature({ url, params, signature, authToken: undefined })).toBe(false);
    expect(verifyTwilioSignature({ url, params, signature: null, authToken: token })).toBe(false);
  });

  it("parses the inbound shape", () => {
    expect(parseTwilioInbound(params)).toEqual({
      provider: "twilio",
      from: "+13055551234",
      to: "+13055550000",
      body: "STOP",
      providerSid: "SM1",
    });
  });
});

// --------------------------------------------------------------------------
// Telnyx — Ed25519 over `${timestamp}|${rawBody}`.
// --------------------------------------------------------------------------

/** Export the raw 32-byte Ed25519 public key as base64 (Telnyx's format). */
function rawPublicKeyBase64(publicKey: KeyObject): string {
  const der = publicKey.export({ format: "der", type: "spki" });
  return der.subarray(der.length - 32).toString("base64");
}

describe("Telnyx signature", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyBase64 = rawPublicKeyBase64(publicKey);
  const rawBody = JSON.stringify({
    data: { payload: { from: { phone_number: "+13055551234" }, to: [{ phone_number: "+13055550000" }], text: "STOP", id: "msg_1" } },
  });
  const nowSec = 1_900_000_000;
  const timestamp = String(nowSec);

  function signTelnyx(ts: string, body: string): string {
    return edSign(null, Buffer.from(`${ts}|${body}`, "utf8"), privateKey).toString("base64");
  }

  it("verifies a correctly-signed delivery", () => {
    const signature = signTelnyx(timestamp, rawBody);
    expect(
      verifyTelnyxSignature({ rawBody, signature, timestamp, publicKeyBase64, nowSec }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const signature = signTelnyx(timestamp, rawBody);
    expect(
      verifyTelnyxSignature({ rawBody: rawBody + " ", signature, timestamp, publicKeyBase64, nowSec }),
    ).toBe(false);
  });

  it("rejects a stale timestamp (replay window)", () => {
    const signature = signTelnyx(timestamp, rawBody);
    expect(
      verifyTelnyxSignature({ rawBody, signature, timestamp, publicKeyBase64, nowSec: nowSec + 10_000 }),
    ).toBe(false);
  });

  it("rejects the wrong public key", () => {
    const other = generateKeyPairSync("ed25519");
    const signature = signTelnyx(timestamp, rawBody);
    expect(
      verifyTelnyxSignature({
        rawBody,
        signature,
        timestamp,
        publicKeyBase64: rawPublicKeyBase64(other.publicKey),
        nowSec,
      }),
    ).toBe(false);
  });

  it("fails closed when key, signature, or timestamp is missing", () => {
    const signature = signTelnyx(timestamp, rawBody);
    expect(verifyTelnyxSignature({ rawBody, signature, timestamp, publicKeyBase64: undefined, nowSec })).toBe(false);
    expect(verifyTelnyxSignature({ rawBody, signature: null, timestamp, publicKeyBase64, nowSec })).toBe(false);
    expect(verifyTelnyxSignature({ rawBody, signature, timestamp: null, publicKeyBase64, nowSec })).toBe(false);
  });

  it("parses the inbound shape", () => {
    expect(parseTelnyxInbound(JSON.parse(rawBody))).toEqual({
      provider: "telnyx",
      from: "+13055551234",
      to: "+13055550000",
      body: "STOP",
      providerSid: "msg_1",
    });
  });
});
