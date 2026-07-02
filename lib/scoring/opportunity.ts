// lib/scoring/opportunity.ts
// OffMarket.AI — Opportunity Scoring Engine
//
// Pure, deterministic, dependency-free. Signals in -> explainable score out.
//
// IMPORTANT: `score` is a HEURISTIC on a 0..100 scale, NOT a calibrated
// probability. Do not label it "% likelihood to sell" in any user- or
// investor-facing surface until it has been fit against real sale outcomes.
// The `confidence` field reports how much of the signal set was actually
// present; a thinly-sourced score is flagged rather than presented as fact.

export type DimensionKey =
  | "sellerProbability"
  | "hiddenValue"
  | "competition"
  | "developmentPotential"
  | "pricingInefficiency";

export type SignalKey =
  | "ownershipDurationYears"
  | "absenteeOwner"
  | "ownerDistanceMiles"
  | "inheritedOrProbate"
  | "ownerEntityInactive"
  | "portfolioParcelCount"
  | "taxDelinquent"
  | "agriculturalExemptionRemoved"
  | "yearsSinceLastPermit"
  | "adjacentDevelopmentActive"
  | "utilityExpansionNearby"
  | "plannedRoadProject"
  | "inGrowthCorridor"
  | "completesAssemblage"
  | "landlockedBecomingAccessible"
  | "listedOnMLS"
  | "listedOnLandMarketplace"
  | "recentInvestorMailerActivity"
  | "atAuction"
  | "publicDistressEvent"
  | "pendingZoningChange"
  | "densityIncreaseAllowed"
  | "hasRoadFrontage"
  | "assessedToMarketRatio"
  | "lastSaleStalenessYears"
  | "belowCorridorMedianPPA";

export type SignalSource =
  | "ATTOM"
  | "BatchData"
  | "Regrid"
  | "TaxRoll"
  | "CountyGIS"
  | "CountyPlanning"
  | "MLS/Marketplace"
  | "Comps"
  | "Internal";

export type SignalAvailability =
  | "connectable-now"
  | "per-county-build"
  | "derived"
  | "aspirational";

export interface ParcelSignals {
  ownershipDurationYears?: number | null;
  absenteeOwner?: boolean | null;
  ownerDistanceMiles?: number | null;
  inheritedOrProbate?: boolean | null;
  ownerEntityInactive?: boolean | null;
  portfolioParcelCount?: number | null;
  taxDelinquent?: boolean | null;
  agriculturalExemptionRemoved?: boolean | null;
  yearsSinceLastPermit?: number | null;
  adjacentDevelopmentActive?: boolean | null;
  utilityExpansionNearby?: boolean | null;
  plannedRoadProject?: boolean | null;
  inGrowthCorridor?: boolean | null;
  completesAssemblage?: boolean | null;
  landlockedBecomingAccessible?: boolean | null;
  listedOnMLS?: boolean | null;
  listedOnLandMarketplace?: boolean | null;
  recentInvestorMailerActivity?: boolean | null;
  atAuction?: boolean | null;
  publicDistressEvent?: boolean | null;
  pendingZoningChange?: boolean | null;
  densityIncreaseAllowed?: boolean | null;
  hasRoadFrontage?: boolean | null;
  assessedToMarketRatio?: number | null;
  lastSaleStalenessYears?: number | null;
  belowCorridorMedianPPA?: boolean | null;
}

export type SignalValue = number | boolean;

interface SignalSpec {
  key: SignalKey;
  dimension: DimensionKey;
  label: string;
  weight: number;
  source: SignalSource;
  availability: SignalAvailability;
  normalize: (value: SignalValue) => number;
}

// ---------- Normalizers ----------

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const ramp = (value: SignalValue, lo: number, hi: number): number => {
  const v = typeof value === "boolean" ? (value ? 1 : 0) : value;
  if (hi === lo) return 0;
  return clamp01((v - lo) / (hi - lo));
};

const rampDown = (value: SignalValue, lo: number, hi: number): number => {
  const v = typeof value === "boolean" ? (value ? 1 : 0) : value;
  if (hi === lo) return 0;
  return clamp01(1 - (v - lo) / (hi - lo));
};

const flag = (value: SignalValue): number => (value === true ? 1 : 0);

// ---------- Weights & labels ----------

export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  sellerProbability: 0.3,
  hiddenValue: 0.25,
  competition: 0.2,
  developmentPotential: 0.15,
  pricingInefficiency: 0.1,
};

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  sellerProbability: "Seller Probability",
  hiddenValue: "Hidden Value Potential",
  competition: "Competition (lower is better)",
  developmentPotential: "Development Potential",
  pricingInefficiency: "Pricing Inefficiency",
};

const COMPETITION_DIMENSION: DimensionKey = "competition";

