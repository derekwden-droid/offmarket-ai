import { describe, expect, it } from "vitest";
import { computeVacancyConsensus, DEFAULT_VACANCY_CONSENSUS_CONFIG, type AssessorSignal, type EvidenceSource } from "@/lib/services/vacancy-consensus";
import { VacancyStatus } from "@prisma/client";

describe("vacancy consensus", () => {
  const assessorVacant: AssessorSignal = { assessorVacantFlag: true, landUseCode: null };
  const assessorNotVacant: AssessorSignal = { assessorVacantFlag: false, landUseCode: null };
  const assessorUnknown: AssessorSignal = { assessorVacantFlag: null, landUseCode: null };

  const imageryVacant = (date: string): EvidenceSource => ({
    provider: "nearmap",
    kind: "IMAGERY",
    signal: "VACANT_INDICATED",
    confidence: 0.82,
    capturedAt: date,
    simulated: false,
    detail: "No structure detected.",
  });

  const imageryStructure = (date: string): EvidenceSource => ({
    provider: "nearmap",
    kind: "IMAGERY",
    signal: "STRUCTURE_INDICATED",
    confidence: 0.9,
    capturedAt: date,
    simulated: false,
    detail: "Building detected.",
  });

  const footprintVacant: EvidenceSource = {
    provider: "footprint:arcgis",
    kind: "FOOTPRINT",
    signal: "VACANT_INDICATED",
    confidence: 0.7,
    capturedAt: null,
    simulated: false,
    detail: "No intersect.",
  };

  const footprintStructure: EvidenceSource = {
    provider: "footprint:arcgis",
    kind: "FOOTPRINT",
    signal: "STRUCTURE_INDICATED",
    confidence: 0.85,
    capturedAt: null,
    simulated: false,
    detail: "Intersect found.",
  };

  it("vetoes to NOT_VACANT on confident structure signal", () => {
    const r = computeVacancyConsensus([imageryStructure("2026-01-01")], assessorUnknown);
    expect(r.vacancyStatus).toBe(VacancyStatus.NOT_VACANT);
    expect(r.reviewRequired).toBe(false);
  });

  it("returns CONFIRMED_VACANT when two sources agree and imagery is fresh", () => {
    const r = computeVacancyConsensus(
      [imageryVacant("2026-06-01"), footprintVacant],
      assessorUnknown,
    );
    expect(r.vacancyStatus).toBe(VacancyStatus.CONFIRMED_VACANT);
    expect(r.reviewRequired).toBe(false);
  });

  it("returns PROBABLE_VACANT when imagery is stale", () => {
    const r = computeVacancyConsensus(
      [imageryVacant("2024-01-01"), footprintVacant],
      assessorUnknown,
      { imageryMaxAgeDays: 365 },
      new Date("2026-07-01"),
    );
    expect(r.vacancyStatus).toBe(VacancyStatus.PROBABLE_VACANT);
    expect(r.reviewRequired).toBe(true);
    expect(r.staleImagery).toBe(true);
  });

  it("returns UNCERTAIN when sources disagree", () => {
    const r = computeVacancyConsensus(
      [imageryVacant("2026-06-01"), footprintStructure],
      assessorUnknown,
    );
    expect(r.vacancyStatus).toBe(VacancyStatus.UNCERTAIN);
    expect(r.reviewRequired).toBe(true);
  });

  it("returns UNKNOWN with no evidence", () => {
    const r = computeVacancyConsensus([], assessorUnknown);
    expect(r.vacancyStatus).toBe(VacancyStatus.UNKNOWN);
    expect(r.reviewRequired).toBe(true);
  });

  it("assessor vacant flag contributes to consensus", () => {
    const r = computeVacancyConsensus([imageryVacant("2026-06-01")], assessorVacant);
    expect(r.vacancyStatus).toBe(VacancyStatus.PROBABLE_VACANT);
    expect(r.reviewRequired).toBe(true);
  });

  it("assessor not-vacant flag vetoes when confident", () => {
    const r = computeVacancyConsensus([imageryVacant("2026-06-01")], assessorNotVacant);
    expect(r.vacancyStatus).toBe(VacancyStatus.NOT_VACANT);
    expect(r.reviewRequired).toBe(false);
  });
});
