import { describe, it, expect } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "@/lib/webhook";

const SECRET = "test-webhook-secret";
const NOW = 1_700_000_000;
const RAW = JSON.stringify({ properties: [{ address: "1 Main St" }] });

function signed(timestamp = NOW): { signature: string; timestamp: string } {
  return {
    signature: `sha256=${signWebhookPayload(RAW, SECRET, timestamp)}`,
    timestamp: String(timestamp),
  };
}

describe("verifyWebhookSignature()", () => {
  it("accepts a correctly signed, in-window request", () => {
    const { signature, timestamp } = signed();
    const result = verifyWebhookSignature({
      rawBody: RAW, signature, timestamp, secret: SECRET, nowSec: NOW,
    });
    expect(result.valid).toBe(true);
  });

  it("accepts a bare hex signature without the sha256= prefix", () => {
    const result = verifyWebhookSignature({
      rawBody: RAW,
      signature: signWebhookPayload(RAW, SECRET, NOW),
      timestamp: String(NOW),
      secret: SECRET,
      nowSec: NOW,
    });
    expect(result.valid).toBe(true);
  });

  it("fails closed when the secret is unset", () => {
    const { signature, timestamp } = signed();
    const result = verifyWebhookSignature({
      rawBody: RAW, signature, timestamp, secret: undefined, nowSec: NOW,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a missing signature or timestamp", () => {
    expect(
      verifyWebhookSignature({ rawBody: RAW, signature: null, timestamp: String(NOW), secret: SECRET, nowSec: NOW }).valid,
    ).toBe(false);
    expect(
      verifyWebhookSignature({ rawBody: RAW, signature: "sha256=abc", timestamp: null, secret: SECRET, nowSec: NOW }).valid,
    ).toBe(false);
  });

  it("rejects a tampered body", () => {
    const { signature, timestamp } = signed();
    const result = verifyWebhookSignature({
      rawBody: RAW + "tampered", signature, timestamp, secret: SECRET, nowSec: NOW,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a replayed (stale) timestamp outside tolerance", () => {
    const { signature, timestamp } = signed(NOW - 10_000);
    const result = verifyWebhookSignature({
      rawBody: RAW, signature, timestamp, secret: SECRET, nowSec: NOW, toleranceSec: 300,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const result = verifyWebhookSignature({
      rawBody: RAW,
      signature: `sha256=${signWebhookPayload(RAW, "wrong-secret", NOW)}`,
      timestamp: String(NOW),
      secret: SECRET,
      nowSec: NOW,
    });
    expect(result.valid).toBe(false);
  });
});