export const SIGNAL_REGISTRY: readonly SignalSpec[] = [
  { key: "ownershipDurationYears", dimension: "sellerProbability", label: "Long ownership tenure", weight: 0.2, source: "ATTOM", availability: "connectable-now", normalize: (v) => ramp(v, 5, 30) },
  { key: "absenteeOwner", dimension: "sellerProbability", label: "Absentee owner", weight: 0.15, source: "ATTOM", availability: "derived", normalize: flag },
  { key: "ownerDistanceMiles", dimension: "sellerProbability", label: "Owner lives far from parcel", weight: 0.1, source: "ATTOM", availability: "derived", normalize: (v) => ramp(v, 50, 500) },
  { key: "inheritedOrProbate", dimension: "sellerProbability", label: "Inherited / probate", weight: 0.15, source: "BatchData", availability: "connectable-now", normalize: flag },
  { key: "ownerEntityInactive", dimension: "sellerProbability", label: "Owning entity inactive / dissolved", weight: 0.1, source: "Internal", availability: "per-county-build", normalize: flag },
  { key: "portfolioParcelCount", dimension: "sellerProbability", label: "Portfolio consolidation candidate", weight: 0.08, source: "ATTOM", availability: "derived", normalize: (v) => ramp(v, 2, 15) },
  { key: "taxDelinquent", dimension: "sellerProbability", label: "Tax delinquent", weight: 0.1, source: "TaxRoll", availability: "connectable-now", normalize: flag },
  { key: "agriculturalExemptionRemoved", dimension: "sellerProbability", label: "Ag exemption removed", weight: 0.07, source: "TaxRoll", availability: "per-county-build", normalize: flag },
  { key: "yearsSinceLastPermit", dimension: "sellerProbability", label: "No recent improvements", weight: 0.05, source: "CountyPlanning", availability: "per-county-build", normalize: (v) => ramp(v, 5, 30) },

  { key: "adjacentDevelopmentActive", dimension: "hiddenValue", label: "Active development on adjacent parcels", weight: 0.25, source: "CountyGIS", availability: "per-county-build", normalize: flag },
  { key: "utilityExpansionNearby", dimension: "hiddenValue", label: "Utility expansion nearby", weight: 0.2, source: "CountyPlanning", availability: "per-county-build", normalize: flag },
  { key: "plannedRoadProject", dimension: "hiddenValue", label: "Planned road / infrastructure project", weight: 0.15, source: "CountyPlanning", availability: "per-county-build", normalize: flag },
  { key: "inGrowthCorridor", dimension: "hiddenValue", label: "Inside comp-plan growth corridor", weight: 0.2, source: "CountyPlanning", availability: "per-county-build", normalize: flag },
  { key: "completesAssemblage", dimension: "hiddenValue", label: "Completes an assemblage", weight: 0.15, source: "Regrid", availability: "derived", normalize: flag },
  { key: "landlockedBecomingAccessible", dimension: "hiddenValue", label: "Landlocked parcel gaining access", weight: 0.05, source: "Regrid", availability: "aspirational", normalize: flag },

  { key: "listedOnMLS", dimension: "competition", label: "Listed on MLS", weight: 0.3, source: "MLS/Marketplace", availability: "connectable-now", normalize: flag },
  { key: "listedOnLandMarketplace", dimension: "competition", label: "Listed on a land marketplace", weight: 0.25, source: "MLS/Marketplace", availability: "connectable-now", normalize: flag },
  { key: "recentInvestorMailerActivity", dimension: "competition", label: "Recent investor mailer activity", weight: 0.2, source: "Internal", availability: "aspirational", normalize: flag },
  { key: "atAuction", dimension: "competition", label: "At auction", weight: 0.15, source: "CountyPlanning", availability: "per-county-build", normalize: flag },
  { key: "publicDistressEvent", dimension: "competition", label: "Public distress event (e.g. lis pendens)", weight: 0.1, source: "CountyPlanning", availability: "per-county-build", normalize: flag },

  { key: "pendingZoningChange", dimension: "developmentPotential", label: "Pending zoning change", weight: 0.4, source: "CountyPlanning", availability: "per-county-build", normalize: flag },
  { key: "densityIncreaseAllowed", dimension: "developmentPotential", label: "Density increase allowed", weight: 0.35, source: "Regrid", availability: "per-county-build", normalize: flag },
  { key: "hasRoadFrontage", dimension: "developmentPotential", label: "Has road frontage", weight: 0.25, source: "Regrid", availability: "connectable-now", normalize: flag },

  { key: "assessedToMarketRatio", dimension: "pricingInefficiency", label: "Assessed value below market", weight: 0.4, source: "Comps", availability: "derived", normalize: (v) => rampDown(v, 0.4, 1.0) },
  { key: "lastSaleStalenessYears", dimension: "pricingInefficiency", label: "No recent arm's-length sale", weight: 0.35, source: "ATTOM", availability: "connectable-now", normalize: (v) => ramp(v, 10, 40) },
  { key: "belowCorridorMedianPPA", dimension: "pricingInefficiency", label: "Below corridor median $/acre", weight: 0.25, source: "Comps", availability: "derived", normalize: flag },
];

// ---------- Result types ----------

export interface Contribution {
  key: SignalKey;
  label: string;
  partial: number;
  points: number;
}

