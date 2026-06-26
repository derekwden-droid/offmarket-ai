import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  normalizeEmail,
  normalizeRecipient,
} from "@/lib/compliance/normalize";

describe("normalizePhone", () => {
  it("formats a 10-digit US number to E.164", () => {
    expect(normalizePhone("(305) 555-1234")).toBe("+13055551234");
    expect(normalizePhone("305.555.1234")).toBe("+13055551234");
    expect(normalizePhone("3055551234")).toBe("+13055551234");
  });

  it("handles an 11-digit leading-1 number", () => {
    expect(normalizePhone("1 305 555 1234")).toBe("+13055551234");
  });

  it("preserves an explicit + prefix", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("collapses formatting variants to one stable key", () => {
    const a = normalizePhone("+1 (305) 555-1234");
    const b = normalizePhone("3055551234");
    expect(a).toBe(b);
  });

  it("returns null for too-few digits", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Owner@Email.COM ")).toBe("owner@email.com");
  });
  it("rejects non-email shapes", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
  });
});

describe("normalizeRecipient", () => {
  it("routes by channel", () => {
    expect(normalizeRecipient("3055551234", "SMS")).toBe("+13055551234");
    expect(normalizeRecipient("X@Y.com", "EMAIL")).toBe("x@y.com");
  });
  it("returns null for invalid input (gate treats as block)", () => {
    expect(normalizeRecipient("nope", "SMS")).toBeNull();
    expect(normalizeRecipient("nope", "EMAIL")).toBeNull();
  });
});
