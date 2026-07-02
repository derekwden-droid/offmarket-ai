// lib/services/vacancy.ts
import "server-only";

import { DealStage, Prisma, VacancyStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  gatherVacancyEvidence,
  type ParcelReference,
} from "@/lib/providers/parcel-intelligence";
import {
  computeVacancyConsensus,
  type AssessorSignal,
  type VacancyConsensusResult,
} from "@/lib/services/vacancy-consensus";
import type { VerifyVacancyInput } from "@/lib/validations";

export interface VerifyVacancyResult extends VacancyConsensusResult {
  propertyId: string;
  verificationId: string;
  dealStage: DealStage;
  dealStageChanged: boolean;
}

function deriveNextStage(
  current: DealStage,
  status: VacancyStatus,
): DealStage | null {
  if (status === VacancyStatus.NOT_VACANT) {
    return current === DealStage.DEAD ? null : DealStage.DEAD;
  }
  if (
    status === VacancyStatus.CONFIRMED_VACANT ||
    status === VacancyStatus.PROBABLE_VACANT
  ) {
    if (current === DealStage.INGESTED || current === DealStage.ENRICHED) {
      return DealStage.VERIFIED_VACANT;
    }
  }
  return null;
}

export async function verifyPropertyVacancy(
  input: VerifyVacancyInput,
): Promise<VerifyVacancyResult | null> {
  const property = await prisma.property.findUnique({
    where: { id: input.propertyId },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      apn: true,
      lat: true,
      lng: true,
      parcelGeometry: true,
      landUseCode: true,
      dealStage: true,
      vacancyVerification: { select: { assessorVacantFlag: true } },
    },
  });

  if (!property) return null;

  const override = input.parcelOverride;

  const ref: ParcelReference = {
    propertyId: property.id,
    lat: override?.lat ?? property.lat,
    lng: override?.lng ?? property.lng,
    apn: override?.apn ?? property.apn,
    parcelGeometry: override?.parcelGeometry ?? property.parcelGeometry ?? null,
    addressSeed: `${property.address}|${property.city}|${property.state}|${property.zip}|${property.apn ?? ""}`,
  };

  const assessor: AssessorSignal = {
    assessorVacantFlag:
      override?.assessorVacantFlag ??
      property.vacancyVerification?.assessorVacantFlag ??
      null,
    landUseCode: override?.landUseCode ?? property.landUseCode ?? null,
  };

  const evidence = await gatherVacancyEvidence(ref);
  const consensus = computeVacancyConsensus(evidence, assessor, input.config);

  const imagery = evidence.find((e) => e.kind === "IMAGERY") ?? null;
  const footprint = evidence.find(
    (e) => e.kind === "FOOTPRINT" && e.provider !== "assessor",
  );
  const anyStructureDetected = consensus.evidence.some(
    (e) => e.signal === "STRUCTURE_INDICATED",
  );

  const imageryEvidence: Prisma.InputJsonValue = {
    consensus: {
      status: consensus.vacancyStatus,
      confidence: consensus.vacancyConfidence,
      reasons: consensus.reasons,
      freshestCaptureAt: consensus.freshestCaptureAt,
      staleImagery: consensus.staleImagery,
    },
    sources: consensus.evidence.map((e) => ({
      provider: e.provider,
      kind: e.kind,
      signal: e.signal,
      confidence: e.confidence,
      capturedAt: e.capturedAt,
      simulated: e.simulated,
      detail: e.detail,
    })),
  };

  const writeData = {
    assessorVacantFlag: assessor.assessorVacantFlag,
    buildingFootprintFlag: footprint
      ? footprint.signal === "STRUCTURE_INDICATED"
      : null,
    imageryProvider: imagery?.provider ?? null,
    imageryCapturedAt: imagery?.capturedAt ? new Date(imagery.capturedAt) : null,
    structureDetected: anyStructureDetected,
    imageryEvidence,
    vacancyStatus: consensus.vacancyStatus,
    vacancyConfidence: consensus.vacancyConfidence,
    reviewRequired: consensus.reviewRequired,
    reviewReason: consensus.reviewReason,
  } satisfies Prisma.VacancyVerificationUncheckedUpdateInput;

  const nextStage = deriveNextStage(property.dealStage, consensus.vacancyStatus);

  const { verification, dealStage } = await prisma.$transaction(async (tx) => {
    const verification = await tx.vacancyVerification.upsert({
      where: { propertyId: property.id },
      update: writeData,
      create: { propertyId: property.id, ...writeData },
    });

    let dealStage = property.dealStage;
    if (nextStage && nextStage !== property.dealStage) {
      await tx.property.update({
        where: { id: property.id },
        data: { dealStage: nextStage },
      });
      dealStage = nextStage;
    }

    return { verification, dealStage };
  });

  return {
    ...consensus,
    propertyId: property.id,
    verificationId: verification.id,
    dealStage,
    dealStageChanged: dealStage !== property.dealStage,
  };
}
