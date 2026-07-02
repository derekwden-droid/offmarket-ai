// lib/scoring/opportunity.test.ts
import { describe, expect, it } from "vitest";
import { scoreParcel, type DimensionKey, type ParcelSignals, DIMENSION_WEIGHTS, SIGNAL_REGISTRY, DIMENSION_ORDER } from "./opportunity";

type Scored = ReturnType<typeof scoreParcel>;

const dim = (r: Scored, k: DimensionKey) => {
  const found = r.dimensions.find((d) => d.dimension === k);
  if (!found) throw new Error(`dimension ${k} not found`);
  return found;
};

describe("opportunity scoring", () => {
  it("returns INSUFFICIENT_DATA when no signals are present", () => {
    const r = scoreParcel({});
    expect(r.confidence).toBe(0);
    expect(r.score).toBe(0);
    expect(r.grade).toBe("INSUFFICIENT_DATA");
  });

  it("scores a strong off-market land parcel highly", () => {
    const signals: ParcelSignals = {
      ownershipDurationYears: 28,
      absenteeOwner: true,
      ownerDistanceMiles: 900,
      inheritedOrProbate: true,
      taxDelinquent: false,
      portfolioParcelCount: 4,
      adjacentDevelopmentActive: true,
      utilityExpansionNearby: true,
      plannedRoadProject: true,
      inGrowthCorridor: true,
      listedOnMLS: false,
      listedOnLandMarketplace: false,
      atAuction: false,
      pendingZoningChange: true,
      densityIncreaseAllowed: true,
      hasRoadFrontage: true,
      lastSaleStalenessYears: 28,
      assessedToMarketRatio: 0.5,
      belowCorridorMedianPPA: true,
    };
    const r = scoreParcel(signals);
    expect(r.score).toBeGreaterThan(70);
    expect(r.confidence).toBeGreaterThan(0.5);
    expect(r.grade).toBe("A");
    expect(r.topContributors.length).toBeGreaterThan(0);
  });

  it("inverts competition: a known listing lowers the competition score", () => {
    const quiet: ParcelSignals = { listedOnMLS: false, listedOnLandMarketplace: false };
    const listed: ParcelSignals = { listedOnMLS: true, listedOnLandMarketplace: false };
    expect(dim(scoreParcel(listed), "competition").score).toBeLessThan(
      dim(scoreParcel(quiet), "competition").score,
    );
  });

  it("distinguishes unknown competition from known-low competition via confidence", () => {
    const unknown = dim(scoreParcel({}), "competition");
    const knownLow = dim(scoreParcel({ listedOnMLS: false }), "competition");
    expect(unknown.confidence).toBe(0);
    expect(knownLow.confidence).toBeGreaterThan(0);
  });

  it("has no constant dimension — each responds to its own inputs", () => {
    const cases: Array<[DimensionKey, ParcelSignals, ParcelSignals]> = [
      ["sellerProbability", { ownershipDurationYears: 2 }, { ownershipDurationYears: 30 }],
      ["hiddenValue", { inGrowthCorridor: false }, { inGrowthCorridor: true }],
      ["developmentPotential", { pendingZoningChange: false }, { pendingZoningChange: true }],
      ["pricingInefficiency", { lastSaleStalenessYears: 5 }, { lastSaleStalenessYears: 40 }],
    ];
    for (const [k, low, high] of cases) {
      expect(dim(scoreParcel(high), k).score).toBeGreaterThan(dim(scoreParcel(low), k).score);
    }
  });

  it("raises overall confidence as more signals are supplied", () => {
    const sparse = scoreParcel({ ownershipDurationYears: 20 });
    const rich = scoreParcel({
      ownershipDurationYears: 20,
      absenteeOwner: true,
      inheritedOrProbate: true,
      inGrowthCorridor: true,
      pendingZoningChange: true,
      lastSaleStalenessYears: 25,
    });
    expect(rich.confidence).toBeGreaterThan(sparse.confidence);
  });

  it("surfaces the highest-impact missing signals to source next", () => {
    const r = scoreParcel({ ownershipDurationYears: 20 });
    expect(r.topMissingSignals.length).toBeGreaterThan(0);
    for (let i = 1; i < r.topMissingSignals.length; i += 1) {
      expect(r.topMissingSignals[i - 1].potentialImpact).toBeGreaterThanOrEqual(
        r.topMissingSignals[i].potentialImpact,
      );
    }
  });

  it("has valid weight sums", () => {
    const dimSum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(dimSum).toBeCloseTo(1, 5);

    for (const d of DIMENSION_ORDER) {
      const w = SIGNAL_REGISTRY.filter((s) => s.dimension === d).reduce((a, s) => a + s.weight, 0);
      expect(w).toBeCloseTo(1, 5);
    }
  });

  it("treats explicit false as known-negative, not unknown", () => {
    const withFalse = scoreParcel({ listedOnMLS: false });
    const withNull = scoreParcel({});
    expect(dim(withFalse, "competition").confidence).toBeGreaterThan(
      dim(withNull, "competition").confidence,
    );
  });
});
