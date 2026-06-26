import "server-only";
import type { Channel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ConsentRecordInput } from "@/lib/validations";
import { getComplianceConfig } from "@/lib/services/compliance-config";

/**
 * Consent service.
 *
 * Records prior express written consent per (property, channel) and answers the
 * send-time question "may we contact this property on this channel?". When the
 * caller omits `consentTextVersion`, we stamp the version currently configured
 * in ComplianceConfig so every stored record points at a real, attorney-
 * reviewed consent string — never an empty or guessed version.
 */

export class ConsentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsentConfigError";
  }
}

export async function recordConsent(input: ConsentRecordInput) {
  let version = input.consentTextVersion;
  if (!version) {
    const config = await getComplianceConfig();
    if (!config) {
      throw new ConsentConfigError(
        "No ComplianceConfig set; cannot resolve consentTextVersion.",
      );
    }
    version = config.consentTextVersion;
  }

  return prisma.consentRecord.create({
    data: {
      propertyId: input.propertyId,
      channel: input.channel,
      source: input.source,
      consentTextVersion: version,
      ipAddress: input.ipAddress ?? null,
    },
  });
}

/** True when at least one consent record exists for (property, channel). */
export async function hasConsent(
  propertyId: string,
  channel: Channel,
): Promise<boolean> {
  const count = await prisma.consentRecord.count({
    where: { propertyId, channel },
  });
  return count > 0;
}

/** Most recent consent records for the dashboard view. */
export async function listConsentRecords(limit = 100) {
  return prisma.consentRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      propertyId: true,
      channel: true,
      source: true,
      consentTextVersion: true,
      createdAt: true,
    },
  });
}
