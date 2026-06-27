import { describe, it, expect } from "vitest";
import { parseSentryDsn, isSentryEnabled } from "@/lib/observability/sentry";

describe("parseSentryDsn", () => {
  it("parses a standard DSN into endpoint + public key", () => {
    const parsed = parseSentryDsn("https://abc123@o42.ingest.sentry.io/4509");
    expect(parsed).not.toBeNull();
    expect(parsed?.publicKey).toBe("abc123");
    expect(parsed?.endpoint).toBe("https://o42.ingest.sentry.io/api/4509/store/");
  });

  it("returns null for undefined / empty", () => {
    expect(parseSentryDsn(undefined)).toBeNull();
    expect(parseSentryDsn("")).toBeNull();
  });

  it("returns null for a malformed DSN (no project id)", () => {
    expect(parseSentryDsn("https://abc123@sentry.io/")).toBeNull();
  });

  it("returns null when there is no public key", () => {
    expect(parseSentryDsn("https://sentry.io/4509")).toBeNull();
  });
});

describe("isSentryEnabled", () => {
  it("is false when SENTRY_DSN is unset", () => {
    delete process.env.SENTRY_DSN;
    expect(isSentryEnabled()).toBe(false);
  });

  it("is true when SENTRY_DSN is a valid DSN", () => {
    process.env.SENTRY_DSN = "https://k@o1.ingest.sentry.io/7";
    expect(isSentryEnabled()).toBe(true);
    delete process.env.SENTRY_DSN;
  });
});
