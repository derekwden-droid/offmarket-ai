import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { extractApiToken, isAuthorizedApiRequest } from "@/lib/auth";

const SECRET = "test-internal-secret-0123456789";

describe("extractApiToken", () => {
  it("reads a Bearer token", () => {
    expect(extractApiToken(new Headers({ authorization: `Bearer ${SECRET}` }))).toBe(
      SECRET,
    );
  });

  it("reads an x-api-key header", () => {
    expect(extractApiToken(new Headers({ "x-api-key": SECRET }))).toBe(SECRET);
  });

  it("returns null when no credentials are present", () => {
    expect(extractApiToken(new Headers())).toBeNull();
  });

  it("returns null for an empty Bearer token", () => {
    expect(extractApiToken(new Headers({ authorization: "Bearer " }))).toBeNull();
  });
});

describe("isAuthorizedApiRequest", () => {
  const original = process.env.INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = SECRET;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.INTERNAL_API_SECRET;
    } else {
      process.env.INTERNAL_API_SECRET = original;
    }
  });

  it("rejects a request with no credentials", () => {
    expect(isAuthorizedApiRequest(new Headers())).toBe(false);
  });

  it("rejects an incorrect secret", () => {
    expect(
      isAuthorizedApiRequest(new Headers({ authorization: "Bearer wrong-secret" })),
    ).toBe(false);
  });

  it("accepts the correct secret via Bearer", () => {
    expect(
      isAuthorizedApiRequest(new Headers({ authorization: `Bearer ${SECRET}` })),
    ).toBe(true);
  });

  it("accepts the correct secret via x-api-key", () => {
    expect(isAuthorizedApiRequest(new Headers({ "x-api-key": SECRET }))).toBe(true);
  });

  it("fails closed when INTERNAL_API_SECRET is unset", () => {
    delete process.env.INTERNAL_API_SECRET;
    expect(
      isAuthorizedApiRequest(new Headers({ authorization: `Bearer ${SECRET}` })),
    ).toBe(false);
  });
});
