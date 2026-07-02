// lib/services/vacancy-consensus.ts
import { VacancyStatus } from "@prisma/client";

import type { EvidenceSource } from "@/lib/providers/parcel-intelligence";

export interface VacancyConsensusConfig {
  imageryMaxAgeDays: number;
  minConfidenceToConfirm: number;
  structureVetoConfidence: number;
}

export const DEFAULT_VACANCY_CONSENSUS_CONFIG: VacancyConsensusConfig = {
  imageryMaxAgeDays: 365,
  minConfidenceToConfirm: 0.8,
  structureVetoConfidence: 0.6,
};

export interface AssessorSignal {
  assessorVacantFlag: boolean | null;
  landUseCode: string | null;
}

export interface VacancyConsensusResult {
  vacancyStatus: VacancyStatus;
  vacancyConfidence: number;
  reviewRequired: boolean;
  reviewReason: string | null;
  reasons: string[];
  freshestCaptureAt: string | null;
  staleImagery: boolean;
  evidence: EvidenceSource[];
}

const WEIGHTS: Record<EvidenceSource["kind"], number> = {
  FOOTPRINT: 0.45,
  IMAGERY: 0.4,
};
const ASSESSOR_WEIGHT = 0.25;
const STALE_IMAGERY_FACTOR = 0.4;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function ageInDays(iso: string, nowMs: number): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (nowMs - t) / 86_400_000;
}

function assessorToEvidence(assessor: AssessorSignal): EvidenceSource | null {
  const code = assessor.landUseCode?.toLowerCase() ?? "";
  const codeSaysVacant = code.includes("vacant") || code.includes("unimproved");

  if (assessor.assessorVacantFlag === true || codeSaysVacant) {
    return {
      provider: "assessor",
      kind: "FOOTPRINT",
      signal: "VACANT_INDICATED",
      confidence: 0.6,
      capturedAt: null,
      simulated: false,
      detail: assessor.assessorVacantFlag === true
        ? "Assessor flags parcel as vacant."
        : `Assessor land-use code "${assessor.landUseCode}" implies vacant/unimproved.`,
    };
  }

  if (assessor.assessorVacantFlag === false) {
    return {
      provider: "assessor",
      kind: "FOOTPRINT",
      signal: "STRUCTURE_INDICATED",
      confidence: 0.55,
      capturedAt: null,
      simulated: false,
      detail: "Assessor flags parcel as improved (not vacant).",
    };
  }

  return null;
}

export function computeVacancyConsensus(
  evidence: EvidenceSource[],
  assessor: AssessorSignal,
  overrides?: Partial<VacancyConsensusConfig>,
  now: Date = new Date(),
): VacancyConsensusResult {
  const config: VacancyConsensusConfig = {
    ...DEFAULT_VACANCY_CONSENSUS_CONFIG,
    ...overrides,
  };

  const assessorEvidence = assessorToEvidence(assessor);
  const allEvidence: EvidenceSource[] = assessorEvidence
    ? [...evidence, assessorEvidence]
    : [...evidence];

  const reasons: string[] = [];

  const imageryDates = allEvidence
    .filter((e) => e.kind === "IMAGERY" && e.capturedAt)
    .map((e) => e.capturedAt as string)
    .sort()
    .reverse();
  const freshestCaptureAt = imageryDates[0] ?? null;
  const freshestAge = freshestCaptureAt ? ageInDays(freshestCaptureAt, now.getTime()) : null;
  const staleImagery =
    freshestAge === null ? true : freshestAge > config.imageryMaxAgeDays;

  const veto = allEvidence.find(
    (e) =>
      e.signal === "STRUCTURE_INDICATED" &&
      e.confidence >= config.structureVetoConfidence,
  );
  if (veto) {
    reasons.push(`${veto.provider}: ${veto.detail}`);
    return {
      vacancyStatus: VacancyStatus.NOT_VACANT,
      vacancyConfidence: round(veto.confidence),
      reviewRequired: false,
      reviewReason: null,
      reasons,
      freshestCaptureAt,
      staleImagery,
      evidence: allEvidence,
    };
  }

  let weightedSum = 0;
  let weightTotal = 0;
  let corroboration = 0;

  for (const e of allEvidence) {
    if (e.signal === "INCONCLUSIVE") {
      reasons.push(`${e.provider}: ${e.detail}`);
      continue;
    }

    let weight = e.provider === "assessor" ? ASSESSOR_WEIGHT : WEIGHTS[e.kind];
    if (e.kind === "IMAGERY" && staleImagery) {
      weight *= STALE_IMAGERY_FACTOR;
    }

    const direction = e.signal === "VACANT_INDICATED" ? 1 : -1;
    weightedSum += direction * e.confidence * weight;
    weightTotal += weight;
    if (e.provider !== "assessor") corroboration += 1;

    reasons.push(`${e.provider}: ${e.detail}`);
  }

  if (weightTotal === 0) {
    return {
      vacancyStatus: VacancyStatus.UNKNOWN,
      vacancyConfidence: 0,
      reviewRequired: true,
      reviewReason: "No usable vacancy evidence was available.",
      reasons,
      freshestCaptureAt,
      staleImagery,
      evidence: allEvidence,
    };
  }

  const aggregate = weightedSum / weightTotal;
  const magnitude = clamp01(Math.abs(aggregate));

  if (aggregate <= -0.3) {
    return {
      vacancyStatus: VacancyStatus.NOT_VACANT,
      vacancyConfidence: round(magnitude),
      reviewRequired: false,
      reviewReason: null,
      reasons,
      freshestCaptureAt,
      staleImagery,
      evidence: allEvidence,
    };
  }

  if (aggregate < 0.3) {
    return {
      vacancyStatus: VacancyStatus.UNCERTAIN,
      vacancyConfidence: round(magnitude),
      reviewRequired: true,
      reviewReason: "Sources disagree or evidence is weak; manual review required.",
      reasons,
      freshestCaptureAt,
      staleImagery,
      evidence: allEvidence,
    };
  }

  const confirmable =
    magnitude >= config.minConfidenceToConfirm &&
    corroboration >= 2 &&
    !staleImagery;

  if (confirmable) {
    return {
      vacancyStatus: VacancyStatus.CONFIRMED_VACANT,
      vacancyConfidence: round(magnitude),
      reviewRequired: false,
      reviewReason: null,
      reasons,
      freshestCaptureAt,
      staleImagery,
      evidence: allEvidence,
    };
  }

  const reviewReason = staleImagery
    ? `Vacant-leaning, but most recent imagery is stale (>${config.imageryMaxAgeDays}d) or undated.`
    : corroboration < 2
      ? "Vacant-leaning, but only one independent source corroborates."
      : "Vacant-leaning, but below confirmation confidence.";

  return {
    vacancyStatus: VacancyStatus.PROBABLE_VACANT,
    vacancyConfidence: round(magnitude),
    reviewRequired: true,
    reviewReason,
    reasons,
    freshestCaptureAt,
    staleImagery,
    evidence: allEvidence,
  };
}
