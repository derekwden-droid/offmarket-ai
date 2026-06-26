import { describe, it, expect } from "vitest";
import { mapWithConcurrency, chunk } from "@/lib/concurrency";

describe("mapWithConcurrency()", () => {
  it("preserves input order regardless of settle order", async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      await new Promise((r) => setTimeout(r, (5 - n) * 5));
      return n * 10;
    });
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("returns an empty array for empty input", async () => {
    expect(await mapWithConcurrency([], 4, async (n) => n)).toEqual([]);
  });
});

describe("chunk()", () => {
  it("splits into contiguous chunks with a trailing remainder", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns one chunk when size exceeds length", () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it("collapses to a single chunk when size <= 0", () => {
    expect(chunk([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
    expect(chunk([], 0)).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });
});
