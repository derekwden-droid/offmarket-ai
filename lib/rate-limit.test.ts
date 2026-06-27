import { describe, it, expect, beforeEach } from "vitest";
import {
  rateLimit,
  clientKey,
  rateLimitConfig,
  __resetRateLimitStore,
  type RateLimitConfig,
} from "@/lib/rate-limit";

const cfg: RateLimitConfig = { enabled: true, windowMs: 1000, max: 3 };

describe("rateLimit", () => {
  beforeEach(() => __resetRateLimitStore());

  it("allows requests up to the max within a window", () => {
    const now = 1_000;
    expect(rateLimit("k", cfg, now).allowed).toBe(true);
    expect(rateLimit("k", cfg, now).allowed).toBe(true);
    expect(rateLimit("k", cfg, now).allowed).toBe(true);
  });

  it("blocks the request that exceeds the max and sets Retry-After", () => {
    const now = 1_000;
    rateLimit("k", cfg, now);
    rateLimit("k", cfg, now);
    rateLimit("k", cfg, now);
    const blocked = rateLimit("k", cfg, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const start = 1_000;
    for (let i = 0; i < 3; i += 1) rateLimit("k", cfg, start);
    expect(rateLimit("k", cfg, start).allowed).toBe(false);
    // After the window, the counter resets.
    expect(rateLimit("k", cfg, start + 1001).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const now = 1_000;
    for (let i = 0; i < 3; i += 1) rateLimit("a", cfg, now);
    expect(rateLimit("a", cfg, now).allowed).toBe(false);
    expect(rateLimit("b", cfg, now).allowed).toBe(true);
  });

  it("is a no-op when disabled", () => {
    const disabled: RateLimitConfig = { ...cfg, enabled: false };
    for (let i = 0; i < 10; i += 1) {
      expect(rateLimit("k", disabled, 1).allowed).toBe(true);
    }
  });

  it("reports remaining decreasing toward zero", () => {
    const now = 1_000;
    expect(rateLimit("k", cfg, now).remaining).toBe(2);
    expect(rateLimit("k", cfg, now).remaining).toBe(1);
    expect(rateLimit("k", cfg, now).remaining).toBe(0);
  });
});

describe("clientKey", () => {
  it("prefers the left-most x-forwarded-for hop", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" });
    expect(clientKey(h)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip then a constant", () => {
    expect(clientKey(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientKey(new Headers())).toBe("unknown");
  });
});

describe("rateLimitConfig", () => {
  it("returns safe defaults when env is unset/invalid", () => {
    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.RATE_LIMIT_MAX;
    const c = rateLimitConfig();
    expect(c.enabled).toBe(true);
    expect(c.windowMs).toBe(60_000);
    expect(c.max).toBe(60);
  });

  it("respects RATE_LIMIT_ENABLED=false", () => {
    process.env.RATE_LIMIT_ENABLED = "false";
    expect(rateLimitConfig().enabled).toBe(false);
    delete process.env.RATE_LIMIT_ENABLED;
  });
});
