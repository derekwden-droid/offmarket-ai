import { describe, it, expect } from "vitest";
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
} from "@/lib/unsubscribe";

const SECRET = "unsub-secret";

describe("unsubscribe token", () => {
  it("verifies a correctly-signed token", () => {
    const token = signUnsubscribeToken("Owner@Email.com", SECRET);
    expect(verifyUnsubscribeToken("owner@email.com", token, SECRET)).toBe(true);
  });

  it("is case/whitespace-insensitive on the email (same key)", () => {
    const a = signUnsubscribeToken("  OWNER@email.com ", SECRET);
    const b = signUnsubscribeToken("owner@email.com", SECRET);
    expect(a).toBe(b);
  });

  it("rejects a tampered email", () => {
    const token = signUnsubscribeToken("owner@email.com", SECRET);
    expect(verifyUnsubscribeToken("someone@else.com", token, SECRET)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const token = signUnsubscribeToken("owner@email.com", SECRET);
    expect(verifyUnsubscribeToken("owner@email.com", token, "other")).toBe(false);
  });

  it("fails closed when secret or token is missing", () => {
    const token = signUnsubscribeToken("owner@email.com", SECRET);
    expect(verifyUnsubscribeToken("owner@email.com", token, undefined)).toBe(false);
    expect(verifyUnsubscribeToken("owner@email.com", null, SECRET)).toBe(false);
  });

  it("builds a normalized unsubscribe URL with a valid token", () => {
    const url = buildUnsubscribeUrl("https://app.example.com/", "Owner@Email.com", SECRET);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/unsubscribe");
    expect(parsed.searchParams.get("e")).toBe("owner@email.com");
    expect(
      verifyUnsubscribeToken("owner@email.com", parsed.searchParams.get("t"), SECRET),
    ).toBe(true);
  });
});