export interface DimensionResult {
  dimension: DimensionKey;
  label: string;
  score: number;
  confidence: number;
  contributions: Contribution[];
  missing: SignalKey[];
}

export interface MissingSignal {
  key: SignalKey;
  label: string;
  source: SignalSource;
  availability: SignalAvailability;
  potentialImpact: number;
}

export type OpportunityGrade = "A" | "B" | "C" | "D" | "INSUFFICIENT_DATA";

export interface OpportunityScore {
  score: number;
  confidence: number;
  grade: OpportunityGrade;
  dimensions: DimensionResult[];
  topContributors: Contribution[];
  topMissingSignals: MissingSignal[];
  weights: Record<DimensionKey, number>;
}

// ---------- Engine ----------

const round1 = (n: number): number => Math.round(n * 10) / 10;

export const DIMENSION_ORDER: readonly DimensionKey[] = [
  "sellerProbability",
  "hiddenValue",
  "competition",
  "developmentPotential",
  "pricingInefficiency",
];

function readSignal(signals: ParcelSignals, key: SignalKey): SignalValue | null {
  const raw = signals[key];
  return raw === undefined || raw === null ? null : raw;
}

function computeDimension(dimension: DimensionKey, signals: ParcelSignals): DimensionResult {
  const specs = SIGNAL_REGISTRY.filter((s) => s.dimension === dimension);
  const totalWeight = specs.reduce((acc, s) => acc + s.weight, 0);

  const present: { spec: SignalSpec; partial: number }[] = [];
  const missing: SignalKey[] = [];
  let presentWeight = 0;
  let weightedPartial = 0;

  for (const spec of specs) {
    const value = readSignal(signals, spec.key);
    if (value === null) {
      missing.push(spec.key);
      continue;
    }
    const partial = clamp01(spec.normalize(value));
    present.push({ spec, partial });
    presentWeight += spec.weight;
    weightedPartial += spec.weight * partial;
  }

  const rawScore01 = presentWeight > 0 ? weightedPartial / presentWeight : 0;
  const isCompetition = dimension === COMPETITION_DIMENSION;
  const score01 = isCompetition ? 1 - rawScore01 : rawScore01;
  const confidence = totalWeight > 0 ? presentWeight / totalWeight : 0;

  const contributions: Contribution[] = present
    .map(({ spec, partial }) => {
      const share = presentWeight > 0 ? (spec.weight / presentWeight) * partial * 100 : 0;
      return {
        key: spec.key,
        label: spec.label,
        partial: round1(partial),
        points: round1(isCompetition ? -share : share),
      };
    })
    .sort((a, b) => b.points - a.points);

  return {
    dimension,
    label: DIMENSION_LABELS[dimension],
    score: Math.round(score01 * 100),
    confidence: round1(confidence),
    contributions,
    missing,
  };
}

function gradeFor(score: number, confidence: number): OpportunityGrade {
  if (confidence < 0.25) return "INSUFFICIENT_DATA";
  if (score >= 75) return "A";
  if (score >= 55) return "B";
  if (score >= 35) return "C";
  return "D";
}

export function scoreParcel(signals: ParcelSignals): OpportunityScore {
  const dimensions = DIMENSION_ORDER.map((d) => computeDimension(d, signals));

  let effWeightSum = 0;
  let compositeAcc = 0;
  let confWeightSum = 0;
  let confAcc = 0;

  for (const dim of dimensions) {
    const w = DIMENSION_WEIGHTS[dim.dimension];
    confWeightSum += w;
    confAcc += w * dim.confidence;
    if (dim.confidence > 0) {
      const eff = w * dim.confidence;
      effWeightSum += eff;
      compositeAcc += eff * (dim.score / 100);
    }
  }

  const score = effWeightSum > 0 ? Math.round((compositeAcc / effWeightSum) * 100) : 0;
  const confidence = confWeightSum > 0 ? round1(confAcc / confWeightSum) : 0;

  const topContributors = dimensions
    .flatMap((d) => d.contributions)
    .filter((c) => c.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);

  const specByKey = new Map<SignalKey, SignalSpec>(SIGNAL_REGISTRY.map((s) => [s.key, s]));
  const topMissingSignals: MissingSignal[] = dimensions
    .flatMap((d) => d.missing)
    .map((key) => {
      const spec = specByKey.get(key);
      const dimWeight = spec ? DIMENSION_WEIGHTS[spec.dimension] : 0;
      const within = spec ? spec.weight : 0;
      return {
        key,
        label: spec ? spec.label : key,
        source: spec ? spec.source : "Internal",
        availability: spec ? spec.availability : "aspirational",
        potentialImpact: round1(dimWeight * within),
      } satisfies MissingSignal;
    })
    .sort((a, b) => b.potentialImpact - a.potentialImpact)
    .slice(0, 5);

  return {
    score,
    confidence,
    grade: gradeFor(score, confidence),
    dimensions,
    topContributors,
    topMissingSignals,
    weights: DIMENSION_WEIGHTS,
  };
}
