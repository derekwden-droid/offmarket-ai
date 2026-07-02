// lib/scoring/from-property.ts
import type { ParcelSignals } from "./opportunity";

export interface ScoringInput {
  zip?: string | null;
  ownerMailingZip?: string | null;
  ownershipDurationYears?: number | null;
  ownerDistanceMiles?: number | null;
  absenteeOwner?: boolean | null;
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

const nn = <T>(v: T | null | undefined): T | null => (v === undefined ? null : v);

const zip5 = (z: string): string => z.slice(0, 5);

export function toSignals(row: ScoringInput): ParcelSignals {
  const derivedAbsentee: boolean | null =
    row.absenteeOwner ??
    (row.ownerMailingZip && row.zip
      ? zip5(row.ownerMailingZip) !== zip5(row.zip)
      : null);

  return {
    ownershipDurationYears: nn(row.ownershipDurationYears),
    absenteeOwner: nn(derivedAbsentee),
    ownerDistanceMiles: nn(row.ownerDistanceMiles),
    inheritedOrProbate: nn(row.inheritedOrProbate),
    ownerEntityInactive: nn(row.ownerEntityInactive),
    portfolioParcelCount: nn(row.portfolioParcelCount),
    taxDelinquent: nn(row.taxDelinquent),
    agriculturalExemptionRemoved: nn(row.agriculturalExemptionRemoved),
    yearsSinceLastPermit: nn(row.yearsSinceLastPermit),
    adjacentDevelopmentActive: nn(row.adjacentDevelopmentActive),
    utilityExpansionNearby: nn(row.utilityExpansionNearby),
    plannedRoadProject: nn(row.plannedRoadProject),
    inGrowthCorridor: nn(row.inGrowthCorridor),
    completesAssemblage: nn(row.completesAssemblage),
    landlockedBecomingAccessible: nn(row.landlockedBecomingAccessible),
    listedOnMLS: nn(row.listedOnMLS),
    listedOnLandMarketplace: nn(row.listedOnLandMarketplace),
    recentInvestorMailerActivity: nn(row.recentInvestorMailerActivity),
    atAuction: nn(row.atAuction),
    publicDistressEvent: nn(row.publicDistressEvent),
    pendingZoningChange: nn(row.pendingZoningChange),
    densityIncreaseAllowed: nn(row.densityIncreaseAllowed),
    hasRoadFrontage: nn(row.hasRoadFrontage),
    assessedToMarketRatio: nn(row.assessedToMarketRatio),
    lastSaleStalenessYears: nn(row.lastSaleStalenessYears),
    belowCorridorMedianPPA: nn(row.belowCorridorMedianPPA),
  };
}
